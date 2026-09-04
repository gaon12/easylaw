"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readPreferences, writePreferences } from "@/lib/preferences";
import { viewer } from "@/lib/strings";
import { LEVEL_ORDER, type ViewLevel } from "./levels";
import styles from "./viewer.module.css";

/**
 * 레벨 스위처. `PAGES.md` §5.2 ②
 *
 * 링크로 만든다 — 자바스크립트 없이도 단계를 바꿀 수 있어야 하고, 각 단계가 공유 가능한
 * 주소를 가져야 한다. 현재 단계는 `aria-current`로 알린다.
 */
function LevelTabs({ basePath, current }: { basePath: string; current: ViewLevel }) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    /*
     * 루트의 첫 페인트 전 스크립트는 새로고침을 맡는다. 이 효과는 App Router 안에서
     * `/case`나 `/doc`으로 이동해 루트 레이아웃이 다시 실행되지 않는 경우를 맡는다.
     */
    const url = new URL(window.location.href);
    if (url.searchParams.has("level")) {
      return;
    }

    const preferred = readPreferences().defaultLevel;
    if (preferred === "L0") {
      return;
    }

    url.searchParams.set("level", preferred);
    router.replace(`${basePath}${url.search}${url.hash}`, { scroll: false });
  }, [basePath, router]);

  const remember = (level: ViewLevel): void => {
    const preferences = readPreferences();
    writePreferences({ ...preferences, defaultLevel: level });
    setAnnouncement(viewer.levelChanged(viewer.levels[level]));
  };

  return (
    <>
      <nav aria-label={viewer.levelGroupLabel} className={styles.levels}>
        {LEVEL_ORDER.map((level) => (
          <Link
            aria-current={level === current ? "page" : undefined}
            className={`${styles.level} ${level === current ? styles.levelActive : ""}`}
            href={`${basePath}?level=${level}`}
            key={level}
            onClick={() => {
              remember(level);
            }}
          >
            {viewer.levels[level]}
          </Link>
        ))}
      </nav>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

export { LevelTabs };
