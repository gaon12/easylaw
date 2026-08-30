import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import type { StructuredRow } from "@/components/ui/types";
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
  /** 설치할 때 고른 기준 시간대. 선고일을 이 시간대로 읽는다. */
  timeZone: string;
}

/**
 * 판결 한눈에 보기. `PAGES.md` §5.2 ① · `DESIGN.md` §6
 *
 * 규격대로 만든다 — 메타데이터는 `structured-list`(라벨/값 2열 + 1px 디바이더),
 * 결과는 `badge`다. 전에는 둘 다 손으로 짠 박스였다.
 *
 * **결과를 맨 위로 올렸다.** 이 화면에 온 사람이 가장 먼저 알고 싶은 것은 "내 사건이
 * 어떻게 됐나"인데, 그것이 사건 종류와 같은 모양으로 목록 맨 아래 있으면 찾아야 한다.
 *
 * 결과 배지는 `solid` 하나뿐이다. §11의 "화면당 주 액션 하나"와 같은 이유로, 무거운
 * 배지를 여럿 두면 무엇이 중요한지 흐려진다.
 *
 * 승/패를 색으로 말하지 않는다. 이긴 것을 초록, 진 것을 빨강으로 칠하면 화면이 사실보다
 * 감정을 먼저 전하고, 1심 결과는 확정된 것도 아니다(`EASY-READ.md` §5).
 * 그래서 톤은 언제나 `neutral`이고, 판단은 읽는 사람 몫으로 남긴다.
 */
function SummaryCard(props: SummaryCardProps) {
  const rows: StructuredRow[] = [{ label: viewer.fields.caseNo, value: props.caseNoDisplay }];

  if (props.court !== null) {
    rows.push({ label: viewer.fields.court, value: props.court });
  }
  if (props.decidedAt !== null) {
    rows.push({
      label: viewer.fields.decidedAt,
      value: formatDecidedAt(props.decidedAt, props.timeZone),
    });
  }
  if (props.caseType !== null) {
    rows.push({ label: viewer.fields.caseType, value: props.caseType });
  }

  return (
    <Card>
      <div className={styles.summaryHead}>
        <h1 className={styles.caseName}>{props.caseName ?? props.caseNoDisplay}</h1>
        <div className={styles.outcome}>
          <span className={styles.outcomeLabel}>{viewer.outcomeLabel}</span>
          <Badge tone="neutral" variant="solid">
            {outcomes[props.outcome]}
          </Badge>
        </div>
      </div>

      <StructuredList rows={rows} />

      {props.sourceUrl === null ? null : (
        <p className={styles.source}>
          {viewer.sourceLabel}{" "}
          <a href={props.sourceUrl} rel="noreferrer noopener" target="_blank">
            {viewer.sourceLinkLabel}
          </a>
        </p>
      )}
    </Card>
  );
}

/** 선고일은 날짜이지 시각이 아니다. 저장할 때 UTC 자정으로 고정했으므로 그대로 읽는다. */
function formatDecidedAt(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(value);
}

export { SummaryCard };
