import { NextResponse } from "next/server";

const MODEL_SERVER_URL = process.env.MODEL_SERVER_URL;

type BackendResult = {
  test_code?: string;
  passed?: boolean;
  output?: string;
  error?: string;
  detail?: string;
};

async function callBackend(code: string, model: "gemma" | "llama"): Promise<BackendResult> {
  const controller = new AbortController();
  // GGUF(llama.cpp) 전환 후 웜 상태 생성은 보통 1~5초. 최초 1회 GGUF 다운로드가
  // 걸릴 수 있어 여유를 좀 둔다.
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const upstream = await fetch(`${MODEL_SERVER_URL}/generate-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, model }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return { error: "모델 서버 요청이 실패했습니다.", detail };
    }

    return await upstream.json();
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      error: aborted
        ? "모델 서버 응답이 지연되고 있습니다. (콜드스타트일 수 있음, 잠시 후 다시 시도하세요)"
        : "모델 서버에 연결할 수 없습니다.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  if (!MODEL_SERVER_URL) {
    return NextResponse.json(
      { error: "MODEL_SERVER_URL 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.code || typeof body.code !== "string") {
    return NextResponse.json(
      { error: "요청 본문에 code(string) 필드가 필요합니다." },
      { status: 400 }
    );
  }

  if (body.model === "compare") {
    const [gemma, llama] = await Promise.all([
      callBackend(body.code, "gemma"),
      callBackend(body.code, "llama"),
    ]);
    return NextResponse.json({ compare: true, gemma, llama });
  }

  const model = body.model === "llama" ? "llama" : "gemma";
  const result = await callBackend(body.code, model);

  if (result.error) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}