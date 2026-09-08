import type { Citation } from "@/lib/law-citation/detect";
import { formatCitation } from "@/lib/law-citation/detect";
import { viewer } from "@/lib/strings";
import type { ViewLevel } from "./levels";
import { withReadingLevel } from "./levels";

interface CitationTarget {
  readonly href: string;
  readonly query: string;
  readonly title: string;
}

/** 본문·법령 모달 어디서 눌러도 같은 주소와 기준일 규칙을 쓰게 한다. */
function citationTarget(
  citation: Citation,
  at: string | undefined,
  level: ViewLevel,
): CitationTarget | undefined {
  if (citation.law === undefined) {
    return;
  }

  const query = new URLSearchParams({ 조: citation.articleNo, id: citation.law.lawId });
  if (citation.branchNo !== undefined) {
    query.set("의", citation.branchNo);
  }
  if (at !== undefined) {
    query.set("때", at);
  }

  return {
    href: `/law/${encodeURIComponent(citation.law.name)}?${withReadingLevel(query, level)}#${articleAnchor(citation)}`,
    query: query.toString(),
    title: viewer.citationHint(citation.law.name, formatCitation(citation)),
  };
}

function articleAnchor(citation: Citation): string {
  return citation.branchNo === undefined
    ? `조${citation.articleNo}`
    : `조${citation.articleNo}의${citation.branchNo}`;
}

/** 역사 조문 상세 주소에서 기준일만 빼 현재 조문 탐색 주소를 만든다. */
function currentCitationHref(target: CitationTarget): string | undefined {
  const url = new URL(target.href, "http://easylaw.local");
  if (!url.searchParams.has("때")) {
    return;
  }
  url.searchParams.delete("때");
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}

export { citationTarget, currentCitationHref };
export type { CitationTarget };
