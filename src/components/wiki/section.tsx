import type { ReactNode } from "react";
import { wiki } from "@/lib/strings";
import styles from "./section.module.css";

/**
 * 앵커가 달린 절. `DESIGN.md` §11.5
 *
 * 제목 옆에 **그 절로 바로 가는 링크**를 둔다. 위키에서 문단 제목 옆의 `¶`가 하는 일이다 —
 * 긴 문서에서 "이 부분"을 가리켜 남에게 보내려면 그 자리의 주소가 있어야 한다.
 *
 * 링크에 이름을 붙여 준다(`aria-label`). 기호만 있으면 스크린리더가 "문단 기호"라고만
 * 읽고 어디로 가는 링크인지 알려 주지 못한다.
 */
function WikiSection({
  id,
  heading,
  level = 2,
  meta,
  children,
}: {
  id: string;
  heading: string;
  /** 제목 단계. 문서 구조를 건너뛰지 않으려고 부르는 쪽이 정한다. */
  level?: 2 | 3;
  /** 제목 옆에 붙는 부가 정보(시행일 등). */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";

  return (
    <section className={styles.section} id={id}>
      <div className={styles.head}>
        <Heading className={styles.heading}>
          {heading}
          <a aria-label={wiki.anchorTo(heading)} className={styles.anchor} href={`#${id}`}>
            {wiki.anchorMark}
          </a>
        </Heading>
        {meta === undefined ? null : <div className={styles.meta}>{meta}</div>}
      </div>
      {children}
    </section>
  );
}

export { WikiSection };
