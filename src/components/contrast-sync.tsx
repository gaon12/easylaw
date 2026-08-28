"use client";

import { useEffect } from "react";

const STORAGE_KEY = "easylaw:contrast";

/**
 * 시스템의 `prefers-contrast: more`와 사용자가 고른 값을 `data-contrast` 속성으로 옮긴다.
 *
 * CSS 미디어 쿼리로 처리하지 않는 이유는 `tokens.css`에 적어 두었다 — 오버라이드 블록을
 * 통째로 복사해야 하고, 복사본 두 개는 반드시 어긋난다.
 */
function ContrastSync() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = (): void => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 시스템 설정으로 넘어간다.
      }

      if (stored === "more" || stored === "normal") {
        root.dataset.contrast = stored;
        return;
      }
      root.dataset.contrast = window.matchMedia("(prefers-contrast: more)").matches
        ? "more"
        : "normal";
    };

    apply();

    const media = window.matchMedia("(prefers-contrast: more)");
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, []);

  return null;
}

export { ContrastSync };
