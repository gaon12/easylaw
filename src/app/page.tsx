import { LevelDemo } from "@/components/landing/level-demo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { home, viewer } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 홈. `PAGES.md` §2 · `DESIGN.md` §5.1
 *
 * 첫 화면이 하는 일은 두 가지다 — **무엇인지 보여 주는 것**과 **바로 시작하게 하는 것**.
 * 그래서 히어로를 두 칸으로 나눴다. 왼쪽은 설명과 검색창, 오른쪽은 같은 판결을 다섯 가지
 * 말로 옮긴 데모다. 이 제품을 문장으로 설명하는 것보다 한 번 만져 보는 편이 빠르다.
 *
 * 배경 띠로 구간을 나눈다: `subtle`(찾기) → `canvas`(올리기) → `muted`(누구를 위한) →
 * `canvas`(왜 만들었나). `muted`는 화면에 한 번만 쓴다.
 */
export default function HomePage() {
  return (
    <>
      <Section label={home.searchLabel} leading={true} tone="subtle">
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>{home.heroTitle}</h1>
            <p className={styles.heroBody}>{home.heroBody}</p>

            {/* 검색은 평범한 GET 폼이다. 자바스크립트 없이도 동작해야 한다. */}
            <form action="/search" className={styles.searchCard} method="get">
              {/* label이 input을 감싸면 id/htmlFor 없이도 연결된다 — 서버 컴포넌트에서 useId를 쓸 수 없다. */}
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
          </div>

          <div className={styles.heroDemo}>
            <LevelDemo />
          </div>
        </div>
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
              {/* 데모의 단계 칩과 같은 이름을 쓴다. 두 곳이 같은 것을 가리켜야 한다. */}
              <span className={styles.audienceLevel}>{viewer.levels[audience.level]}</span>
              <h3 className={styles.audienceTitle}>{audience.title}</h3>
              <p className={styles.audienceBody}>{audience.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section label={home.originTitle} size="tight" tone="canvas">
        <div className={styles.origin}>
          <h2 className={styles.sectionTitle}>{home.originTitle}</h2>
          <p className={styles.originLead}>{home.originLead}</p>
          {home.originBody.map((paragraph) => (
            <p className={styles.originBody} key={paragraph}>
              {paragraph}
            </p>
          ))}
          <p className={styles.originSource}>{home.originSource}</p>
        </div>
      </Section>
    </>
  );
}
