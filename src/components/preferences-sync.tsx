"use client";

import { useEffect } from "react";
import { applyPreferences, readPreferences } from "@/lib/preferences";

/**
 * 시스템 설정이 바뀌면 따라간다.
 *
 * 첫 적용은 `<head>`의 인라인 스크립트가 이미 했다(`PREFERENCES_SCRIPT`).
 * 여기서 하는 일은 **화면이 떠 있는 동안** 운영체제의 고대비 설정이 바뀌는 경우를
 * 받아 주는 것뿐이다. 사용자가 "시스템 설정"을 골랐다면 그 변화가 즉시 보여야 한다.
 */
function PreferencesSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-contrast: more)");
    const apply = (): void => {
      applyPreferences(readPreferences());
    };

    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, []);

  return null;
}

export { PreferencesSync };
