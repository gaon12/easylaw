import Link from "next/link";
import type { Citation, LawRef } from "@/lib/law-citation/detect";
import { viewer } from "@/lib/strings";
import styles from "./cited-laws.module.css";

/**
 * 이 판결이 인용한 법령. `PAGES.md` §5 · 위키의 각주 목록에 해당한다.
 *
 * **본문 안의 링크만으로는 부족하다.** 판결문을 처음부터 끝까지 읽어야 무엇을 근거로 삼았는지
 * 알 수 있다면, 그것은 목차 없이 법령을 읽는 것과 같은 일이다. 위키가 각주를 문서 끝에
 * 모아 두는 이유가 그것이고, 여기서는 **조문 번호까지 한자리에 모은다.**
 *
 * 법 하나에 여러 조문이 인용되는 것이 보통이라(민사소송법 제420조·제425조…) 법으로 묶고
 * 조문을 그 아래 늘어놓는다. 조문마다 한 줄씩 두면 같은 법 이름이 열 번 반복된다.
 *
 * **우리가 아는 법만 나온다.** 사전에 없는 이름은 링크할 곳이 없어서 본문에서도 글자로만
 * 두는데(`cited-text.tsx`), 여기에 이름만 늘어놓으면 "있는데 못 연다"는 인상만 준다.
 */

interface CitedLaw {
  readonly lawId: string;
  readonly name: string;
  /** 이 법에서 인용된 조문들. 원문에 적힌 순서를 지킨다. */
  readonly articles: readonly CitedArticle[];
}

interface CitedArticle {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

/** `2019-05-03`의 길이. 날짜만 떼어 쓴다. */
const DATE_LENGTH = 10;

/** `제420조`, `제4조의2`. 조문 번호를 사람이 읽는 말로 되돌린다. */
function articleLabel(citation: Citation): string {
  return citation.branchNo === undefined
    ? viewer.articleLabel(citation.articleNo)
    : viewer.articleBranchLabel(citation.articleNo, citation.branchNo);
}

/** 인용 하나를 조문 항목으로. 주소는 본문 링크와 같은 규칙으로 만든다(§10.2와 같은 이유). */
function toArticle(citation: Citation, law: LawRef, at: string | undefined): CitedArticle {
  const query = new URLSearchParams({ 조: citation.articleNo, id: law.lawId });
  if (citation.branchNo !== undefined) {
    query.set("의", citation.branchNo);
  }
  if (at !== undefined) {
    query.set("때", at);
  }

  return {
    key: `${citation.articleNo}-${citation.branchNo ?? ""}`,
    label: articleLabel(citation),
    href: `/law/${encodeURIComponent(law.name)}?${query}`,
  };
}

/**
 * 인용을 법 단위로 묶는다.
 *
 * 같은 조문이 판결문에 열 번 나와도 목록에는 한 번만 둔다 — 목록의 일은 "무엇을 근거로
 * 삼았나"를 보여 주는 것이지 몇 번 나왔는지 세는 것이 아니다.
 *
 * **우리가 아는 법만 담는다.** 사전에 없는 이름은 링크할 곳이 없어서 본문에서도 글자로만
 * 두는데, 여기에 이름만 늘어놓으면 "있는데 못 연다"는 인상만 준다.
 */
function groupByLaw(
  citations: ReadonlyMap<string, readonly Citation[]>,
  decidedAt: Date | null,
): CitedLaw[] {
  const laws = new Map<string, { name: string; articles: Map<string, CitedArticle> }>();
  const at = decidedAt === null ? undefined : decidedAt.toISOString().slice(0, DATE_LENGTH);

  for (const citation of [...citations.values()].flat()) {
    const law = citation.law;
    if (law === undefined) {
      continue;
    }

    const entry = laws.get(law.lawId) ?? { name: law.name, articles: new Map() };
    const article = toArticle(citation, law, at);
    if (!entry.articles.has(article.key)) {
      entry.articles.set(article.key, article);
    }
    laws.set(law.lawId, entry);
  }

  return [...laws.entries()].map(([lawId, entry]) => ({
    lawId,
    name: entry.name,
    articles: [...entry.articles.values()],
  }));
}

function CitedLaws({
  citations,
  decidedAt,
}: {
  citations: ReadonlyMap<string, readonly Citation[]>;
  decidedAt: Date | null;
}) {
  const laws = groupByLaw(citations, decidedAt);
  if (laws.length === 0) {
    return null;
  }

  return (
    <section className={styles.box}>
      <h2 className={styles.title}>{viewer.citedLawsTitle(laws.length)}</h2>
      <p className={styles.hint}>{viewer.citedLawsHint}</p>
      <ul className={styles.list}>
        {laws.map((law) => (
          <li className={styles.law} key={law.lawId}>
            <span className={styles.lawName}>{law.name}</span>
            <span className={styles.articles}>
              {law.articles.map((article) => (
                <Link className={styles.article} href={article.href} key={article.key}>
                  {article.label}
                </Link>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { CitedLaws };
