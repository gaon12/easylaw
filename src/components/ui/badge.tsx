import styles from "./badge.module.css";
import { Icon } from "./icon";
import type { BadgeTone, IconName } from "./types";

/**
 * 배지. `DESIGN.md` §6 · §3.4
 *
 * 규격: 13px bold, `radius-xsmall`, outlined가 기본.
 *
 * **상태는 아이콘 + 라벨 + 색 3중으로 전달한다**(§11). 색만으로 구분하면 색을 구별하지
 * 못하는 사람에게는 아무 정보도 아니다. 그래서 톤마다 아이콘이 정해져 있고, 라벨은
 * 반드시 글자로 들어온다.
 *
 * `solid`는 화면에서 가장 무거운 사실 하나에만 쓴다 — 판결 결과 같은 것. 주 액션 색을
 * 나눠 쓰는 셈이라 여러 개를 두면 무엇이 중요한지 흐려진다(§11 "화면당 주 액션 하나").
 */

/** 톤마다 아이콘이 정해져 있다. 부르는 쪽이 고르게 두면 같은 뜻에 다른 그림이 붙는다. */
const ICONS: Readonly<Record<BadgeTone, IconName>> = {
  grounded: "check",
  "needs-check": "alert",
  ungrounded: "cross",
  neutral: "info",
};

function Badge({
  tone = "neutral",
  variant = "outlined",
  children,
}: {
  tone?: BadgeTone;
  variant?: "outlined" | "solid";
  children: string;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone]} ${styles[variant]}`}>
      <Icon name={ICONS[tone]} size={16} />
      {children}
    </span>
  );
}

export { Badge };
