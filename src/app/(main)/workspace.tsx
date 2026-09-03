import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { home, workspace } from "@/lib/strings";
import styles from "./workspace.module.css";

interface RecentDoc {
  readonly id: string;
  readonly filename: string | null;
  readonly uploadedAt: Date;
}

/**
 * 로그인한 사람의 첫 화면. `PAGES.md` §2
 *
 * **랜딩과 다른 화면이다.** 랜딩이 하는 일은 "이게 뭔지 알리고 시작하게 하는 것"인데,
 * 이미 계정을 만들고 들어온 사람에게 그 설명을 다시 보여 주는 것은 자리 낭비다.
 * 그 사람에게 필요한 것은 **하던 일로 바로 돌아가는 것**이다.
 *
 * 그래서 세 가지만 둔다 — 찾기, 올리기, 내가 올린 것. data.go.kr이 로그인 뒤
 * 마이페이지로 데려가는 것과 같은 이유다.
 */
function Workspace({
  email,
  recent,
  totalDocs,
  timeZone,
}: {
  email: string | null;
  recent: readonly RecentDoc[];
  totalDocs: number;
  timeZone: string;
}) {
  return (
    <>
      <Section label={workspace.title} leading={true} tone="hero">
        <div className={styles.head}>
          <h1 className={styles.title}>{workspace.greeting(email)}</h1>
          <p className={styles.body}>{workspace.intro}</p>

          {/* 찾기가 첫 자리다. 로그인했든 아니든 가장 자주 하는 일이다. */}
          <form action="/search" method="get">
            <Card className={styles.searchCard} tone="elevated">
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
      </Section>

      <Section label={workspace.docsTitle} tone="canvas">
        <div className={styles.docsHead}>
          <h2 className={styles.sectionTitle}>{workspace.docsTitle}</h2>
          <Link className={styles.more} href="/cases">
            {workspace.seeAll(totalDocs)}
          </Link>
        </div>

        {recent.length === 0 ? (
          <Card className={styles.emptyCard}>
            <p className={styles.body}>{workspace.emptyBody}</p>
            <ButtonLink href="/upload" size="m">
              {workspace.uploadCta}
            </ButtonLink>
          </Card>
        ) : (
          <ul className={styles.docs}>
            {recent.map((doc) => (
              <Card as="li" key={doc.id} padding="tight">
                <Link className={styles.docLink} href={`/doc/${doc.id}`}>
                  {doc.filename ?? workspace.untitled}
                </Link>
                <p className={styles.docMeta}>{formatDate(doc.uploadedAt, timeZone)}</p>
              </Card>
            ))}
          </ul>
        )}
      </Section>

      <Section label={workspace.uploadTitle} size="tight" tone="subtle">
        <div className={styles.uploadRow}>
          <div>
            <h2 className={styles.sectionTitle}>{workspace.uploadTitle}</h2>
            <p className={styles.body}>{workspace.uploadBody}</p>
          </div>
          <ButtonLink href="/upload" size="m" variant="secondary">
            {workspace.uploadCta}
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}

export { Workspace };
export type { RecentDoc };
