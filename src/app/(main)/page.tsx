import { LevelDemo } from "@/components/landing/level-demo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { listUploadsForOwner } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { home, viewer } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import styles from "./page.module.css";
import { Workspace } from "./workspace";

/**
 * 홈. `PAGES.md` §2 · `DESIGN.md` §5.1
 *
 * 첫 화면이 하는 일은 두 가지다 — **무엇인지 보여 주는 것**과 **바로 시작하게 하는 것**.
 * 그래서 히어로를 두 칸으로 나눴다. 왼쪽은 설명과 검색창, 오른쪽은 같은 판결을 다섯 가지
 * 말로 옮긴 데모다. 이 제품을 문장으로 설명하는 것보다 한 번 만져 보는 편이 빠르다.
 *
 * 배경 띠로 구간을 나눈다: `hero`(찾기) → `canvas`(올리기) → `subtle`(누구를 위한) →
 * `canvas`(왜 만들었나).
 *
 * **히어로에 `hero` 면을 쓴다.** 예전에는 `subtle`이었는데, 그 면은 흰색과 밝기가 3.5%밖에
 * 차이 나지 않아 첫 화면이 통째로 흰 종이처럼 보였다. data.go.kr·krds.go.kr의 첫 화면은
 * 상단에 색이 분명한 면을 둔다. `DESIGN.md` §5.1의 의도한 예외다.
 */
/** 첫 화면에 보여 줄 최근 문서 수. 많이 보여 줄 자리가 아니다 — 전체는 문서함이 맡는다. */
const RECENT_LIMIT = 4;

export default async function HomePage() {
  /*
   * **로그인했으면 랜딩을 보여 주지 않는다.** 이미 계정을 만들고 들어온 사람에게
   * "이게 뭔지"를 다시 설명하는 것은 자리 낭비다. 그 사람에게 필요한 것은 하던 일로
   * 바로 돌아가는 길이다(`PAGES.md` §2).
   */
  const session = await currentSession();
  if (session !== undefined) {
    const docs = listUploadsForOwner(appDb(), session.userId);
    return (
      <Workspace
        email={session.email}
        recent={docs.slice(0, RECENT_LIMIT)}
        timeZone={siteTimeZone()}
        totalDocs={docs.length}
      />
    );
  }

  return (
    <>
      <Section label={home.searchLabel} leading={true} tone="hero">
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>{home.heroTitle}</h1>
            <p className={styles.heroBody}>{home.heroBody}</p>

            {/* 검색은 평범한 GET 폼이다. 자바스크립트 없이도 동작해야 한다. */}
            <form action="/search" method="get">
              <Card className={styles.searchCard} tone="elevated">
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
              </Card>
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

          <Card className={styles.privacy} padding="tight">
            <h3 className={styles.privacyTitle}>{home.privacyTitle}</h3>
            <ul className={styles.privacyList}>
              {home.privacyPoints.map((point) => (
                <li className={styles.privacyItem} key={point}>
                  {point}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section label={home.audienceTitle} tone="subtle">
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
