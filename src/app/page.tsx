import { Button, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { home } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 홈. `PAGES.md` §2 — 검색이 첫 번째, 업로드가 두 번째다.
 *
 * 배경 띠로 구간을 나눈다(`DESIGN.md` §5.1). 랜딩은 스크롤이 길고 성격이 다른 구간이
 * 이어지므로 표면 교차가 맞다 — `subtle`(찾기) → `canvas`(올리기) → `muted`(누구를 위한).
 * `muted`는 화면에 한 번만 쓰고, 그 아래 푸터가 다시 `subtle`이라 경계가 이어진다.
 *
 * 검색은 평범한 GET 폼이다. 자바스크립트 없이도 동작해야 한다.
 */
export default function HomePage() {
  return (
    <>
      <Section label={home.searchLabel} leading={true} tone="subtle">
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>{home.heroTitle}</h1>
          <p className={styles.heroBody}>{home.heroBody}</p>
        </div>

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
      </Section>

      <Section label={home.uploadTitle} tone="canvas">
        <div className={styles.uploadRow}>
          <div className={styles.upload}>
            <h2 className={styles.sectionTitle}>{home.uploadTitle}</h2>
            <p className={styles.sectionBody}>{home.uploadBody}</p>
            <ButtonLink href="/upload" size="m" variant="secondary">
              {home.uploadCta}
            </ButtonLink>
          </div>

          <div className={styles.privacy}>
            <h3 className={styles.privacyTitle}>{home.privacyTitle}</h3>
            <ul className={styles.privacyList}>
              {home.privacyPoints.map((point) => (
                <li className={styles.privacyItem} key={point}>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section label={home.audienceTitle} tone="muted">
        <h2 className={styles.sectionTitle}>{home.audienceTitle}</h2>
        <ul className={styles.audienceGrid}>
          {home.audiences.map((audience) => (
            <li className={styles.audienceCard} key={audience.title}>
              <h3 className={styles.audienceTitle}>{audience.title}</h3>
              <p className={styles.audienceBody}>{audience.body}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
