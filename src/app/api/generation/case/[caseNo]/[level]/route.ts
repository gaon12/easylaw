import { corpusDb } from "@/db/client";
import { findJudgmentByCaseNo } from "@/db/corpus/repository";
import { LEVELS } from "@/db/corpus/schema";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { PIPELINE_VERSION } from "@/server/generate";
import { caseStore } from "@/server/pipeline-store";
import { eventStreamResponse, progressStream } from "@/server/progress-stream";

/**
 * 공개 판례의 생성 진행. `PRODUCT.md` §5.3
 *
 * 스트림 자체는 `server/progress-stream.ts`에 있다 — 올린 판결문 쪽과 같은 것을 쓴다.
 * 여기가 하는 일은 **주소를 문서로 옮기는 것**뿐이다.
 *
 * 공개 판례라 누구나 볼 수 있다. 흘러나가는 것은 상태와 단계 이름뿐이고 본문은 없다.
 */
const NOT_FOUND = 404;

async function GET(
  request: Request,
  context: { params: Promise<{ caseNo: string; level: string }> },
) {
  const { caseNo, level } = await context.params;

  const canonical = toCanonicalCaseNumber(decodeURIComponent(caseNo));
  const levels: readonly string[] = LEVELS;
  if (canonical === undefined || !levels.includes(level)) {
    return new Response("not found", { status: NOT_FOUND });
  }

  const judgment = findJudgmentByCaseNo(corpusDb(), canonical);
  if (judgment === undefined) {
    return new Response("not found", { status: NOT_FOUND });
  }

  const store = caseStore(judgment.id);
  return eventStreamResponse(
    progressStream({
      readProgress: () => store.findProgress(level as (typeof LEVELS)[number], PIPELINE_VERSION),
      signal: request.signal,
    }),
  );
}

export { GET };
