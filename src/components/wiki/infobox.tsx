import type { ReactNode } from "react";
import type { InfoRow } from "@/components/ui/types";
import styles from "./infobox.module.css";

/**
 * 문서 정보 틀. `DESIGN.md` §11.5
 *
 * 위키가 문서 맨 위에 두는 그 상자다. 제목 띠 아래에 **라벨/값 두 열**이 늘어선다.
 *
 * **왜 카드가 아니라 틀인가.** 카드(`DESIGN.md` §6)는 목록의 한 칸이고, 이것은 문서의
 * 머리다. 사건번호·법원·선고일처럼 **문서를 특정하는 값**이 한자리에 모여 있어야 하고,
 * 그 자리는 눈에 먼저 들어와야 한다. 제목은 표 머리처럼 중립적인 띠로만 구분한다.
 *
 * 값이 없는 줄은 부르는 쪽에서 빼고 넘긴다 — 빈칸은 정보가 아니다.
 */

function WikiInfobox({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: readonly InfoRow[];
  /** 틀 아래에 붙는 한 줄(출처·주의). 없으면 넣지 않는다. */
  footer?: ReactNode;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section aria-label={title} className={styles.box}>
      <h2 className={styles.title}>{title}</h2>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div className={styles.row} key={row.label}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {footer === undefined ? null : <p className={styles.footer}>{footer}</p>}
    </section>
  );
}

export { WikiInfobox };
