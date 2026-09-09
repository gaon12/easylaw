import "server-only";
import { legalDb } from "@/db/client";
import { listLawNameEntries } from "@/db/corpus/repository";
import { type Citation, createLawNameIndex, detectCitations } from "@/lib/law-citation/detect";

/**
 * 법 이름 사전. `lib/law-citation/detect.ts`
 *
 * **프로세스당 한 번만 만든다.** 이름이 13,265개라 요청마다 다시 읽으면 원문 한 화면을
 * 그리는 데 그 조회가 문장 수만큼 붙는다. 이름 목록은 `law:sync`를 다시 돌릴 때만
 * 늘어나므로, 서버가 도는 동안 굳어 있어도 문제가 되지 않는다.
 *
 * 동기화가 끝나면 캐시를 무효화하여 다음 요청부터 새 법령 이름을 쓴다.
 */
let cached: ReturnType<typeof createLawNameIndex> | undefined;

function lawNameIndex() {
  cached ??= createLawNameIndex(listLawNameEntries(legalDb()));
  return cached;
}

function invalidateLawNameIndex(): void {
  cached = undefined;
}

/** 문장 하나에서 법령 인용을 찾는다. 사전에 없는 법은 이름이 비어 온다(링크하지 않는다). */
function findCitations(
  text: string,
  context?: { readonly lawId: string; readonly name: string },
): Citation[] {
  return detectCitations(
    text,
    lawNameIndex(),
    context === undefined
      ? undefined
      : { lawId: context.lawId, name: context.name, matched: context.name },
  );
}

export { findCitations, invalidateLawNameIndex };
