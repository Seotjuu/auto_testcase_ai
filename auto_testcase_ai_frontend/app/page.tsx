"use client";

import { useEffect, useState } from "react";

type ModelKey = "gemma" | "llama";
type ModelChoice = ModelKey | "compare";

type SingleResult = {
  test_code?: string;
  passed?: boolean;
  output?: string;
  error?: string;
  detail?: string;
};

type CompareResult = {
  compare: true;
  gemma: SingleResult;
  llama: SingleResult;
};

type GenerateResult = SingleResult | CompareResult;

type HistoryEntry = {
  id: string;
  code: string;
  model: ModelChoice;
  result: GenerateResult;
  createdAt: number;
};

const SAMPLE_CODE = `def add(a: int, b: int) -> int:
    """두 정수를 더해 반환한다."""
    return a + b`;

const HISTORY_STORAGE_KEY = "auto-testcase-history";

// 서버(Vercel 서버리스)는 파일시스템이 읽기 전용이라 이력을 서버에 저장할 수
// 없다. 브라우저 localStorage에 저장하며, 최초 방문 시에는 로컬 개발 중
// 쌓아둔 이력을 기본값으로 보여준다.
const SEED_HISTORY: HistoryEntry[] = [
  {
    id: "1e018dfa-7cd3-438a-8ff5-5e7184e044bd",
    code: `def is_balanced(expr: str) -> bool:
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    for ch in expr:
        if ch in "([{":
            stack.append(ch)
        elif ch in ")]}":
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack`,
    model: "compare",
    result: {
      compare: true,
      gemma: {
        error: "모델 서버 요청이 실패했습니다.",
        detail:
          '{"detail":"3번 재시도했지만 생성된 테스트 코드에 문법 오류가 있습니다: closing parenthesis \')\' does not match opening parenthesis \'[\' on line 3 (<unknown>, line 5)"}',
      },
      llama: {
        test_code: `import pytest

def test_balanced():
    assert is_balanced('({[]})') == True
    assert is_balanced('{[()]}')
    try:
        print(is_balanced(''))
    except Exception as e:
        pytest.fail(f'error={e}')`,
        passed: true,
        output: ".                                                                        [100%]\n1 passed in 0.02s",
      },
    },
    createdAt: 1786681547590,
  },
  {
    id: "f752c46c-63d4-43bc-9d34-9d0d479f38ee",
    code: `def celsius_to_fahrenheit(celsius: float) -> float:
    if celsius < -273.15:
        raise ValueError("temperature below absolute zero")
    return celsius * 9 / 5 + 32`,
    model: "compare",
    result: {
      compare: true,
      gemma: {
        error: "모델 서버 요청이 실패했습니다.",
        detail: '{"detail":"3번 재시도했지만 생성된 테스트 코드에 문법 오류가 있습니다: invalid syntax. Perhaps you forgot a comma? (<unknown>, line 9)"}',
      },
      llama: {
        test_code: `import pytest

def test_celsius_to_fahrenheit_normal_input():
    assert round(celsius_to_fahrenheit(0), 2) == 32.0, 'Temperature is incorrect'

def test_celsius_to_fahrenheit_negative_value_error():
    with pytest.raises(ValueError):
        celsius_to_fahrenheit(-100)

def test_celsius_to_fahrenheit_zero_temperature():
    assert celsius_to_fahrenheit(25) == -47`,
        passed: false,
        output:
          ".FF                                                                      [100%]\n================================== FAILURES ===================================\n_______________ test_celsius_to_fahrenheit_negative_value_error _______________\n\n    def test_celsius_to_fahrenheit_negative_value_error():\n>       with pytest.raises(ValueError):\nE       Failed: DID NOT RAISE <class 'ValueError'>\n\n.exec_tmp\\tmpnapdu07d_test.py:12: Failed\n_________________ test_celsius_to_fahrenheit_zero_temperature _________________\n\n    def test_celsius_to_fahrenheit_zero_temperature():\n>       assert celsius_to_fahrenheit(25) == -47\nE       assert 77.0 == -47\nE        +  where 77.0 = celsius_to_fahrenheit(25)\n\n.exec_tmp\\tmpnapdu07d_test.py:16: AssertionError\n=========================== short test summary info ===========================\nFAILED .exec_tmp/tmpnapdu07d_test.py::test_celsius_to_fahrenheit_negative_value_error\nFAILED .exec_tmp/tmpnapdu07d_test.py::test_celsius_to_fahrenheit_zero_temperature\n2 failed, 1 passed in 0.20s",
      },
    },
    createdAt: 1786681483724,
  },
  {
    id: "8e767f83-0de9-4a82-a624-3f40e25e4013",
    code: `def is_prime(n: int) -> bool:
    if n < 2:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True`,
    model: "compare",
    result: {
      compare: true,
      gemma: {
        test_code: `import pytest

@pytest.mark.parametrize('n, expected', [(2, True), (3, True), (4, False), (10, False)])
def test_is_prime(n: int, expected: bool):
    assert is_prime(n) == expected`,
        passed: true,
        output: "....                                                                     [100%]\n4 passed in 0.03s",
      },
      llama: {
        test_code: `import pytest

def test_is_prime():
    assert is_prime(2) == True
    assert is_prime(3) == True
    assert is_prime(5) == True
    with pytest.raises(ValueError):
        print(is_prime(-4))
    try:
        is_prime(1011)
    except Exception as e:
        pytest.fail(f'Exception occurred during test_is_prime() function')
pytest.main()`,
        passed: false,
        output:
          "F                                                                        [100%]\n================================== FAILURES ===================================\n________________________________ test_is_prime ________________________________\n\n    def test_is_prime():\n        assert is_prime(2) == True\n        assert is_prime(3) == True\n        assert is_prime(5) == True\n>       with pytest.raises(ValueError):\nE       Failed: DID NOT RAISE <class 'ValueError'>\n\n.exec_tmp\\tmp0ijbghrn_test.py:15: Failed\n---------------------------- Captured stdout call -----------------------------\nFalse\n=========================== short test summary info ===========================\nFAILED .exec_tmp/tmp0ijbghrn_test.py::test_is_prime - Failed: DID NOT RAISE <...\n1 failed in 0.27s",
      },
    },
    createdAt: 1786681429917,
  },
  {
    id: "afac1730-bc41-4f37-956a-af97c10d06b8",
    code: `def reverse_string(s: str) -> str:
    if not isinstance(s, str):
        raise TypeError("input must be a string")
    return s[::-1]`,
    model: "compare",
    result: {
      compare: true,
      gemma: {
        test_code: `import pytest

@pytest.mark.parametrize('input, expected', [('', ''), ('hello', 'olleh'), ('12345', '54321')])
def test_reverse_string(input_, expected):
    assert reverse_string(input_) == expected`,
        passed: false,
        output:
          "=================================== ERRORS ====================================\n_______________ ERROR collecting .exec_tmp/tmp08ar0t_k_test.py ________________\nIn test_reverse_string: function uses no argument 'input'\n=========================== short test summary info ===========================\nERROR .exec_tmp/tmp08ar0t_k_test.py - Failed: In test_reverse_string: functio...\n!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!\n1 error in 0.19s",
      },
      llama: {
        test_code: `import pytest

def test_reverse_string():
    assert reverse_string('hello') == 'olleh'
    with pytest.raises(TypeError):
        reverse_string(123)
    with pytest.raises(ValueError) as excinfo:
        reverse_string(None)
print(f'Test passed: {test_reverse_string()}')`,
        passed: false,
        output:
          "=================================== ERRORS ====================================\n_______________ ERROR collecting .exec_tmp/tmphyp5pa_u_test.py ________________\n.exec_tmp\\tmphyp5pa_u_test.py:14: in <module>\n    print(f'Test passed: {test_reverse_string()}')\n.exec_tmp\\tmphyp5pa_u_test.py:13: in test_reverse_string\n    reverse_string(None)\n.exec_tmp\\tmphyp5pa_u_test.py:3: in reverse_string\n    raise TypeError(\"input must be a string\")\nE   TypeError: input must be a string\n=========================== short test summary info ===========================\nERROR .exec_tmp/tmphyp5pa_u_test.py - TypeError: input must be a string\n!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!\n1 error in 0.33s",
      },
    },
    createdAt: 1786681405931,
  },
  {
    id: "70ef1ae6-6311-4ca2-89e7-aad336fc1bc5",
    code: `def remove_duplicates(items: list) -> list:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result`,
    model: "compare",
    result: {
      compare: true,
      gemma: {
        test_code: `import pytest

def remove_duplicates(items: list) -> list:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

@pytest.mark.parametrize('input, expected', [([1, 2, 3], [1, 2, 3]), ([], []), ([10, 'a', 5], [10, 'a', 5])])
def test_remove_duplicates(input: list, expected: list):
    assert remove_Duplicates(input) == expected`,
        passed: false,
        output:
          "FFF                                                                      [100%]\n================================== FAILURES ===================================\n__________________ test_remove_duplicates[input0-expected0] ___________________\n\ninput = [1, 2, 3], expected = [1, 2, 3]\n\n    @pytest.mark.parametrize('input, expected', [([1, 2, 3], [1, 2, 3]), ([], []), ([10, 'a', 5], [10, 'a', 5])])\n    def test_remove_duplicates(input: list, expected: list):\n>       assert remove_Duplicates(input) == expected\nE       NameError: name 'remove_Duplicates' is not defined\n\n.exec_tmp\\tmpce2ioiqa_test.py:23: NameError\n=========================== short test summary info ===========================\nFAILED .exec_tmp/tmpce2ioiqa_test.py::test_remove_duplicates[input0-expected0]\n3 failed in 0.13s",
      },
      llama: {
        test_code: `import pytest

def test_remove_duplicates():
    input_list = [1, 2, 'a', True]
    expected_result = []
    assert remove_duplicates(input_list) == expected_result

def test_remove_duplicates_empty():
    input_list = []
    result = [1, 2]
    try:
        assert remove_duplicates(input_list) == expected_result
    except Exception as e:
        pytest.skip(f'예외: {e}')`,
        passed: false,
        output:
          "Fs.                                                                      [100%]\n================================== FAILURES ===================================\n___________________________ test_remove_duplicates ____________________________\n\n    def test_remove_duplicates():\n        input_list = [1, 2, 'a', True]\n        expected_result = []\n>       assert remove_duplicates(input_list) == expected_result\nE       AssertionError: assert [1, 2, 'a'] == []\nE         \nE         Left contains 3 more items, first extra item: 1\nE         Use -v to get more diff\n\n.exec_tmp\\tmpoaxy5kdy_test.py:15: AssertionError\n=========================== short test summary info ===========================\nFAILED .exec_tmp/tmpoaxy5kdy_test.py::test_remove_duplicates - AssertionError...\n1 failed, 1 passed, 1 skipped in 0.23s",
      },
    },
    createdAt: 1786681382874,
  },
];

const MODEL_LABEL: Record<ModelChoice, string> = {
  gemma: "Gemma",
  llama: "Llama",
  compare: "Gemma + Llama 비교",
};

function isCompareResult(result: GenerateResult): result is CompareResult {
  return "compare" in result && result.compare === true;
}

const FAILURE_PATTERNS: { test: (output: string) => boolean; summary: string }[] = [
  {
    test: (o) => o.includes("DID NOT RAISE"),
    summary:
      "모델이 특정 입력에서 예외가 발생한다고 예상했지만, 실제로는 예외가 발생하지 않았습니다. (모델이 원본 함수의 예외 처리 로직을 잘못 추측함)",
  },
  {
    test: (o) => o.includes("ERROR collecting") || o.includes("ModuleNotFoundError"),
    summary:
      "테스트 파일 자체를 불러오는 데 실패했습니다. (예: 존재하지 않는 모듈을 import하거나, 데코레이터 인자 수가 맞지 않는 등 구조적 오류)",
  },
  {
    test: (o) => o.includes("AssertionError"),
    summary:
      "모델이 계산한 예상값이 실제 함수의 반환값과 다릅니다. (모델이 함수 로직을 잘못 이해하고 틀린 정답을 넣음)",
  },
  {
    test: (o) => o.includes("NameError"),
    summary:
      "생성된 테스트 코드가 정의되지 않은 변수/함수를 참조했습니다. (모델이 이전에 사용한 변수를 착각했거나 코드가 중간에 잘림)",
  },
  {
    test: (o) => o.includes("TypeError"),
    summary:
      "타입이 맞지 않는 값을 함수에 전달했거나, 잘못된 방식으로 pytest API를 사용했습니다.",
  },
  {
    test: (o) => o.includes("실행 시간 초과"),
    summary: "테스트 실행이 제한 시간(10초)을 넘겨 중단되었습니다. (무한 루프 등 비정상 코드 생성 가능성)",
  },
];

function summarizeFailure(output: string): string {
  const matched = FAILURE_PATTERNS.find((p) => p.test(output));
  return (
    matched?.summary ??
    "테스트가 예상과 다르게 동작했습니다. 아래 실행 로그에서 구체적인 원인을 확인하세요."
  );
}

const ERROR_PATTERNS: { test: (text: string) => boolean; summary: string }[] = [
  {
    test: (t) => t.includes("재시도했지만") && t.includes("문법 오류"),
    summary:
      "모델이 여러 번 재시도해도 유효한 Python 코드를 생성하지 못했습니다. (토큰이 중간에 잘리거나 괄호/들여쓰기가 깨진 경우가 많음) 보통 다시 생성하면 해결됩니다.",
  },
  {
    test: (t) => t.includes("너무 길어"),
    summary:
      "입력한 코드가 모델이 한 번에 처리할 수 있는 길이를 초과했습니다. 코드를 줄여서 다시 시도해주세요.",
  },
  {
    test: (t) => t.includes("불러오지 못했습니다"),
    summary:
      "모델 파일을 내려받거나 불러오는 데 실패했습니다. 네트워크 상태나 디스크 용량을 확인 후 다시 시도해주세요.",
  },
  {
    test: (t) => t.includes("지연되고 있습니다") || t.includes("콜드스타트"),
    summary:
      "모델 서버가 아직 준비되지 않았거나(콜드스타트) 응답이 평소보다 오래 걸리고 있습니다. 잠시 후 다시 시도해주세요.",
  },
  {
    test: (t) => t.includes("연결할 수 없습니다"),
    summary:
      "백엔드(모델 서버)에 접속할 수 없습니다. 서버가 꺼져 있거나 주소 설정이 잘못됐을 가능성이 있습니다.",
  },
  {
    test: (t) => t.includes("환경변수"),
    summary: "서버 설정(MODEL_SERVER_URL)이 비어 있습니다. 배포/실행 환경 설정을 확인해주세요.",
  },
];

function summarizeError(error: string, detail?: string): string {
  const combined = `${error} ${detail ?? ""}`;
  const matched = ERROR_PATTERNS.find((p) => p.test(combined));
  return (
    matched?.summary ??
    "요청을 처리하는 중 예상치 못한 문제가 발생했습니다. 아래 상세 내용을 확인하거나 다시 시도해주세요."
  );
}

function ResultCard({ label, result }: { label?: string; result: SingleResult }) {
  if (result.error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {label && <p className="mb-1 text-xs font-semibold uppercase opacity-70">{label}</p>}
        <p className="font-medium">{result.error}</p>
        <p className="mt-1 opacity-90">{summarizeError(result.error, result.detail)}</p>
        {result.detail && (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap opacity-80">
            {result.detail}
          </pre>
        )}
      </div>
    );
  }

  if (!result.test_code) return null;

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
      )}
      <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100">
        <code>{result.test_code}</code>
      </pre>
      <div
        className={`rounded-lg border p-4 text-sm ${
          result.passed
            ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
            : "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
        }`}
      >
        <p className="font-medium">
          실행 결과: {result.passed ? "PASS" : "FAIL / 확인 필요"}
        </p>
        {!result.passed && result.output && (
          <p className="mt-1 opacity-90">{summarizeFailure(result.output)}</p>
        )}
        {result.output && (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{result.output}</pre>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [model, setModel] = useState<ModelChoice>("gemma");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let loaded: HistoryEntry[] = [];
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      loaded = raw ? JSON.parse(raw) : SEED_HISTORY;
      if (!raw) {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(SEED_HISTORY));
      }
    } catch {
      loaded = SEED_HISTORY;
    }
    setHistory(loaded);
    // 이력이 있으면 가장 최근 항목(맨 앞, 최신순)을 복원하고,
    // 없으면 기본 SAMPLE_CODE를 그대로 둔다.
    if (loaded.length > 0) {
      const latest = loaded[0];
      setCode(latest.code);
      setModel(latest.model);
      setResult(latest.result);
    }
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/generate-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, model }),
      });
      const data: GenerateResult = await res.json();
      setResult(data);

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        code,
        model,
        result: data,
        createdAt: Date.now(),
      };

      // 브라우저 localStorage에 영속화한다(서버리스 배포 환경은 파일시스템에
      // 쓸 수 없어 서버 저장은 불가능).
      setHistory((prev) => {
        const updated = [entry, ...prev].slice(0, 200);
        try {
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    } catch {
      setResult({ error: "요청 중 알 수 없는 오류가 발생했습니다." });
    } finally {
      setLoading(false);
    }
  }

  function restoreFromHistory(entry: HistoryEntry) {
    setCode(entry.code);
    setModel(entry.model);
    setResult(entry.result);
  }

  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {}
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-none flex-1 flex-col gap-6 px-20 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            자동 테스트케이스 생성기
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Llama/Gemma 기반 모델이 입력한 Python 함수 코드에 대한 테스트케이스를
            생성합니다.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <label
                htmlFor="code"
                className="text-sm font-medium text-black dark:text-zinc-50"
              >
                테스트 대상 함수 코드 (Python)
              </label>
              <textarea
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-zinc-300 bg-white p-4 font-mono text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                placeholder="def example(): ..."
              />

              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-black dark:text-zinc-50">
                  모델 선택
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as ModelChoice)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="gemma">Gemma</option>
                  <option value="llama">Llama</option>
                  <option value="compare">Gemma + Llama 비교</option>
                </select>

                <button
                  onClick={handleGenerate}
                  disabled={loading || !code.trim()}
                  className="ml-auto rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {loading ? "생성 중..." : "테스트케이스 생성"}
                </button>
              </div>

              {loading && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  모델 서버가 콜드스타트 상태라면 최대 1분 이상 걸릴 수 있습니다.
                  {model === "compare" && " (두 모델을 동시에 호출 중입니다)"}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                  생성 이력
                </h2>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    이력 지우기
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  아직 생성 이력이 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {history.map((entry) => {
                    const failed =
                      !isCompareResult(entry.result) && entry.result.error;
                    return (
                      <li key={entry.id}>
                        <button
                          onClick={() => restoreFromHistory(entry)}
                          className="flex w-full flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
                        >
                          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>{MODEL_LABEL[entry.model]}</span>
                            <span>
                              {new Date(entry.createdAt).toLocaleTimeString("ko-KR")}
                            </span>
                          </div>
                          <code className="truncate font-mono text-zinc-800 dark:text-zinc-200">
                            {entry.code.split("\n")[0]}
                          </code>
                          {failed && (
                            <span className="text-xs text-red-600 dark:text-red-400">
                              오류 발생
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              생성된 테스트케이스
            </h2>

            {!result && !loading && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                왼쪽에 코드를 입력하고 생성 버튼을 누르면 결과가 여기에 표시됩니다.
              </p>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-zinc-200 py-16 dark:border-zinc-800">
                <svg
                  className="h-8 w-8 animate-spin text-zinc-400 dark:text-zinc-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z"
                  />
                </svg>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  테스트케이스 생성 중...
                </p>
              </div>
            )}

            {!loading && result && !isCompareResult(result) && (
              <ResultCard result={result} />
            )}

            {result && isCompareResult(result) && (
              <div className="grid grid-cols-1 gap-4">
                <ResultCard label="Gemma" result={result.gemma} />
                <ResultCard label="Llama" result={result.llama} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
