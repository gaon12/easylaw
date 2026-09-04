import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Infobox } from "@/components/ui/infobox";
import { CASE_CODES } from "@/lib/case-number/codes";
import { formatDate } from "@/lib/format";
import type { PrecedentSummary } from "@/lib/law-api/parse";
import { search } from "@/lib/strings";
import type { LookupResult } from "@/server/lookup";
import { type LawHit, searchEverything } from "@/server/search";
import { siteTimeZone } from "@/server/settings";
import styles from "./page.module.css";

/** 잘못된 입력의 이유마다 다른 안내를 준다 — "형식이 아님"과 "모르는 부호"는 다른 문제다. */
function invalidTitle(reason: string, code: string | undefined): string {
  if (reason === "unknown_code" && code !== undefined) {
    return search.unknownCode(code);
  }
  if (reason === "year_out_of_range") {
    return search.yearOutOfRange;
  }
  return search.notFoundTitle;
}

/** 도움말에 보여 줄 대표 사건부호. 전부 늘어놓으면 읽히지 않는다. */
const COMMON_CODES = ["가합", "가단", "나", "다", "고단", "고합", "노", "도", "구합", "누", "두"];

function CodeHelp() {
  return (
    <Card className={styles.help} padding="tight">
      <p className={styles.helpTitle}>{search.codeHelpTitle}</p>
      <p className={styles.helpBody}>{search.codeHelpBody}</p>
      <ul className={styles.codeList}>
        {CASE_CODES.filter((entry) => COMMON_CODES.includes(entry.code)).map((entry) => (
          <li className={styles.code} key={entry.code}>
            {entry.code}
            {search.codeSeparator}
            {entry.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * 법령 결과.
 *
 * **법제처를 부르지 않고 나온다**(§6.5) — 판 목록을 미리 받아 뒀기 때문이다.
 * 그래서 법제처 키가 없어도 이 칸은 채워진다.
 */
function LawResults({ laws, timeZone }: { laws: readonly LawHit[]; timeZone: string }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{search.lawsTitle(laws.length)}</h2>
      <ul className={styles.hits}>
        {laws.map((law) => (
          <Card as="li" key={law.lawId} padding="tight">
            <Link
              className={styles.hitLink}
              href={`/law/${encodeURIComponent(law.name)}?id=${law.lawId}`}
            >
              {law.name}
            </Link>
            <p className={styles.hitMeta}>
              {[
                law.shortName === null || law.shortName === "" ? undefined : law.shortName,
                law.kind,
                law.ministry,
                law.effectiveAt === null
                  ? undefined
                  : search.effectiveAt(formatDate(law.effectiveAt, timeZone)),
              ]
                .filter(Boolean)
                .join(search.codeSeparator)}
            </p>
          </Card>
        ))}
      </ul>
    </section>
  );
}

/** 판례 결과. 사건번호를 몰라도 내용으로 찾을 수 있어야 한다(§5.2). */
function PrecedentResults({
  precedents,
  timeZone,
}: {
  precedents: readonly PrecedentSummary[];
  timeZone: string;
}) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{search.precedentsTitle(precedents.length)}</h2>
      <ul className={styles.hits}>
        {precedents.map((item) => (
          <Card as="li" key={item.precedentId} padding="tight">
            <Link className={styles.hitLink} href={`/case/${encodeURIComponent(item.caseNo)}`}>
              {item.caseName.length > 0 ? item.caseName : item.caseNo}
            </Link>
            <p className={styles.hitMeta}>
              {[
                item.caseNo,
                item.court,
                item.caseTypeName,
                item.decidedAt === undefined ? undefined : formatDate(item.decidedAt, timeZone),
              ]
                .filter(Boolean)
                .join(search.codeSeparator)}
            </p>
          </Card>
        ))}
      </ul>
    </section>
  );
}

/** 사건번호로 읽혔는데 찾지 못한 경우들. 이유마다 할 말이 다르다. */
function CaseLookupNotice({ lookup }: { lookup: LookupResult }) {
  if (lookup.kind === "invalid") {
    return (
      <Alert title={invalidTitle(lookup.reason, lookup.code)} tone="warning">
        {search.notFoundBody}
      </Alert>
    );
  }
  if (lookup.kind === "not_public") {
    return (
      <Infobox
        actions={<ButtonLink href="/upload">{search.uploadCta}</ButtonLink>}
        title={search.notFoundTitle}
      >
        {search.notFoundBody}
      </Infobox>
    );
  }
  if (lookup.kind === "api_unavailable") {
    return (
      <Alert title={search.apiUnavailableTitle} tone="warning">
        {search.apiUnavailableBody}
      </Alert>
    );
  }
  if (lookup.kind === "api_error") {
    return (
      <Alert title={search.apiErrorTitle} tone="danger">
        {lookup.message}
      </Alert>
    );
  }
  return null;
}

/**
 * 검색 결과. `PAGES.md` §3 · `PRODUCT.md` §5.2
 *
 * **사건번호만이 아니라 내용으로도 찾는다.** §5.2가 적어 둔 그대로 사용자는 사건번호를
 * 정확히 모르는 경우가 더 많고, 예전 화면은 그때 "결과가 없다"만 보여 주는 막다른 곳이었다.
 *
 * 법령 · 판례를 나눠 보여 준다. 법령은 우리 DB에서 나오므로 법제처 키가 없어도 채워진다.
 */
async function SearchPage(props: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await props.searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = raw?.trim() ?? "";

  if (query.length === 0) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{search.title}</h1>
        <Infobox
          actions={<ButtonLink href="/">{search.retry}</ButtonLink>}
          title={search.emptyQuery}
        >
          {search.codeHelpBody}
        </Infobox>
      </div>
    );
  }

  const results = await searchEverything(query);

  // 사건번호가 정확히 하나로 특정되면 결과 목록을 거치지 않고 바로 보여 준다.
  if (results.caseLookup?.kind === "found") {
    redirect(`/case/${encodeURIComponent(results.caseLookup.summary.caseNoCanonical)}`);
  }

  const timeZone = siteTimeZone();
  const nothing =
    results.laws.length === 0 &&
    results.precedents.length === 0 &&
    results.caseLookup === undefined;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{search.title}</h1>
      <p className={styles.interpretation}>
        {results.caseLookup === undefined
          ? search.resultsForKeyword(query)
          : search.searchedByCaseNumber(query)}
      </p>

      {results.caseLookup === undefined ? null : <CaseLookupNotice lookup={results.caseLookup} />}

      {results.laws.length > 0 ? <LawResults laws={results.laws} timeZone={timeZone} /> : null}

      {results.precedents.length > 0 ? (
        <PrecedentResults precedents={results.precedents} timeZone={timeZone} />
      ) : null}

      {/*
        판례 검색이 **실패한 것**과 **0건인 것**을 구분해서 알린다. 법제처가 잠깐 죽었을 때
        "그런 판례가 없어요"라고 하면 사용자는 없는 것으로 믿고 떠난다.
      */}
      {results.precedentError === undefined ? null : (
        <Alert title={search.apiErrorTitle} tone="danger">
          {results.precedentError}
        </Alert>
      )}
      {results.apiUnavailable && results.caseLookup === undefined ? (
        <Infobox title={search.apiUnavailableTitle}>{search.lawsOnlyBody}</Infobox>
      ) : null}

      {nothing ? (
        <Infobox
          actions={<ButtonLink href="/upload">{search.uploadCta}</ButtonLink>}
          title={search.nothingTitle}
        >
          {search.notFoundBody}
        </Infobox>
      ) : null}

      <CodeHelp />
    </div>
  );
}

export default SearchPage;
export const metadata = { title: search.title };
