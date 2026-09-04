import { findUploadForOwner } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { LEVELS } from "@/db/corpus/schema";
import { PIPELINE_VERSION } from "@/server/generate";
import { currentOwnerId } from "@/server/owner";
import { docStore } from "@/server/pipeline-store";
import { eventStreamResponse, progressStream } from "@/server/progress-stream";

/**
 * 올린 판결문의 생성 진행. `PRODUCT.md` §5.3
 *
 * **주인만 볼 수 있다.** 공개 판례 쪽과 다른 점은 이것 하나다. 흘러나가는 것이 상태와
 * 단계 이름뿐이라도, 남의 문서에 대해 "지금 만들고 있다"를 알려 주는 것 자체가 정보다.
 *
 * 없는 문서와 남의 문서를 구분하지 않는다 — 화면(`/doc/[docId]`)과 같은 규칙이다.
 */
const NOT_FOUND = 404;

async function GET(
  request: Request,
  context: { params: Promise<{ docId: string; level: string }> },
) {
  const { docId, level } = await context.params;

  const levels: readonly string[] = LEVELS;
  if (!levels.includes(level)) {
    return new Response("not found", { status: NOT_FOUND });
  }

  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    return new Response("not found", { status: NOT_FOUND });
  }

  const upload = findUploadForOwner(appDb(), docId, ownerId);
  if (upload === undefined) {
    return new Response("not found", { status: NOT_FOUND });
  }

  const store = docStore(docId);
  return eventStreamResponse(
    progressStream({
      readProgress: () => store.findProgress(level as (typeof LEVELS)[number], PIPELINE_VERSION),
      signal: request.signal,
    }),
  );
}

export { GET };
