import type { ReactNode } from "react";

/**
 * UI 컴포넌트가 주고받는 타입.
 *
 * 컴포넌트 파일에서 타입을 함께 내보내면 Fast Refresh가 동작하지 않는다(`.tsx`가 컴포넌트만
 * 내보내야 한다). 타입은 런타임에 사라지므로 실제로 새로고침이 깨지지는 않지만, 규칙을
 * 파일마다 끄는 것보다 타입을 한곳에 모으는 편이 낫다 — 어떤 톤이 있는지 한 파일만 보면 된다.
 */

/**
 * 아이콘. `DESIGN.md` §5 — 라인 아이콘, 24 그리드, 스트로크 2px.
 *
 * 앞의 넷은 상태(근거 있음·확인 필요·근거 없음·안내)이고, 뒤의 여섯은 **길잡이**다 —
 * 첫 화면의 바로가기가 쓴다. 이모지를 쓰지 않기로 한 이상(§11) 그림이 필요한 자리에는
 * 아이콘을 만들어 둔다.
 */
type IconName =
  | "check"
  | "alert"
  | "cross"
  | "info"
  | "upload"
  | "folder"
  | "search"
  | "book"
  | "settings"
  | "shield";

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

/** 위키 정보 틀의 한 줄. `DESIGN.md` §11.5 */
interface InfoRow {
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

export type { AlertTone, BadgeTone, CardTone, IconName, InfoRow, StructuredRow, TocEntry };
