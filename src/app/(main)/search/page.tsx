import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Infobox } from "@/components/ui/infobox";
import { CASE_CODES } from "@/lib/case-number/codes";
import { search } from "@/lib/strings";
import { lookupCase } from "@/server/lookup";
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

/**
 * 검색 결과. `PAGES.md` §3
 *
 * 이 화면의 핵심은 "찾았다"가 아니라 **"못 찾았다"** 다. 하급심 판결문 대부분은 공개되지
 * 않으므로(`PRODUCT.md` §5.4) 여기서 사용자를 막다른 곳에 두면 서비스가 끝난다.
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

  const result = await lookupCase(query);

  // 사건번호가 정확히 하나로 특정되면 결과 목록을 거치지 않고 바로 보여 준다.
  if (result.kind === "found") {
    redirect(`/case/${encodeURIComponent(result.summary.caseNoCanonical)}`);
  }

  const codeHelp = (
    <div className={styles.help}>
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
    </div>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{search.title}</h1>

      {result.kind === "invalid" ? (
        <>
          <p className={styles.interpretation}>{search.resultsForKeyword(query)}</p>
          <Infobox
            actions={<ButtonLink href="/upload">{search.uploadCta}</ButtonLink>}
            title={invalidTitle(result.reason, result.code)}
            tone="warning"
          >
            {search.notFoundBody}
          </Infobox>
        </>
      ) : null}

      {result.kind === "not_public" ? (
        <>
          <p className={styles.interpretation}>
            {search.searchedByCaseNumber(result.caseNoCanonical)}
          </p>
          <Infobox
            actions={<ButtonLink href="/upload">{search.uploadCta}</ButtonLink>}
            title={search.notFoundTitle}
          >
            {search.notFoundBody}
          </Infobox>
        </>
      ) : null}

      {result.kind === "api_unavailable" ? (
        <Infobox
          actions={<ButtonLink href="/upload">{search.uploadCta}</ButtonLink>}
          title={search.apiUnavailableTitle}
          tone="warning"
        >
          {search.apiUnavailableBody}
        </Infobox>
      ) : null}

      {result.kind === "api_error" ? (
        <Infobox
          actions={<ButtonLink href="/upload">{search.uploadCta}</ButtonLink>}
          title={search.apiErrorTitle}
          tone="danger"
        >
          {result.message}
        </Infobox>
      ) : null}

      {codeHelp}
    </div>
  );
}

export default SearchPage;
export const metadata = { title: search.title };
