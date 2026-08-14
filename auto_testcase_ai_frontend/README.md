# Auto Testcase AI (Frontend)

Python 함수 코드를 입력하면 Gemma/Llama 기반 모델이 pytest 테스트케이스를 자동 생성하고, 실행 결과(PASS/FAIL)까지 바로 확인할 수 있는 웹 서비스입니다. 두 모델의 결과를 나란히 비교하는 모드도 지원합니다.

- **배포 링크**: https://autotestcaseai.vercel.app

## 주요 기능

- Python 함수 코드 입력 → 테스트케이스 자동 생성
- Gemma / Llama / 두 모델 비교 중 선택 가능
- 생성된 테스트 코드의 실제 실행 결과(PASS/FAIL) 및 실패 원인 요약 제공
- 생성 이력을 브라우저(localStorage)에 저장하여 재확인 가능

## 기술 스택

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- Vercel 서버리스 배포 (`/api/generate-test`가 백엔드 모델 서버로 요청을 중계)

## 로컬 실행

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

모델 서버 연동을 위해 `MODEL_SERVER_URL` 환경변수가 필요합니다.
