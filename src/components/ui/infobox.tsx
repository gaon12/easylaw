import type { ReactNode } from "react";
import styles from "./infobox.module.css";

type InfoboxTone = "info" | "warning" | "danger";

/**
 * 안내·경고 상자. `DESIGN.md` §6
 *
 * 색만으로 상태를 구분하지 않는다 — 아이콘 문자와 제목이 함께 의미를 전한다.
 * 오류는 원인만 적고 끝내지 않고 다음 행동(`actions`)을 함께 준다.
 */
function Infobox({
  tone = "info",
  title,
  children,
  actions,
}: {
  tone?: InfoboxTone;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const mark = tone === "info" ? "i" : "!";

  return (
    <section className={`${styles.box} ${styles[tone]}`}>
      <span aria-hidden="true" className={styles.mark}>
        {mark}
      </span>
      <div className={styles.body}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.text}>{children}</div>
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
    </section>
  );
}

export { Infobox };
