import { Article } from "@/components/ui/article";
import { StructuredList } from "@/components/ui/structured-list";
import { legal } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 오픈소스 라이선스와 출처. `DESIGN.md` §13
 *
 * KRDS 출처 표기는 이용 조건이 요구하는 **의무**다(§13.1). 나머지는 의무가 아닌 것도
 * 있지만, 무엇 위에 서 있는지 밝히는 편이 맞다.
 */
export default function LegalPage() {
  return (
    <Article intro={legal.intro} title={legal.title}>
      <section className={styles.section}>
        <h2 className={styles.heading}>{legal.sourcesTitle}</h2>
        <dl className={styles.sources}>
          {legal.sources.map((source) => (
            <div className={styles.source} key={source.name}>
              <dt className={styles.sourceName}>{source.name}</dt>
              <dd className={styles.sourceBody}>{source.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{legal.licensesTitle}</h2>
        <StructuredList
          rows={legal.licenses.map((entry) => ({
            label: entry.name,
            value: legal.licenseLine(entry.version, entry.license),
          }))}
        />
        <p className={styles.note}>{legal.licenseNote}</p>
      </section>
    </Article>
  );
}

export const metadata = { title: legal.title };
