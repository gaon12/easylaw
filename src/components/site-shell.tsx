import Link from "next/link";
import type { ReactNode } from "react";
import { logOut } from "@/app/signup/actions";
import { auth, disclaimer, site } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import styles from "./site-shell.module.css";

/**
 * 헤더의 계정 영역.
 *
 * 로그인 여부는 세션 쿠키를 읽어야 알 수 있고, 그래서 **모든 페이지가 요청 시점
 * 렌더가 된다.** 홈처럼 정적으로 만들 수 있던 화면까지 포함해서다. 그 대가를 알고
 * 감수한다 — 로그인해 놓고도 헤더가 로그인 상태를 모르는 화면이 더 나쁘다.
 * 나중에 Cache Components(PPR)를 켜면 이 부분만 스트리밍으로 떼어낼 수 있다.
 */
async function AccountNav() {
  const session = await currentSession();

  if (session?.email == null) {
    return (
      <>
        <Link className={styles.navLink} href="/login">
          {auth.logInTitle}
        </Link>
        <Link className={`${styles.navLink} ${styles.navCta}`} href="/signup">
          {auth.signUpTitle}
        </Link>
      </>
    );
  }

  return (
    <>
      <span className={styles.account}>{session.email}</span>
      {/* 로그아웃은 상태를 바꾸는 동작이라 링크가 아니라 폼이어야 한다. */}
      <form action={logOut}>
        <button className={styles.navButton} type="submit">
          {auth.logOut}
        </button>
      </form>
    </>
  );
}

/**
 * 모든 페이지의 셸. `PAGES.md` §1.1
 *
 * KRDS의 정부 표식 스트립·마스트헤드·seal은 쓰지 않는다(`DESIGN.md` §2).
 * 푸터의 비정부 고지는 닫을 수 없다.
 */
function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        {site.skipToContent}
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/">
            {site.name}
          </Link>
          <nav className={styles.nav} aria-label={site.nav.home}>
            <Link className={styles.navLink} href="/cases">
              {site.nav.cases}
            </Link>
            <Link className={styles.navLink} href="/settings">
              {site.nav.settings}
            </Link>
            <Link className={styles.navLink} href="/help">
              {site.nav.help}
            </Link>
            <span className={styles.navDivider} />
            <AccountNav />
          </nav>
        </div>
      </header>

      {/* biome-ignore lint/correctness/useUniqueElementIds: 건너뛰기 링크의 목적지로, 문서에 하나만 존재한다. useId는 서버 컴포넌트에서 쓸 수 없다. */}
      <main className={styles.main} id="main">
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.disclaimer}>{disclaimer.notGovernment}</p>
          <ul className={styles.footerLinks}>
            <li>
              <Link className={styles.footerLink} href="/privacy">
                {disclaimer.privacy}
              </Link>
            </li>
            <li>
              <Link className={styles.footerLink} href="/help">
                {disclaimer.terms}
              </Link>
            </li>
            <li>
              <Link className={styles.footerLink} href="/legal">
                {disclaimer.openSource}
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

export { SiteShell };
