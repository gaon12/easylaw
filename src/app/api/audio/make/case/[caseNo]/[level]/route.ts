import { corpusDb } from "@/db/client";
import { findApprovedRendition, findJudgmentByCaseNo, findRendition } from "@/db/corpus/repository";
import { LEVELS } from "@/db/corpus/schema";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { caseAudioSentenceIds, makeCaseAudio } from "@/server/audio";
import { currentPipelineVersion } from "@/server/generate";

/**
 * 공개 판례 설명 한 벌을 소리로 만든다. [F-11]
 *
 * **누르면 만든다.** 미리 만들어 두지 않는 이유는 지출이다 — 아무도 듣지 않을 음성까지
 * 만들 이유가 없다. 첫 사람만 기다리고, 그다음 사람은 바로 듣는다.
 *
 * 만들고 나서 **어느 문장에 음성이 생겼는지** 돌려준다. 화면은 그 목록으로 곧바로
 * 재생기를 갈아 끼운다 — 페이지를 다시 부르지 않아도 된다.
 */

const NOT_FOUND = 404;
const TOO_MANY = 429;
const SERVER_ERROR = 500;
const OK = 200;

/** 결과를 상태 코드로. 화면이 이유를 구분해 말할 수 있어야 한다. */
function statusFor(kind: string): number {
  if (kind === "limited") {
    return TOO_MANY;
  }
  return kind === "failed" ? SERVER_ERROR : OK;
}

async function POST(
  _request: Request,
  context: { params: Promise<{ caseNo: string; level: string }> },
) {
  const { caseNo, level } = await context.params;
  const canonical = toCanonicalCaseNumber(decodeURIComponent(caseNo));
  const levels: readonly string[] = LEVELS;
  if (canonical === undefined || !levels.includes(level)) {
    return Response.json({ kind: "not_found" }, { status: NOT_FOUND });
  }

  const db = corpusDb();
  const judgment = findJudgmentByCaseNo(db, canonical);
  const rendition =
    judgment === undefined
      ? undefined
      : (findApprovedRendition(db, judgment.id, level as (typeof LEVELS)[number]) ??
        findRendition(db, judgment.id, level as (typeof LEVELS)[number], currentPipelineVersion()));
  if (rendition === undefined) {
    return Response.json({ kind: "not_found" }, { status: NOT_FOUND });
  }

  const result = await makeCaseAudio(rendition.id);
  const status = statusFor(result.kind);

  return Response.json(
    {
      kind: result.kind,
      /* 화면이 곧바로 재생기를 갈아 끼울 수 있게 지금 상태를 함께 준다. */
      ready: [...caseAudioSentenceIds(rendition.id)],
      reason: result.kind === "failed" ? result.reason : undefined,
    },
    { status },
  );
}

export { POST };
