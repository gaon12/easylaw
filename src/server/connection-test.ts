import "server-only";
import type { LawApi } from "@/lib/law-api/client";
import type { LlmClient } from "@/lib/llm/client";
import { adminTest } from "@/lib/strings";

/**
 * 연결 시험. `PROGRESS.md` "설치 마법사에 연결 시험이 없다"
 *
 * 지금까지는 법제처 키나 AI 주소를 넣어도 **그 자리에서 맞는지 알 수 없었다.** 저장한 뒤
 * 판례를 하나 찾아보고, 안 나오면 키가 틀린 건지 그 판례가 공개되지 않은 건지(§5.4)
 * 구분할 방법이 없었다. 오타 하나에 며칠을 쓰게 만드는 자리다.
 *
 * **클라이언트를 인자로 받는다.** 설정에서 직접 만들면 이 함수를 시험할 방법이 없어지고,
 * 시험할 수 없는 시험 기능이 된다.
 */

type ProbeResult =
  /** 설정이 없다. 실패가 아니라 "안 켰다"다 — 둘을 같은 빨간색으로 보여 주면 안 된다. */
  | { readonly kind: "not_configured" }
  | { readonly kind: "ok"; readonly detail: string; readonly elapsedMs: number }
  | { readonly kind: "failed"; readonly message: string; readonly elapsedMs: number };

/**
 * 법제처 조회로 실제로 쓰는 판례 하나를 찾아본다.
 *
 * **결과가 0건이어도 성공이다.** 키가 맞아야 목록 응답 자체가 오고, 인증이 틀리면
 * JSON 대신 HTML 안내가 와서 `LawApiError`로 떨어진다(`law-api/client.ts`).
 * 이 시험이 보는 것은 "판례가 있는가"가 아니라 "우리 키로 말이 통하는가"다.
 */
async function probeLawApi(api: LawApi | undefined, signal?: AbortSignal): Promise<ProbeResult> {
  if (api === undefined) {
    return { kind: "not_configured" };
  }

  const started = Date.now();
  try {
    const results = await api.searchByCaseNumber(PROBE_CASE_NO, signal);
    return {
      kind: "ok",
      detail: adminTest.lawOk(PROBE_CASE_NO, results.length),
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      kind: "failed",
      message: error instanceof Error ? error.message : adminTest.unknownError,
      elapsedMs: Date.now() - started,
    };
  }
}

/** 실제로 공개돼 있는 대법원 판례. 픽스처와 같은 사건이라 결과를 눈으로 대조할 수 있다. */
const PROBE_CASE_NO = "2023다287663";

/** 시험은 짧게 끝나야 한다. 모델에게 긴 답을 시키면 시험 한 번이 곧 지출이 된다. */
const PROBE_MAX_TOKENS = 16;

/**
 * AI 연결로 아주 짧은 응답을 받아 본다.
 *
 * 문서를 넘기지 않는다 — 여기서 보려는 것은 주소·키·모델 이름이 맞는가뿐이고,
 * 판결문을 실어 보내면 시험 한 번에 토큰과 시간이 크게 든다.
 */
async function probeLlm(client: LlmClient | undefined, signal?: AbortSignal): Promise<ProbeResult> {
  if (client === undefined) {
    return { kind: "not_configured" };
  }

  const started = Date.now();
  try {
    const completion = await client.complete(
      {
        instruction: "당신은 연결 시험 대상입니다. 다른 말 없이 '준비됨'이라고만 답하세요.",
        maxOutputTokens: PROBE_MAX_TOKENS,
      },
      signal,
    );
    const elapsedMs = Date.now() - started;

    const answer = completion.text.trim();
    if (answer.length === 0) {
      // 200이 왔어도 빈 답이면 쓸 수 없다. "통했다"고 말하면 다음 단계에서 다시 막힌다.
      return { kind: "failed", message: adminTest.llmEmpty, elapsedMs };
    }

    return { kind: "ok", detail: adminTest.llmOk(client.model, answer), elapsedMs };
  } catch (error) {
    return {
      kind: "failed",
      message: error instanceof Error ? error.message : adminTest.unknownError,
      elapsedMs: Date.now() - started,
    };
  }
}

export { probeLawApi, probeLlm, PROBE_CASE_NO };
export type { ProbeResult };
