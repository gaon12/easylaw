import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { formatDate } from "@/lib/format";
import { law as strings } from "@/lib/strings";
import { lawAsOf } from "@/server/law";
import { siteTimeZone } from "@/server/settings";
import styles from "./page.module.css";

/**
 * 법령 한 판. `PRODUCT.md` §6.5
 *
 * **판결 당시의 법을 보여 준다.** 주소의 `때`가 판결 선고일이고, 그 날짜에 시행 중이던
 * 판을 고른다. 현행법을 보여 주면 그 판결을 읽는 데 도움이 안 될뿐더러, 사이에 개정이
 * 있었으면 조문 번호부터 다르다.
 *
 * `때`가 없으면 오늘 기준 — 판결에서 오지 않고 직접 들어온 경우다.
 */
export default async function LawPage(props: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ 조?: string; 의?: string; 때?: string }>;
}) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const name = decodeURIComponent(params.name);
  const at = query.때 === undefined ? new Date() : new Date(query.때);
  const found = await lawAsOf(name, Number.isNaN(at.getTime()) ? new Date() : at);

  if (found.kind !== "ok") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{name}</h1>
        <Alert title={strings.problems[found.kind].title} tone="warning">
          {strings.problems[found.kind].body}
        </Alert>
      </div>
    );
  }

  const { law } = found;
  const zone = siteTimeZone();
  /** 인용에서 왔으면 그 조문으로 바로 데려간다. */
  const target = query.조;
  const targetBranch = query.의 ?? "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{law.lawName}</h1>
        <Card>
          <StructuredList
            rows={[
              {
                label: strings.effectiveAt,
                value: law.effectiveAt === null ? "-" : formatDate(law.effectiveAt, zone),
              },
              { label: strings.articleCount, value: strings.articles(law.articles.length) },
              { label: strings.source, value: strings.sourceName },
            ]}
          />
        </Card>
        <p className={styles.note}>{strings.asOfNote}</p>
      </header>

      <ol className={styles.articles}>
        {law.articles.map((article) => {
          const anchor = `조${article.articleNo}${article.branchNo ? `의${article.branchNo}` : ""}`;
          const highlighted = article.articleNo === target && article.branchNo === targetBranch;

          return (
            <li className={styles.article} id={anchor} key={anchor}>
              <h2 className={highlighted ? styles.articleHeadHit : styles.articleHead}>
                {strings.articleLabel(article.articleNo, article.branchNo)}
                {article.title === null ? null : (
                  <span className={styles.articleTitle}>{strings.articleTitle(article.title)}</span>
                )}
              </h2>
              {article.clauses.length === 0 ? (
                <p className={styles.body}>{article.body}</p>
              ) : (
                article.clauses.map((clause) => (
                  <p className={styles.body} key={`${anchor}-${clause.number ?? clause.text}`}>
                    {clause.text}
                  </p>
                ))
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const dynamic = "force-dynamic";
