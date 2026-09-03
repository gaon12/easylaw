import Link from "next/link";
import type { ReactNode } from "react";
import { auth, disclaimer, site } from "@/lib/strings";
import { logOut } from "@/server/auth-actions";
import { currentSession, displayName } from "@/server/owner";
import styles from "./site-shell.module.css";

/** 헤더 아바타 크기. CSS와 같은 값이어야 브라우저가 자리를 미리 잡는다. */
const AVATAR_PX = 32;

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

  // 표시 이름 규칙은 `server/owner.ts`에 한 번만 적혀 있다.
  const name = displayName(session) ?? session.email;

  return (
    <>
      <Link className={styles.accountLink} href="/settings">
        {/*
          아바타는 우리 서버가 그린다(`/avatar/[seed]`). 외부 API를 쓰지 않는 이유는
          그 라우트 주석에 적었다. 장식이라 스크린리더에는 숨기고, 이름이 그 역할을 한다.

          biome-ignore lint/performance/noImgElement: 우리 라우트가 내주는 SVG다.
          next/image는 SVG를 최적화하지 못하고, 쓰려면 `dangerouslyAllowSVG`를 켜야 하는데
          그건 외부 SVG까지 함께 여는 설정이라 아바타 하나 때문에 켤 이유가 없다.
        */}
        <img
          alt=""
          className={styles.avatar}
          height={AVATAR_PX}
          src={`/avatar/${encodeURIComponent(name)}`}
          width={AVATAR_PX}
        />
        <span className={styles.accountName}>{name}</span>
      </Link>
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

      {/*
        헤더는 좁은 화면에서 두 줄이 된다. 계정 영역이 붙으면서 한 줄에 들어갈 수 없게 됐다.
        접었다 펴는 메뉴로 감추지 않는다 — 링크가 다섯 개뿐이라 감출 만큼 많지 않고,
        감추면 한 번 더 눌러야 한다. 여는 동작 하나가 늘어나는 것보다 두 줄이 낫다.
      */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/">
            {site.name}
          </Link>

          <nav aria-label={site.nav.menuLabel} className={styles.nav}>
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

          <div className={styles.account}>
            <AccountNav />
          </div>
        </div>
      </header>

      {/* biome-ignore lint/correctness/useUniqueElementIds: 건너뛰기 링크의 목적지로, 문서에 하나만 존재한다. useId는 서버 컴포넌트에서 쓸 수 없다. */}
      <main className={styles.main} id="main">
        {children}
      </main>

      {/*
        푸터의 두 고지는 **닫을 수 없다**(`DESIGN.md` §2).
        판결문을 다루는 서비스가 관공서처럼 보이면 사용자가 공적 효력을 오인하는데,
        그건 미학 문제가 아니라 안전 문제다. AI가 만든 설명이라는 사실도 같은 이유로 상시 노출한다.
      */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.disclaimer}>{disclaimer.notGovernment}</p>
          <p className={styles.disclaimer}>{disclaimer.aiGenerated}</p>
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
          <p className={styles.attribution}>{disclaimer.attribution}</p>
        </div>
      </footer>
    </div>
  );
}

export { SiteShell };
