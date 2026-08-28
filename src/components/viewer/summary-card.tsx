import { outcomes, viewer } from "@/lib/strings";
import styles from "./viewer.module.css";

interface SummaryCardProps {
  caseNoDisplay: string;
  caseName: string | null;
  court: string | null;
  decidedAt: Date | null;
  caseType: string | null;
  outcome: keyof typeof outcomes;
  sourceUrl: string | null;
}

/** 선고일은 날짜이지 시각이 아니다. 저장할 때 UTC 자정으로 고정했으므로 표시도 UTC로 읽는다. */
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}

/**
 * 판결 한눈에 보기. `PAGES.md` §5.2 ①
 *
 * 결과는 승/패를 뭉뚱그리지 않는다 — "일부"를 숨기면 사용자가 자기 사건을 잘못 이해한다.
 */
function SummaryCard(props: SummaryCardProps) {
  return (
    <section className={styles.summary}>
      <h1 className={styles.caseName}>{props.caseName ?? props.caseNoDisplay}</h1>

      <div className={styles.fields}>
        <Field label={viewer.fields.caseNo} value={props.caseNoDisplay} />
        {props.court === null ? null : <Field label={viewer.fields.court} value={props.court} />}
        {props.decidedAt === null ? null : (
          <Field label={viewer.fields.decidedAt} value={dateFormatter.format(props.decidedAt)} />
        )}
        {props.caseType === null ? null : (
          <Field label={viewer.fields.caseType} value={props.caseType} />
        )}
        <Field label={viewer.fields.outcome} value={outcomes[props.outcome]} />
      </div>

      {props.sourceUrl === null ? null : (
        <p className={styles.source}>
          {viewer.sourceLabel}{" "}
          <a href={props.sourceUrl} rel="noreferrer noopener" target="_blank">
            {viewer.sourceLinkLabel}
          </a>
        </p>
      )}
    </section>
  );
}

export { SummaryCard };
