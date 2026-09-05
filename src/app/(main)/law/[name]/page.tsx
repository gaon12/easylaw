import { Alert } from "@/components/ui/alert";
import type { TocEntry } from "@/components/ui/types";
import { isSimplifiedLevel, toLevel } from "@/components/viewer/levels";
import { WikiDocument } from "@/components/wiki/document";
import { WikiInfobox } from "@/components/wiki/infobox";
import { WikiSection } from "@/components/wiki/section";
import { formatDate } from "@/lib/format";
import { asOfNote, readAsOf } from "@/lib/law-citation/as-of";
import { law as strings, viewer, wiki } from "@/lib/strings";
import { type ArticleText, lawAsOf } from "@/server/law";
import { siteTimeZone } from "@/server/settings";
import styles from "./page.module.css";

/** 목차에 조문을 그대로 늘어놓아도 읽히는 한계. 넘으면 장 제목만 쓴다. */
const TOC_ARTICLE_LIMIT = 40;

/** 항의 key로 쓸 앞글자 길이. 같은 조문 안에서 항끼리 구분되면 충분하다. */
const CLAUSE_KEY_LENGTH = 12;

interface LawSearchParams {
  readonly 조?: string;
  readonly 의?: string;
  readonly 때?: string;
  readonly id?: string;
  readonly level?: string | string[];
}

/** 조문 하나의 앵커 id. 주소에 그대로 보이므로 사람이 읽을 수 있게 둔다. */
function articleAnchor(articleNo: string, branchNo: string): string {
  return branchNo.length > 0 ? `조${articleNo}의${branchNo}` : `조${articleNo}`;
}

/**
 * 목차를 만든다.
 *
 * **장 제목을 뼈대로 쓴다.** 조문이 519개인 법의 목차를 조문으로만 만들면 그 자체가
 * 또 하나의 긴 문서가 된다. 장이 없는 법(부속 규정 등)은 조문을 그대로 늘어놓는다 —
 * 그런 법은 대개 조문이 몇 개뿐이다.
 */
function buildToc(
  articles: readonly ArticleText[],
  sections: readonly { title: string; beforeArticleNo: string }[],
): TocEntry[] {
  if (sections.length === 0) {
    return articles.slice(0, TOC_ARTICLE_LIMIT).map((article) => ({
      id: articleAnchor(article.articleNo, article.branchNo),
      label: strings.articleLabel(article.articleNo, article.branchNo),
      depth: 1 as const,
    }));
  }

  return sections.map((section) => ({
    id: `장${section.beforeArticleNo}`,
    label: section.title,
    depth: 1 as const,
  }));
}

/** 조문 본문. 항이 있으면 항을, 없으면 조문 본문을 그린다. */
function ArticleBody({ article }: { article: ArticleText }) {
  if (article.clauses.length > 0) {
    return (
      <>
        {article.clauses.map((clause) => (
          <p
            className={styles.body}
            key={`${clause.number ?? ""}-${clause.text.slice(0, CLAUSE_KEY_LENGTH)}`}
          >
            {clause.text}
          </p>
        ))}
      </>
    );
  }
  return article.body === null ? null : <p className={styles.body}>{article.body}</p>;
}

/**
 * 조문 하나. 그 조문에서 새 장이 시작되면 장 제목을 앞에 세운다.
 *
 * 인용에서 온 조문은 배경과 왼쪽 표식을 함께 준다 — 색만으로 알리면 색을 구별하지 못하는
 * 사람에게는 아무 정보도 아니다(§11).
 */
function ArticleEntry({
  article,
  section,
  sectionNumber,
  highlighted,
}: {
  article: ArticleText;
  section: { title: string; beforeArticleNo: string } | undefined;
  sectionNumber: string | undefined;
  highlighted: boolean;
}) {
  const anchor = articleAnchor(article.articleNo, article.branchNo);

  return (
    <div>
      {section === undefined ? null : (
        <h2 className={styles.sectionTitle} id={`장${section.beforeArticleNo}`}>
          <span className={styles.sectionNumber}>{wiki.sectionNumber(sectionNumber ?? "")}</span>
          {section.title}
        </h2>
      )}

      <div className={highlighted ? styles.hit : undefined}>
        <WikiSection
          heading={strings.articleLabel(article.articleNo, article.branchNo)}
          id={anchor}
          level={3}
          meta={article.title === null ? undefined : strings.articleTitle(article.title)}
        >
          <ArticleBody article={article} />
        </WikiSection>
      </div>
    </div>
  );
}

/**
 * 법령 한 판. `PRODUCT.md` §6.5 · `DESIGN.md` §11.5
 *
 * **위키식으로 그린다** — 목차, 조문마다 앵커, 장 제목으로 나뉜 절, 화면 폭을 쓰는 2단.
 * 조문이 수백 개인 문서라 위에서부터 읽어 내려가는 것이 불가능하고, 그 문제를 위키가
 * 이미 풀어 놓았다.
 *
 * **판결 당시의 법을 보여 준다.** 주소의 `때`가 판결 선고일이고, 그 날짜에 시행 중이던
 * 판을 고른다. 현행법을 보여 주면 그 판결을 읽는 데 도움이 안 될뿐더러, 사이에 개정이
 * 있었으면 조문 번호부터 다르다.
 */
export default async function LawPage(props: {
  params: Promise<{ name: string }>;
  searchParams: Promise<LawSearchParams>;
}) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const name = decodeURIComponent(params.name);
  const level = toLevel(query.level);
  /*
   * 날짜를 받았는가. **받았을 때만 "판결 당시의 법"이라고 말할 수 있다** —
   * 못 받았으면 오늘 기준이고, 그것을 판결 당시라고 하면 거짓말이 된다.
   */
  const { at, dated } = readAsOf(query.때, new Date());
  /*
   * **`id`가 있으면 그것으로 찾는다.** 법은 개정되면서 이름이 바뀌므로, 인용에서 온
   * 링크는 언제나 `법령ID`를 달고 온다. 이름은 사람이 직접 주소를 칠 때만 쓰인다.
   */
  const key = query.id === undefined ? { name } : { lawId: query.id };
  const found = await lawAsOf(key, at);

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
  const target = query.조;
  const targetBranch = query.의 ?? "";

  /** 장 제목이 어느 조문 앞에 오는지. 조문을 그리면서 그 자리에 끼워 넣는다. */
  const sectionAt = new Map(law.sections.map((section) => [section.beforeArticleNo, section]));

  /** 장이 문서의 몇 번째 구간인가. 위키처럼 제목 앞에 번호를 붙인다. */
  const sectionNumber = new Map(
    law.sections.map((section, index) => [section.beforeArticleNo, String(index + 1)]),
  );

  return (
    <WikiDocument
      bodyBesideInfo={true}
      info={
        <WikiInfobox
          footer={asOfNote(query.때, dated)}
          rows={[
            {
              label: strings.effectiveAt,
              value: law.effectiveAt === null ? "-" : formatDate(law.effectiveAt, zone),
            },
            { label: strings.articleCount, value: strings.articles(law.articles.length) },
            { label: strings.source, value: strings.sourceName },
          ]}
          title={law.lawName}
        />
      }
      meta={
        isSimplifiedLevel(level) ? (
          <p className={styles.originalNote}>{strings.originalTextNotice(viewer.levels[level])}</p>
        ) : undefined
      }
      title={<h1 className={styles.title}>{law.lawName}</h1>}
      toc={buildToc(law.articles, law.sections)}
    >
      <div className={styles.articles}>
        {law.articles.map((article) => (
          <ArticleEntry
            article={article}
            highlighted={article.articleNo === target && article.branchNo === targetBranch}
            key={articleAnchor(article.articleNo, article.branchNo)}
            section={sectionAt.get(article.articleNo)}
            sectionNumber={sectionNumber.get(article.articleNo)}
          />
        ))}
      </div>
    </WikiDocument>
  );
}

export const dynamic = "force-dynamic";
