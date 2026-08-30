import type { ReactNode } from "react";
import styles from "./card.module.css";
import type { CardTone } from "./types";

/**
 * 카드. `DESIGN.md` §6 — `card-default` / `card-elevated` / `card-selected`
 *
 * **세 상태가 전부다.** §11이 "카드에 색상 좌측 보더 액센트를 쓰지 않는다"고 못 박는다.
 * 상태를 알리고 싶으면 카드가 아니라 안쪽의 배지가 한다.
 *
 * 화면마다 `border 1px + radius + padding`을 다시 적던 것을 여기로 모은다. 손으로 적으면
 * 값이 조금씩 달라지고, 그 어긋남이 쌓이면 화면이 서로 다른 사람이 만든 것처럼 보인다.
 */

type CardPadding = "default" | "tight" | "none";

function Card({
  tone = "default",
  padding = "default",
  as: Tag = "div",
  className,
  children,
}: {
  tone?: CardTone;
  padding?: CardPadding;
  /**
   * 목록 항목이면 `li`처럼 의미에 맞는 태그를 준다.
   *
   * `form`은 넣지 않았다. 카드가 폼 자체가 되면 `action`·`method` 같은 폼 속성을
   * 이 컴포넌트가 전부 받아 넘겨야 하는데, 그러면 카드가 폼의 사정을 알게 된다.
   * 폼은 카드 **바깥**에 두고 카드는 안쪽 모양만 맡는다.
   */
  as?: "div" | "li" | "section";
  className?: string;
  children: ReactNode;
}) {
  const classes = [styles.card, styles[tone], styles[`pad-${padding}`], className]
    .filter(Boolean)
    .join(" ");

  return <Tag className={classes}>{children}</Tag>;
}

export { Card };
