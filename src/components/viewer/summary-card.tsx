import { Badge } from "@/components/ui/badge";
import type { InfoRow } from "@/components/ui/types";
import { WikiInfobox } from "@/components/wiki/infobox";
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
 * 판결 한눈에 보기. `PAGES.md` §5.2 ① · `DESIGN.md` §11.5
 *
 * **위키의 정보 틀로 그린다.** 예전에는 넓은 카드에 제목과 배지를 크게 올리고 아래에
 * 목록을 붙였는데, 그 카드 하나가 첫 화면의 절반을 먹었다. 문서를 읽으러 온 사람에게
 * 필요한 것은 사건을 특정하는 값 몇 개이고, 그것은 표 한 장이면 된다.
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
/** 선고일은 날짜이지 시각이 아니다. 저장할 때 UTC 자정으로 고정했으므로 그대로 읽는다. */
function formatDecidedAt(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(value);
}

function SummaryCard(props: SummaryCardProps) {
  const rows: InfoRow[] = [
    { label: viewer.fields.caseNo, value: props.caseNoDisplay },
    /*
     * 결과를 표의 한 줄로 둔다. 예전에는 카드 오른쪽 위에 큰 배지로 떠 있었는데,
     * 위키의 틀에서는 모든 값이 같은 표 안에 있고 그 편이 훑기 쉽다.
     * 배지를 유지하는 이유는 §11 — 상태는 색이 아니라 아이콘 + 라벨이 말한다.
     */
    {
      label: viewer.outcomeLabel,
      value: (
        <Badge tone="neutral" variant="solid">
          {outcomes[props.outcome]}
        </Badge>
      ),
    },
  ];

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
    <WikiInfobox
      footer={
        props.sourceUrl === null ? undefined : (
          <a className={styles.source} href={props.sourceUrl} rel="noreferrer" target="_blank">
            {viewer.sourceLinkLabel}
          </a>
        )
      }
      rows={rows}
      title={props.caseName ?? props.caseNoDisplay}
    />
  );
}

export { SummaryCard };
