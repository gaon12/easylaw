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
 * **결과를 맨 위로 올렸다.** 이 화면에 온 사람이 가장 먼저 알고 싶은 것은 "내 사건이
 * 어떻게 됐나"인데, 그것이 사건 종류와 같은 모양으로 목록 맨 아래 있으면 찾아야 한다.
 *
 * 결과는 승/패를 뭉뚱그리지 않는다 — "일부"를 숨기면 사용자가 자기 사건을 잘못 이해한다.
 *
 * **결과에 색을 입히지 않았다.** 이긴 것을 초록, 진 것을 빨강으로 칠하면 화면이 감정을
 * 먼저 전한다. 1심 결과는 확정된 것도 아니다(`EASY-READ.md` §5). 판단은 읽는 사람의 몫으로
 * 남기고, 화면은 사실만 전한다. 상태를 색만으로 전하지 않는다는 §10 규칙과도 같은 방향이다.
 */
function SummaryCard(props: SummaryCardProps) {
  return (
    <section className={styles.summary}>
      <div className={styles.summaryHead}>
        <h1 className={styles.caseName}>{props.caseName ?? props.caseNoDisplay}</h1>

        <div className={styles.outcome}>
          <span className={styles.outcomeLabel}>{viewer.outcomeLabel}</span>
          <span className={styles.outcomeValue}>{outcomes[props.outcome]}</span>
        </div>
      </div>

      <div className={styles.fields}>
        <Field label={viewer.fields.caseNo} value={props.caseNoDisplay} />
        {props.court === null ? null : <Field label={viewer.fields.court} value={props.court} />}
        {props.decidedAt === null ? null : (
          <Field label={viewer.fields.decidedAt} value={dateFormatter.format(props.decidedAt)} />
        )}
        {props.caseType === null ? null : (
          <Field label={viewer.fields.caseType} value={props.caseType} />
        )}
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
