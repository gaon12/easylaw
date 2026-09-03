import type { ReactNode } from "react";

/**
 * UI 컴포넌트가 주고받는 타입.
 *
 * 컴포넌트 파일에서 타입을 함께 내보내면 Fast Refresh가 동작하지 않는다(`.tsx`가 컴포넌트만
 * 내보내야 한다). 타입은 런타임에 사라지므로 실제로 새로고침이 깨지지는 않지만, 규칙을
 * 파일마다 끄는 것보다 타입을 한곳에 모으는 편이 낫다 — 어떤 톤이 있는지 한 파일만 보면 된다.
 */

/** 상태 아이콘. `DESIGN.md` §5 — 라인 아이콘, 24 그리드. */
type IconName = "check" | "alert" | "cross" | "info";

/** 배지 톤. `DESIGN.md` §3.4의 신뢰도 3색 + 중립. */
type BadgeTone = "grounded" | "needs-check" | "ungrounded" | "neutral";

/** 알림 톤. `DESIGN.md` §6 — 파스텔 배경 + 동색 보더. */
type AlertTone = "success" | "warning" | "danger";

/** 카드 상태. `DESIGN.md` §6 — 이 셋이 전부다. */
type CardTone = "default" | "elevated" | "selected";

/** 라벨/값 한 줄. `DESIGN.md` §6 `structured-list`. */
interface StructuredRow {
  readonly label: string;
  readonly value: ReactNode;
}

/** 목차 한 줄. `DESIGN.md` §11.5 */
interface TocEntry {
  /** 앵커 id. 이 값이 `#` 뒤에 붙는다. */
  readonly id: string;
  readonly label: string;
  /** 1이면 큰 항목(장), 2면 그 안의 항목(조). */
  readonly depth: 1 | 2;
}

export type { AlertTone, BadgeTone, CardTone, IconName, StructuredRow, TocEntry };
