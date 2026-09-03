import "server-only";
import { corpusDb } from "@/db/client";
import {
  findLatestLawVersion,
  findLawArticle,
  findLawVersionAt,
  listLawArticles,
  saveLawArticles,
} from "@/db/corpus/repository";
import { lawApi } from "@/lib/law-api/client";
import { parseArticleRef } from "@/lib/law-api/parse-law";

/**
 * 판결 당시의 법령. `PRODUCT.md` §5.5 [6a] · §6.4 · [F-30]
 *
 * **판례와 정반대로 다룬다.** 판례는 아무도 안 볼 것을 미리 만들면 그대로 비용이라
 * 요청할 때 만든다(§5.1). 법령은 반대다 — 판결이 인용한 조문을 검증하려면 *그 판결
 * 당시의* 법이 있어야 하는데, 어느 판이 그때 시행 중이었는지를 매번 법제처에 물으면
 * 검증 한 번마다 왕복이 붙는다.
 *
 * 그래서 **목록은 미리, 본문은 필요할 때**다.
 * - 판 목록 168,496건은 `npm run law:sync`가 미리 받아 둔다. 시점 조회가 인덱스
 *   하나로 끝나고 API를 부르지 않는다.
 * - 본문은 실제로 인용된 판만 받아서 **영구 캐시**한다. 과거 판의 내용은 변하지 않으므로
 *   한 번 받으면 다시 받을 이유가 없다(§6.4).
 */

/**
 * "언제든 한 판이라도 있었나"를 물을 때 쓰는 기준 시각.
 * 시행일이 이보다 늦은 법령은 없다.
 */
const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");

interface ArticleText {
  readonly articleNo: string;
  readonly branchNo: string;
  readonly title: string | null;
  readonly body: string | null;
  readonly clauses: readonly { number: string | undefined; text: string }[];
}

interface LawAtResult {
  readonly lawName: string;
  readonly mst: string;
  readonly effectiveAt: Date | null;
  readonly articles: readonly ArticleText[];
}

type LawLookup =
  | { readonly kind: "ok"; readonly law: LawAtResult }
  /** 이 이름의 법을 목록에서 못 찾았다. 이름이 틀렸거나 동기화가 아직이다. */
  | { readonly kind: "unknown_law" }
  /** 이름은 있는데 그 날짜에 시행 중이던 판이 없다. 판결일이 제정 전이다. */
  | { readonly kind: "not_in_force" }
  /** 본문을 받아야 하는데 법제처 연결이 없다. */
  | { readonly kind: "api_unavailable" }
  | { readonly kind: "api_error"; readonly message: string };

function toArticleText(row: {
  articleNo: string;
  branchNo: string;
  title: string | null;
  body: string | null;
  clauses: unknown;
}): ArticleText {
  return {
    articleNo: row.articleNo,
    branchNo: row.branchNo,
    title: row.title,
    body: row.body,
    clauses: row.clauses as ArticleText["clauses"],
  };
}

/**
 * 이 날짜에 시행 중이던 법의 조문을 준다. 본문이 없으면 그때 받아서 저장한다.
 *
 * 조문을 `at` 기준으로 한 번 더 거른다 — 한 개정 안에서도 조문마다 시행일이 다르므로,
 * 판을 골랐다고 그 판의 모든 조문이 그날 시행 중이었던 것은 아니다.
 */
/**
 * 이 날짜에 시행 중이던 법의 조문을 준다.
 *
 * **`lawId`로 찾는 쪽이 정확하다.** 법은 개정되면서 이름이 바뀌므로, 옛 이름으로 인용한
 * 판결문은 이름으로는 그 법에 닿지 못한다. 이름은 사람이 직접 주소를 칠 때를 위해 남긴다.
 */
async function lawAsOf(
  key: { lawId: string } | { name: string },
  at: Date,
  signal?: AbortSignal,
): Promise<LawLookup> {
  const db = corpusDb();
  const version = findLawVersionAt(db, key, at);
  if (version === undefined) {
    /*
     * 이름이 아예 없는 것과, 이름은 있는데 그때 시행 전이었던 것을 구분한다.
     * 앞은 "우리가 모르는 법"이고 뒤는 "그때는 없던 법"이다 — 검증 결과가 달라야 한다.
     */
    /*
     * 이름이 아예 없는 것과, 이름은 있는데 그때 시행 전이었던 것을 구분한다.
     * `lawId`로 물었으면 그 id가 코퍼스에 있는지로 본다.
     */
    const everExisted =
      "lawId" in key
        ? findLawVersionAt(db, key, FAR_FUTURE) !== undefined
        : findLatestLawVersion(db, key.name) !== undefined;
    return everExisted ? { kind: "not_in_force" } : { kind: "unknown_law" };
  }

  if (version.bodyFetchedAt === null) {
    const api = lawApi();
    if (api === undefined) {
      return { kind: "api_unavailable" };
    }
    try {
      const detail = await api.fetchLaw(version.mst, signal);
      saveLawArticles(
        db,
        version.id,
        detail.articles.map((article, index) => ({
          articleNo: article.number,
          branchNo: article.branchNumber ?? "",
          title: article.title,
          body: article.text,
          clauses: article.clauses,
          effectiveAt: article.effectiveAt,
          orderIdx: index,
        })),
      );
    } catch (error) {
      return {
        kind: "api_error",
        message: error instanceof Error ? error.message : "법령 본문을 가져오지 못했습니다.",
      };
    }
  }

  return {
    kind: "ok",
    law: {
      lawName: version.name,
      mst: version.mst,
      effectiveAt: version.effectiveAt,
      articles: listLawArticles(db, version.id, at).map(toArticleText),
    },
  };
}

/**
 * 인용 검증 결과.
 *
 * `exists` 그 조문이 실제로 있다. 본문을 함께 준다.
 * `missing` 법은 찾았는데 그 조문이 없다 — **환각 인용일 가능성이 높다.**
 * `unknown_law` 이 이름의 법을 모른다. 이름이 틀렸거나 동기화가 아직이다.
 * `not_in_force` 그 날짜에는 아직 시행 전이었다.
 * `unverifiable` 우리가 확인하지 못했다. **`missing`과 반드시 구분한다.**
 */
type CitationCheck =
  | { readonly kind: "exists"; readonly article: ArticleText; readonly mst: string }
  | { readonly kind: "missing" }
  | { readonly kind: "unknown_law" }
  | { readonly kind: "not_in_force" }
  | { readonly kind: "unverifiable"; readonly reason: string };

/**
 * 인용한 조문이 판결 당시에 실제로 있었는지 본다. `PRODUCT.md` §5.5 [6a] · [F-30]
 *
 * `reference`는 판결문이 쓰는 표기 그대로 받는다 — `"제4조의2"`, `"제 44 조"`.
 *
 * **`missing`과 `unverifiable`을 섞지 않는다.** 앞은 "그 조문은 없다"(생성 문장을 막아야
 * 한다)이고 뒤는 "우리가 확인하지 못했다"(막을 근거가 없다)이다. 둘을 같이 다루면
 * 법제처가 잠깐 죽었을 때 멀쩡한 인용이 전부 환각으로 표시된다.
 */
async function verifyCitation(
  key: { lawId: string } | { name: string },
  reference: string,
  at: Date,
  signal?: AbortSignal,
): Promise<CitationCheck> {
  const ref = parseArticleRef(reference);
  if (ref === undefined) {
    return { kind: "unverifiable", reason: "조문 표기를 읽지 못했습니다." };
  }

  const found = await lawAsOf(key, at, signal);
  if (found.kind === "unknown_law" || found.kind === "not_in_force") {
    return { kind: found.kind };
  }
  if (found.kind !== "ok") {
    return {
      kind: "unverifiable",
      reason: found.kind === "api_unavailable" ? "법제처 연결이 없습니다." : found.message,
    };
  }

  const db = corpusDb();
  const version = findLawVersionAt(db, key, at);
  const article =
    version === undefined
      ? undefined
      : findLawArticle(db, version.id, ref.number, ref.branchNumber ?? "");

  if (article === undefined) {
    return { kind: "missing" };
  }
  /*
   * 조문이 표에는 있어도 그날 아직 시행 전일 수 있다. `lawAsOf`가 이미 걸러 둔 목록에
   * 있는지로 확인한다 — 시행 전 조문을 근거로 붙이면 "있는데 없는 것"이 된다.
   */
  const inForce = found.law.articles.some(
    (candidate) =>
      candidate.articleNo === article.articleNo && candidate.branchNo === article.branchNo,
  );
  if (!inForce) {
    return { kind: "not_in_force" };
  }

  return { kind: "exists", article: toArticleText(article), mst: found.law.mst };
}

export { lawAsOf, verifyCitation };
export type { ArticleText, CitationCheck, LawAtResult, LawLookup };
