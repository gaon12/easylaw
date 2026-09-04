import type { ReactNode } from "react";
import { Icon } from "./icon";
import styles from "./infobox.module.css";

/**
 * 법적 고지 배너. `DESIGN.md` §3.4 · §6
 *
 * 규격이 좁다 — **흰 배경 + 1px `info` 보더 + `info` 아이콘 원.** 한 가지 모양뿐이다.
 *
 * 경고와 오류는 이것이 아니라 `Alert`가 맡는다(§6에서 `infobox`와 `alert`는 다른
 * 컴포넌트다). 전에는 이 하나에 tone을 붙여 셋을 다 그렸는데, 그러면 파스텔 배경을 쓰는
 * alert 규격과 흰 배경을 쓰는 infobox 규격이 한 몸에 섞인다.
 */
function Infobox({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={styles.box}>
      <span className={styles.mark}>
        <Icon name="info" />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <div className={styles.text}>{children}</div>
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
    </section>
  );
}

export { Infobox };
