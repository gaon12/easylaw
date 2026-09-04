import Link from "next/link";
import { LevelDemo } from "@/components/landing/level-demo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Section } from "@/components/ui/section";
import type { IconName } from "@/components/ui/types";
import { listUploadsForOwner } from "@/db/app/repository";
import { appDb, corpusDb } from "@/db/client";
import { corpusStats, listSampleJudgments, type SampleJudgment } from "@/db/corpus/stats";
import { help, home, viewer } from "@/lib/strings";
import { currentSession, displayName } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import styles from "./page.module.css";
import { Workspace } from "./workspace";

/**
 * 홈. `PAGES.md` §2 · `DESIGN.md` §5.1
 *
 * 첫 화면이 하는 일은 두 가지다 — **무엇인지 보여 주는 것**과 **바로 시작하게 하는 것**.
 *
 * 그래서 위에서부터 이렇게 쌓는다: 큰 검색창 → 바로가기 여섯 → 우리가 가진 자료(숫자) →
 * 같은 판결을 다섯 가지 말로(데모) → 누구를 위한 것인가 → 올리기 → 자주 묻는 것 →
 * 왜 만들었나. 배경 띠로 구간을 나눈다(§5.1) — `hero` → `canvas` → `subtle` → `canvas`
 * → `muted` → `canvas` → `subtle` → `canvas`.
 *
 * **첫 화면의 숫자는 전부 우리 DB를 센 값이다.** 판결문을 다루는 서비스가 근거 없는
 * 수치를 랜딩에 걸면 그 순간 신뢰를 잃는다. 자료가 없으면 그 칸을 아예 그리지 않는다.
 */

/** 첫 화면에 보여 줄 최근 문서 수. 많이 보여 줄 자리가 아니다 — 전체는 문서함이 맡는다. */
const RECENT_LIMIT = 4;

/** 예시로 걸 판례 수. 줄바꿈 없이 한 줄에 들어가는 만큼. */
const EXAMPLE_LIMIT = 3;

/** 첫 화면에 낼 질문 수. 나머지는 이용 안내가 맡는다. */
const FAQ_LIMIT = 4;

/** 큰 검색창. RISS·data.go.kr처럼 첫 화면 한가운데에 둔다. */
function HeroSearch({ examples }: { examples: readonly SampleJudgment[] }) {
  return (
    <div className={styles.hero}>
      <h1 className={styles.heroTitle}>{home.heroTitle}</h1>
      <p className={styles.heroBody}>{home.heroBody}</p>

      {/* 검색은 평범한 GET 폼이다. 자바스크립트 없이도 동작해야 한다. */}
      {/* biome-ignore lint/correctness/useUniqueElementIds: 홈에 한 번만 렌더되는 고정 fragment 목적지다. */}
      <form action="/search" className={styles.searchForm} id="search" method="get">
        <Card className={styles.searchCard} tone="elevated">
          {/* label이 input을 감싸면 id/htmlFor 없이도 연결된다 — 서버 컴포넌트에서 useId를 쓸 수 없다. */}
          <label className={styles.searchLabel}>
            <span className="sr-only">{home.searchLabel}</span>
            <span className={styles.searchRow}>
              <input
                autoComplete="off"
                className={styles.searchInput}
                name="q"
                placeholder={home.searchPlaceholder}
                type="search"
              />
              <Button size="l" type="submit">
                {home.searchSubmit}
              </Button>
            </span>
          </label>
        </Card>
        <p className={styles.searchHint}>{home.searchHint}</p>
      </form>

      {/* 코퍼스에 실제로 있는 판례만 건다. 비어 있으면 이 줄이 아예 없다. */}
      {examples.length > 0 ? (
        <p className={styles.examples}>
          <span className={styles.examplesLabel}>{home.examplesLabel}</span>
          {examples.map((example) => (
            <Link
              className={styles.exampleChip}
              href={`/case/${encodeURIComponent(example.caseNoCanonical)}`}
              key={example.caseNoCanonical}
            >
              {example.caseNoDisplay}
            </Link>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** 바로가기 여섯. 아이콘은 거들 뿐이고 의미는 글자가 전한다(`DESIGN.md` §11). */
function QuickLinks() {
  return (
    <ul className={styles.quickGrid}>
      {home.quickLinks.map((link) => (
        <li key={link.href}>
          <Link className={styles.quickItem} href={link.href}>
            <span className={styles.quickIcon}>
              <Icon name={link.icon as IconName} size={28} />
            </span>
            <span className={styles.quickLabel}>{link.label}</span>
            <span className={styles.quickHint}>{link.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 숫자 하나. 값이 0이면 부르는 쪽에서 아예 그리지 않는다. */
function Stat({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <li className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statHint}>{hint}</span>
    </li>
  );
}

function Stats({ judgments, lawVersions }: { judgments: number; lawVersions: number }) {
  const formatter = new Intl.NumberFormat("ko-KR");

  return (
    <ul className={styles.statGrid}>
      {lawVersions > 0 ? (
        <Stat
          hint={home.statLawsHint}
          label={home.statLaws}
          value={formatter.format(lawVersions)}
        />
      ) : null}
      {judgments > 0 ? (
        <Stat
          hint={home.statCasesHint}
          label={home.statCases}
          value={formatter.format(judgments)}
        />
      ) : null}
      <Stat hint={home.statLevelsHint} label={home.statLevels} value={home.statLevelsValue} />
    </ul>
  );
}

/**
 * 자주 묻는 것. **이용 안내의 글을 그대로 쓴다** — 같은 질문에 두 벌의 답을 두면
 * 언젠가 한쪽만 고쳐진다.
 *
 * `details`라 자바스크립트 없이 열리고 닫힌다.
 */
function Faq() {
  return (
    <div className={styles.faq}>
      {help.full.slice(0, FAQ_LIMIT).map((item) => (
        <details className={styles.faqItem} key={item.heading}>
          <summary className={styles.faqQuestion}>{item.heading}</summary>
          <p className={styles.faqAnswer}>{item.body[0]}</p>
        </details>
      ))}
    </div>
  );
}

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
        name={displayName(session)}
        recent={docs.slice(0, RECENT_LIMIT)}
        timeZone={siteTimeZone()}
        totalDocs={docs.length}
      />
    );
  }

  const db = corpusDb();
  const stats = corpusStats(db);
  const examples = listSampleJudgments(db, EXAMPLE_LIMIT);

  return (
    <>
      <Section wide={true} label={home.searchLabel} leading={true} tone="hero">
        <HeroSearch examples={examples} />
      </Section>

      <Section wide={true} label={home.quickLinksLabel} size="tight">
        <QuickLinks />
      </Section>

      <Section wide={true} label={home.statsLabel} size="tight" tone="subtle">
        <Stats judgments={stats.judgments} lawVersions={stats.lawVersions} />
      </Section>

      <Section wide={true} label={home.demoTitle}>
        <div className={styles.centered}>
          <h2 className={styles.sectionTitle}>{home.demoTitle}</h2>
          <p className={styles.sectionBody}>{home.demoBody}</p>
        </div>
        <LevelDemo />
      </Section>

      <Section wide={true} label={home.audienceTitle} tone="muted">
        <div className={styles.centered}>
          <h2 className={styles.sectionTitle}>{home.audienceTitle}</h2>
        </div>
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

      <Section wide={true} label={home.uploadTitle}>
        <div className={styles.uploadRow}>
          <div className={styles.upload}>
            <h2 className={styles.sectionTitle}>{home.uploadTitle}</h2>
            <p className={styles.sectionBody}>{home.uploadBody}</p>
            <ButtonLink href="/upload" size="l">
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

      <Section wide={true} label={home.faqTitle} tone="subtle">
        <div className={styles.centered}>
          <h2 className={styles.sectionTitle}>{home.faqTitle}</h2>
        </div>
        <Faq />
        <p className={styles.faqMore}>
          <Link className={styles.textLink} href="/help">
            {home.faqMore}
          </Link>
        </p>
      </Section>

      <Section wide={true} label={home.originTitle} size="tight">
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
