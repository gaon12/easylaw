import Link from "next/link";
import { viewer } from "@/lib/strings";
import { LEVEL_ORDER, type ViewLevel } from "./levels";
import styles from "./viewer.module.css";

/**
 * 레벨 스위처. `PAGES.md` §5.2 ②
 *
 * 링크로 만든다 — 자바스크립트 없이도 단계를 바꿀 수 있어야 하고, 각 단계가 공유 가능한
 * 주소를 가져야 한다. 현재 단계는 `aria-current`로 알린다.
 */
function LevelTabs({ caseNoCanonical, current }: { caseNoCanonical: string; current: ViewLevel }) {
  const base = `/case/${encodeURIComponent(caseNoCanonical)}`;

  return (
    <nav aria-label={viewer.levelGroupLabel} className={styles.levels}>
      {LEVEL_ORDER.map((level) => (
        <Link
          aria-current={level === current ? "page" : undefined}
          className={`${styles.level} ${level === current ? styles.levelActive : ""}`}
          href={`${base}?level=${level}`}
          key={level}
        >
          {viewer.levels[level]}
        </Link>
      ))}
    </nav>
  );
}

export { LevelTabs };
