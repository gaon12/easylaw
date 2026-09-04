import type { ReactNode } from "react";
import styles from "./alert.module.css";
import { Icon } from "./icon";
import type { AlertTone, IconName } from "./types";

/**
 * 경고·오류 알림. `DESIGN.md` §6
 *
 * 규격: 파스텔 배경(§3.2) + **동색 1px 보더**. 좌측 색 보더 액센트가 아니다 —
 * 그건 `contextual-help`(용어 풀이)의 것이고, 카드에는 §11이 명시적으로 금지한다.
 *
 * **원인과 다음 단계를 함께 적는다**(§6·§9). 무엇이 잘못됐는지만 알려 주고 끝내면
 * 사용자는 막다른 곳에 남는다. 그래서 `actions`가 붙는 자리를 처음부터 뒀다.
 *
 * 기한 임박처럼 색이 아니라 **문장이 먼저** 말해야 하는 경우도 이 컴포넌트를 쓴다(§6).
 */

const ICONS: Readonly<Record<AlertTone, IconName>> = {
  success: "check",
  warning: "alert",
  danger: "cross",
};

function Alert({
  tone,
  title,
  children,
  actions,
}: {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`${styles.alert} ${styles[tone]}`}>
      <span className={styles.mark}>
        <Icon name={ICONS[tone]} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children === undefined ? null : <div className={styles.text}>{children}</div>}
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
    </section>
  );
}

export { Alert };
