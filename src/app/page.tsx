import { Button, ButtonLink } from "@/components/ui/button";
import { home } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 홈. `PAGES.md` §2 — 검색이 첫 번째, 업로드가 두 번째다.
 *
 * 검색은 평범한 GET 폼이다. 자바스크립트 없이도 동작해야 한다.
 */
export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{home.heroTitle}</h1>
        <p className={styles.heroBody}>{home.heroBody}</p>
      </section>

      <form action="/search" className={styles.searchCard} method="get">
        {/* label이 input을 감싸면 id/htmlFor 없이도 연결된다 — 서버 컴포넌트에서 useId를 쓸 수 없으므로 이 편이 정확하다. */}
        <label className={styles.searchLabel}>
          <span className={styles.searchLabelText}>{home.searchLabel}</span>
          <span className={styles.searchRow}>
            <input
              autoComplete="off"
              className={styles.searchInput}
              name="q"
              placeholder={home.searchPlaceholder}
              type="search"
            />
            <Button size="m" type="submit">
              {home.searchSubmit}
            </Button>
          </span>
        </label>
        <p className={styles.searchHint}>{home.searchHint}</p>
      </form>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{home.uploadTitle}</h2>
        <div className={styles.uploadCard}>
          <p className={styles.sectionBody}>{home.uploadBody}</p>
          <ButtonLink href="/upload" size="m" variant="tertiary">
            {home.uploadCta}
          </ButtonLink>
        </div>
        <h3 className={styles.sectionTitle}>{home.privacyTitle}</h3>
        <ul className={styles.privacyList}>
          {home.privacyPoints.map((point) => (
            <li className={styles.privacyItem} key={point}>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{home.audienceTitle}</h2>
        <ul className={styles.audienceGrid}>
          {home.audiences.map((audience) => (
            <li className={styles.audienceCard} key={audience.title}>
              <h3 className={styles.audienceTitle}>{audience.title}</h3>
              <p className={styles.audienceBody}>{audience.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
