import Link from "next/link";
import type { ReactNode } from "react";
import type { Citation } from "@/lib/law-citation/detect";
import { citationTarget } from "./citation-target";
import type { ViewLevel } from "./levels";

/**
 * 법령 전체 화면의 인용 링크.
 *
 * 전체 법령은 수백 조문이고 인용도 수천 개일 수 있다. 인용마다 client dialog를 만들지
 * 않고 가벼운 링크만 두며, 도착한 조문은 주소의 hash로 바로 찾는다. 판결문에서 연 작은
 * 조문 창은 `CitationDialog` 하나 안에서 연쇄 탐색한다.
 */
function LawCitedText({
  text,
  citations,
  at,
  level,
}: {
  text: string;
  citations: readonly Citation[];
  at: string | undefined;
  level: ViewLevel;
}) {
  if (citations.length === 0) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const citation of citations) {
    if (citation.start < cursor || citation.end > text.length) {
      continue;
    }
    if (citation.start > cursor) {
      parts.push(text.slice(cursor, citation.start));
    }

    const target = citationTarget(citation, at, level);
    parts.push(
      target === undefined ? (
        citation.text
      ) : (
        <Link href={target.href} key={`${citation.start}-${citation.end}`} title={target.title}>
          {citation.text}
        </Link>
      ),
    );
    cursor = citation.end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

export { LawCitedText };
