import type { ReactNode } from "react";
import { disclaimer, setup, site } from "@/lib/strings";
import styles from "./setup-shell.module.css";

/**
 * 설치 마법사의 셸. `DESIGN.md` §2 · §5.1
 *
 * **서비스 셸을 쓰지 않는다.** 이유는 취향이 아니다.
 * - 헤더 메뉴(문서함·화면 설정·이용 안내)는 전부 설치가 끝나야 열리는 화면을 가리킨다.
 *   설치 중에 누르면 다시 이 화면으로 되튕긴다 — 동작하지 않는 메뉴를 그릴 이유가 없다.
 * - 푸터의 "AI가 만든 설명" 고지는 설치 화면에서 가리킬 대상이 없다.
 * - 읽는 사람이 다르다. 여기 있는 사람은 서버를 세우는 사람이고, 지금 할 일은 하나뿐이다.
 *   고를 것이 하나면 고르는 자리를 만들지 않는다.
 *
 * 대신 성격을 분명히 한다 — 바탕을 `bg-subtle`로 깔아 흰 카드가 떠 보이게 하고,
 * 메뉴가 있던 자리에 진행 표시줄을 둔다.
 *
 * 비정부 고지 한 줄은 남긴다(`DESIGN.md` §2). 판결문을 다루는 물건이라는 사실은
 * 설치하는 사람이 가장 먼저 알아야 한다.
 */
function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>{site.name}</span>
          <span className={styles.badge}>{setup.chromeLabel}</span>
        </div>
      </header>

      {/* biome-ignore lint/correctness/useUniqueElementIds: 건너뛰기 링크의 목적지로, 문서에 하나만 존재한다. useId는 서버 컴포넌트에서 쓸 수 없다. */}
      <main className={styles.main} id="main">
        <div className={styles.inner}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.note}>{setup.chromeNote}</p>
          <p className={styles.note}>{disclaimer.notGovernment}</p>
        </div>
      </footer>
    </div>
  );
}

export { SetupShell };
