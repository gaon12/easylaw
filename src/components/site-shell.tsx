import Link from "next/link";
import type { ReactNode } from "react";
import { disclaimer, site } from "@/lib/strings";
import styles from "./site-shell.module.css";

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
