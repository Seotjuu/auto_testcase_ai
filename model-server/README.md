# model-server

Llama/Gemma 기반 자동 테스트케이스 생성 백엔드 (FastAPI). `auto_testcase_ai`(Next.js)의
`/api/generate-test` 라우트가 이 서버의 `/generate-test`를 호출합니다.

## 로컬 실행

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
uvicorn main:app --reload --port 7860
```

첫 요청 시 Hugging Face Hub에서 모델을 다운로드하므로 시간이 걸립니다.
`meta-llama` 계열 모델은 HuggingFace에서 접근 승인이 필요할 수 있으니, 필요 시
`GEMMA_MODEL_ID` / `LLAMA_MODEL_ID` 환경변수로 접근 가능한 경량 모델로 교체하세요.

## API

### `POST /generate-test`

요청:
```json
{ "code": "def add(a, b):\n    return a + b", "model": "gemma" }
```

응답:
```json
{ "test_code": "...", "passed": true, "output": "ALL_TESTS_PASSED" }
```

### `GET /health`

헬스체크용.

## Hugging Face Spaces 배포 (무료)

1. huggingface.co에서 새 Space 생성 → SDK: **Docker** 선택
2. 이 폴더(`model-server/`)의 파일들을 Space 저장소에 push
   (`Dockerfile`, `main.py`, `requirements.txt`)
3. Space가 빌드되면 `https://<space-id>.hf.space` 형태의 URL이 생김
4. `auto_testcase_ai`의 `.env.local`에 다음을 설정:
   ```
   MODEL_SERVER_URL=https://<space-id>.hf.space
   ```

무료 CPU 인스턴스는 미사용 시 슬립 상태가 되어 첫 요청이 느립니다(콜드스타트).
발표 시연 전 미리 한 번 요청을 보내 깨워두는 것을 권장합니다.

## 환경변수

| 변수 | 설명 | 기본값 |
|---|---|---|
| `GEMMA_MODEL_ID` | Gemma 모델 HuggingFace ID | `google/gemma-2-2b-it` |
| `LLAMA_MODEL_ID` | Llama 모델 HuggingFace ID | `meta-llama/Llama-3.2-1B-Instruct` |

## 안전성 참고

생성된 테스트 코드는 `subprocess`로 별도 프로세스에서 실행되며 10초 타임아웃이
걸려 있습니다. 데모/교육 목적 프로젝트이므로 프로덕션 수준의 샌드박싱(컨테이너
격리 등)은 적용되어 있지 않습니다.
