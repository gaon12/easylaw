import type { ReactNode } from "react";
import styles from "./section.module.css";

/**
 * 섹션 표면. `DESIGN.md` §5.1
 *
 * `hero`는 **네 번째 표면이고 의도한 예외다.** 나머지 셋은 밝기가 96~100%에 몰려 있어
 * 넓은 면에서 띠로 읽히지 않는다. 첫 화면 맨 위에만 쓴다.
 */
type SectionTone = "canvas" | "subtle" | "muted" | "hero";
type SectionSize = "default" | "tight";

interface SectionProps {
  /**
   * 배경 표면. `DESIGN.md` §5.1
   *
   * 연속한 두 섹션은 같은 표면을 쓰지 않는다. `muted`는 한 화면에 한 번만 쓴다 —
   * secondary-10은 푸른 기가 도는 색이라 반복하면 화면이 탁해진다.
   */
  tone?: SectionTone;
  /** 첫 섹션인가. 위쪽 여백을 조금 줄여 헤더에 붙인다. */
  leading?: boolean;
  /** 뷰어처럼 2단 대조가 필요한 화면에서 컨테이너를 넓힌다. */
  wide?: boolean;
  size?: SectionSize;
  /** 스크린리더가 구간을 건너뛸 수 있도록 각 띠에 이름을 준다. */
  label?: string;
  children: ReactNode;
}

/**
 * 화면 폭 전체를 채우는 섹션 띠.
 *
 * 랜딩·안내 화면에서만 표면을 교차한다. 뷰어·폼·목록은 단일 `canvas`를 쓰고 위계는
 * 카드 보더가 만든다 — 밀도 높은 화면에서 띠를 교차하면 읽는 흐름이 끊긴다.
 */
function Section({
  tone = "canvas",
  leading = false,
  wide = false,
  size = "default",
  label,
  children,
}: SectionProps) {
  const className = [
    styles.band,
    styles[tone],
    leading ? styles.leading : "",
    wide ? styles.wide : "",
    size === "tight" ? styles.tight : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section aria-label={label} className={className}>
      <div className={styles.inner}>{children}</div>
    </section>
  );
}

export { Section };
