import "server-only";
import { corpusDb } from "@/db/client";
import { listLawNames } from "@/db/corpus/repository";
import { type Citation, createLawNameIndex, detectCitations } from "@/lib/law-citation/detect";

/**
 * 법 이름 사전. `lib/law-citation/detect.ts`
 *
 * **프로세스당 한 번만 만든다.** 이름이 13,265개라 요청마다 다시 읽으면 원문 한 화면을
 * 그리는 데 그 조회가 문장 수만큼 붙는다. 이름 목록은 `law:sync`를 다시 돌릴 때만
 * 늘어나므로, 서버가 도는 동안 굳어 있어도 문제가 되지 않는다.
 *
 * 동기화 직후에 새 법을 링크하려면 서버를 다시 띄우면 된다. 그 정도 빈도의 일이다.
 */
let cached: ReturnType<typeof createLawNameIndex> | undefined;

function lawNameIndex() {
  cached ??= createLawNameIndex(listLawNames(corpusDb()));
  return cached;
}

/** 문장 하나에서 법령 인용을 찾는다. 사전에 없는 법은 이름이 비어 온다(링크하지 않는다). */
function findCitations(text: string): Citation[] {
  return detectCitations(text, lawNameIndex());
}

export { findCitations };
