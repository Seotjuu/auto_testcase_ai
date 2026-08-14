import ast
import os
import subprocess
import sys
import tempfile
import textwrap
import threading
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from llama_cpp import Llama
from pydantic import BaseModel

# 양자화(GGUF) 모델 + llama.cpp 런타임을 사용한다. transformers+torch로 CPU에서
# 풀정밀도/bf16 추론하는 것보다 체감 3~5배 이상 빠르다.
GGUF_REPOS = {
    "gemma": os.environ.get("GEMMA_GGUF_REPO", "bartowski/gemma-2-2b-it-GGUF"),
    "llama": os.environ.get("LLAMA_GGUF_REPO", "bartowski/Llama-3.2-1B-Instruct-GGUF"),
}
GGUF_FILENAMES = {
    "gemma": os.environ.get("GEMMA_GGUF_FILE", "gemma-2-2b-it-Q4_K_M.gguf"),
    "llama": os.environ.get("LLAMA_GGUF_FILE", "Llama-3.2-1B-Instruct-Q4_K_M.gguf"),
}

EXEC_TIMEOUT_SECONDS = 10

# 시스템 기본 임시폴더(백신 실시간 감시 대상 경로 등)에 스크립트를 쓰면
# 실행이 지연될 수 있어, 프로젝트 내부에 전용 임시 디렉토리를 둔다.
EXEC_TMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".exec_tmp")
os.makedirs(EXEC_TMP_DIR, exist_ok=True)

app = FastAPI(title="Auto Testcase Model Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_llms: dict[str, Llama] = {}
_load_lock = threading.Lock()
# llama_cpp.Llama 인스턴스는 스레드 세이프하지 않다. FastAPI의 동기 엔드포인트는
# 요청마다 스레드풀에서 실행되므로, 같은 모델로 동시 요청이 들어오면 같은 인스턴스를
# 여러 스레드가 동시에 호출해 크래시/오염된 출력이 날 수 있다. 모델별 락으로 직렬화한다.
_inference_locks: dict[str, threading.Lock] = {
    key: threading.Lock() for key in ("gemma", "llama")
}


def get_llm(model_key: str) -> Llama:
    if model_key not in GGUF_REPOS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 모델입니다: {model_key}")

    if model_key not in _llms:
        with _load_lock:
            if model_key not in _llms:  # 락 대기 중 다른 스레드가 이미 로드했을 수 있음
                try:
                    _llms[model_key] = Llama.from_pretrained(
                        repo_id=GGUF_REPOS[model_key],
                        filename=GGUF_FILENAMES[model_key],
                        n_ctx=2048,
                        n_threads=os.cpu_count() or 4,
                        verbose=False,
                    )
                except Exception as exc:
                    # 네트워크 단절, HF 다운로드 실패, 디스크 부족 등 - 원본 예외를
                    # 그대로 노출하지 않고 재시도 가능함을 알려준다.
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            f"'{model_key}' 모델을 불러오지 못했습니다 "
                            f"(네트워크 또는 디스크 문제일 수 있습니다): {exc}"
                        ),
                    )
    return _llms[model_key]


class GenerateRequest(BaseModel):
    code: str
    model: Literal["gemma", "llama"] = "gemma"


class GenerateResponse(BaseModel):
    test_code: str
    passed: bool
    output: str


PROMPT_TEMPLATE = """다음 Python 함수에 대한 pytest 스타일 테스트 함수를 작성하라.
정상 입력, 경계값, 예외 상황을 포함하고, import는 필요한 것만 사용하라.
설명 없이 코드만 출력하라.

함수:
```python
{code}
```

테스트 코드:
```python
"""


def build_prompt(code: str) -> str:
    return PROMPT_TEMPLATE.format(code=code.strip())


def top_level_defined_names(code: str) -> set[str]:
    tree = ast.parse(code)
    names = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
    return names


def strip_self_imports(test_code: str, original_code: str) -> str:
    """원본 코드와 같은 파일에 이어붙이는데, 모델이 종종 원본 함수를
    별도 모듈에서 import하는 것으로 착각해 존재하지 않는 모듈을 import한다
    (예: `from add import add`). 원본에 이미 정의된 이름을 import하는
    구문은 제거한다."""
    defined = top_level_defined_names(original_code)
    if not defined:
        return test_code

    tree = ast.parse(test_code)
    kept_body = []
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            imported = {alias.name for alias in node.names}
            if imported & defined:
                continue
        elif isinstance(node, ast.Import):
            imported = {alias.name.split(".")[0] for alias in node.names}
            if imported & defined:
                continue
        kept_body.append(node)
    tree.body = kept_body
    return ast.unparse(tree)


def syntax_error_message(test_code: str) -> str | None:
    try:
        ast.parse(test_code)
        return None
    except SyntaxError as exc:
        return str(exc)


MAX_GENERATION_ATTEMPTS = 3
MAX_NEW_TOKENS = 180


def generate_valid_test_code(
    llm: Llama, model_key: str, prompt: str
) -> tuple[str, str | None]:
    """문법 오류가 나면 최대 MAX_GENERATION_ATTEMPTS번까지 재생성을 시도한다.
    소형 모델일수록(특히 클래스처럼 들여쓰기가 복잡한 입력) 가끔 문법이
    깨진 코드를 내놓는데, 같은 프롬프트를 다시 샘플링하면 성공하는 경우가
    많아 재시도가 효과적이다."""
    last_error = None
    max_tokens = MAX_NEW_TOKENS
    for _ in range(MAX_GENERATION_ATTEMPTS):
        # 같은 모델에 대한 동시 호출을 직렬화한다(llama_cpp는 스레드 세이프하지 않음).
        with _inference_locks[model_key]:
            output = llm(
                prompt,
                max_tokens=max_tokens,
                temperature=0.4,
                repeat_penalty=1.3,
                stop=["```"],
            )
        choice = output["choices"][0]
        test_code = choice["text"].strip()
        last_error = syntax_error_message(test_code)
        if last_error is None:
            return test_code, None
        if choice.get("finish_reason") == "length":
            # 토큰 예산을 다 써서 문장이 중간에 잘린 것이 문법 오류의 원인이었을
            # 가능성이 높다. 같은 예산으로 재시도하면 비슷한 지점에서 또 잘리기
            # 쉬우므로 다음 시도는 예산을 넉넉히 늘린다.
            max_tokens = min(max_tokens * 2, 512)
    return test_code, last_error


def run_generated_test(original_code: str, test_code: str) -> tuple[bool, str]:
    # original_code/test_code는 각각 이미 완결된(0-컬럼 기준) 코드이므로,
    # 통째로 다시 dedent하면 서로 다른 들여쓰기가 뒤섞여 깨진다. 그대로 이어붙인다.
    script = "\n\n".join([textwrap.dedent(original_code), textwrap.dedent(test_code)])

    with tempfile.NamedTemporaryFile(
        mode="w", suffix="_test.py", delete=False, encoding="utf-8", dir=EXEC_TMP_DIR
    ) as f:
        f.write(script)
        script_path = f.name

    try:
        # 직접 함수를 호출하는 대신 pytest를 실행해야 parametrize/fixture 등
        # 데코레이터가 붙은 테스트도 정상적으로 처리된다.
        result = subprocess.run(
            [sys.executable, "-m", "pytest", script_path, "-q"],
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT_SECONDS,
        )
        passed = result.returncode == 0
        output = (result.stdout + result.stderr).strip()
        return passed, output
    except subprocess.TimeoutExpired:
        return False, f"실행 시간 초과 ({EXEC_TIMEOUT_SECONDS}초)"
    finally:
        os.remove(script_path)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-test", response_model=GenerateResponse)
def generate_test(req: GenerateRequest):
    if not req.code.strip():
        raise HTTPException(status_code=400, detail="code 필드가 비어있습니다.")

    try:
        ast.parse(req.code)
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"입력 코드에 문법 오류가 있습니다: {exc}")

    llm = get_llm(req.model)
    prompt = build_prompt(req.code)

    # n_ctx(2048)를 넘는 프롬프트를 그대로 넣으면 llama_cpp가 예외를 던져
    # 500 스택트레이스가 그대로 노출된다. 미리 토큰 수를 확인해 400으로 처리한다.
    prompt_tokens = len(llm.tokenize(prompt.encode("utf-8")))
    if prompt_tokens + MAX_NEW_TOKENS > llm.n_ctx():
        raise HTTPException(
            status_code=400,
            detail=(
                f"입력 코드가 너무 길어 처리할 수 없습니다 "
                f"(프롬프트 토큰 {prompt_tokens}개, 최대 {llm.n_ctx() - MAX_NEW_TOKENS}개). "
                "코드를 줄여서 다시 시도해주세요."
            ),
        )

    test_code, error = generate_valid_test_code(llm, req.model, prompt)
    if error is not None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{MAX_GENERATION_ATTEMPTS}번 재시도했지만 생성된 테스트 코드에 "
                f"문법 오류가 있습니다: {error}"
            ),
        )

    test_code = strip_self_imports(test_code, req.code)
    passed, output = run_generated_test(req.code, test_code)

    return GenerateResponse(test_code=test_code, passed=passed, output=output)
