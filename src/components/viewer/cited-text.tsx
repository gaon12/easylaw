import Link from "next/link";
import type { ReactNode } from "react";
import type { Citation } from "@/lib/law-citation/detect";
import { formatCitation } from "@/lib/law-citation/detect";
import { viewer } from "@/lib/strings";
import styles from "./cited-text.module.css";

/**
 * 판결문 문장에서 법령 인용을 링크로 바꾼다. `PAGES.md` §5.2 ④
 *
 * **`dangerouslySetInnerHTML`을 쓰지 않는다**(`CONVENTIONS.md` §7). 판결문 본문은 외부에서
 * 온 글이고, 거기에 태그가 섞여 있을 수 있다. 문자열을 잘라 **텍스트 노드와 링크 노드로
 * 나눠 붙인다** — React가 텍스트를 그대로 이스케이프하므로 무엇이 들어와도 글자로만 남는다.
 *
 * 판결 날짜를 함께 넘긴다. 링크가 가리켜야 하는 것은 *현행* 법이 아니라 **그 판결 당시
 * 시행 중이던 법**이기 때문이다(`PRODUCT.md` §6.5).
 */
function CitedText({
  text,
  citations,
  decidedAt,
}: {
  text: string;
  citations: readonly Citation[];
  decidedAt: Date | null;
}) {
  if (citations.length === 0) {
    return text;
  }

  const at = decidedAt === null ? undefined : decidedAt.toISOString().slice(0, 10);
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const citation of citations) {
    if (citation.start > cursor) {
      parts.push(text.slice(cursor, citation.start));
    }

    if (citation.law === undefined) {
      /*
       * 모르는 법이면 링크하지 않고 글자만 남긴다. 링크를 걸어 두고 눌렀을 때 "없어요"를
       * 보여 주는 것은, 누르기 전까지 있는 것처럼 보이게 만드는 일이다.
       */
      parts.push(citation.text);
    } else {
      /*
       * 주소에는 **정식명**을 쓰고 `법령ID`를 함께 실는다. 이름만으로는 개정으로 이름이
       * 바뀐 법을 놓치고, 같은 이름의 다른 법과 섞인다(정식명 248개가 그렇다).
       * 이름은 사람이 읽으라고 두는 것이고, 실제 조회는 id가 한다.
       */
      const query = new URLSearchParams({ 조: citation.articleNo, id: citation.law.lawId });
      if (citation.branchNo !== undefined) {
        query.set("의", citation.branchNo);
      }
      if (at !== undefined) {
        query.set("때", at);
      }

      parts.push(
        <Link
          className={styles.citation}
          href={`/law/${encodeURIComponent(citation.law.name)}?${query}`}
          key={`${citation.start}-${citation.end}`}
          title={viewer.citationHint(citation.law.name, formatCitation(citation))}
        >
          {citation.text}
        </Link>,
      );
    }
    cursor = citation.end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

export { CitedText };
