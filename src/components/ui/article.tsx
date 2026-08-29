import type { ReactNode } from "react";
import styles from "./article.module.css";

interface Section {
  readonly heading: string;
  readonly body: readonly string[];
}

/**
 * 긴 글 화면. 처리방침·라이선스처럼 문단으로 이루어진 페이지가 쓴다.
 *
 * 목차를 두지 않았다. 이 문서들은 스크롤 두세 번이면 끝나고, 그 길이에 목차를 붙이면
 * 목차가 본문보다 먼저 눈에 들어와 오히려 읽기를 방해한다.
 */
function Article({
  title,
  intro,
  updatedAt,
  sections,
  children,
}: {
  title: string;
  intro: string;
  updatedAt?: string;
  sections?: readonly Section[];
  children?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        {updatedAt === undefined ? null : <p className={styles.updatedAt}>{updatedAt}</p>}
      </header>

      <div className={styles.body}>
        {sections?.map((section) => (
          <section className={styles.section} key={section.heading}>
            <h2 className={styles.heading}>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p className={styles.paragraph} key={paragraph}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        {children}
      </div>
    </div>
  );
}

export { Article };
