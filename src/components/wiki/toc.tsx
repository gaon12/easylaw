import type { TocEntry } from "@/components/ui/types";
import { wiki } from "@/lib/strings";
import styles from "./toc.module.css";

/**
 * 목차. `DESIGN.md` §11.5
 *
 * **긴 문서의 첫 화면은 목차여야 한다.** 조문이 519개인 법을 위에서부터 읽어 내려가며
 * 찾는 사람은 없다. 위키가 목차를 문서 맨 앞에 두는 이유가 그것이다.
 *
 * `<nav>` 안의 그냥 링크다 — **자바스크립트가 없어도 동작한다.** 앵커 이동은 브라우저가
 * 하는 일이고, 스크롤 위치를 좇아 현재 항목을 굵게 하는 것 같은 일은 하지 않는다.
 * 그건 스크립트가 있어야 하고, 없어도 목차는 제 일을 한다.
 *
 * 넓은 화면에서는 옆에 붙어 따라온다(`position: sticky`). 좁은 화면에서는 접어 둔다 —
 * 목차가 화면을 다 채우면 본문을 보려고 스크롤부터 해야 한다.
 */
function TableOfContents({ entries, label }: { entries: readonly TocEntry[]; label?: string }) {
  if (entries.length === 0) {
    return null;
  }

  const tocLabel = label ?? wiki.tocLabel;

  return (
    <>
      {/*
        `open`은 반응형 CSS로 바꿀 수 없다. 데스크톱과 모바일의 기본 상태를 각각
        실제 `<details>` 상태로 표현하고, CSS로 한 쪽만 노출한다. 숨긴 nav는
        `display: none`이므로 스크린리더에도 같은 목차가 두 번 읽히지 않는다.
      */}
      <nav aria-label={tocLabel} className={`${styles.toc} ${styles.desktop}`}>
        <details className={styles.box} open={true}>
          <summary className={styles.summary}>{tocLabel}</summary>
          <TocLinks entries={entries} />
        </details>
      </nav>
      <nav aria-label={tocLabel} className={`${styles.toc} ${styles.mobile}`}>
        <details className={styles.box}>
          <summary className={styles.summary}>{tocLabel}</summary>
          <TocLinks entries={entries} />
        </details>
      </nav>
    </>
  );
}

function TocLinks({ entries }: { entries: readonly TocEntry[] }) {
  return (
    <ol className={styles.list}>
      {entries.map((entry) => (
        <li className={entry.depth === 1 ? styles.top : styles.sub} key={entry.id}>
          <a className={styles.link} href={`#${entry.id}`}>
            {entry.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

export { TableOfContents };
