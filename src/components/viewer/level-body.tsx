import type { ReactNode } from "react";
import styles from "./level-body.module.css";
import type { ViewLevel } from "./levels";

/**
 * 레벨별 본문 컨테이너. `DESIGN.md` §7 — `level-body`
 *
 * 레벨에 따라 타이포·최대 줄 길이·문단 간격을 **한 번에** 바꾸는 래퍼다.
 *
 * | 레벨 | 최대 줄 길이 | 문단 간격 |
 * |---|---|---|
 * | L0·L1 | 현재 문서 열 | space-4 |
 * | L2 | 76ch | space-4 |
 * | L3 | 60ch | space-5 |
 * | L4 | 46ch | space-6 |
 *
 * 줄 길이 상한은 KRDS에 없는 값이고, **짧은 줄이 읽기 부담을 줄인다는 Easy-Read 관행**에
 * 따른 권장값이다. 화면마다 폭을 따로 정하면 이 규칙이 지켜지지 않는다.
 *
 * L4 본문은 어떤 폭에서도 축소하지 않는다(§11).
 */
function LevelBody({ level, children }: { level: ViewLevel; children: ReactNode }) {
  return <div className={`${styles.body} ${styles[level]}`}>{children}</div>;
}

export { LevelBody };
