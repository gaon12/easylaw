"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyPreferences,
  DEFAULT_LEVELS,
  DEFAULTS,
  DISPLAY_MODES,
  type Preferences,
  readPreferences,
  TEXT_SIZES,
  writePreferences,
} from "@/lib/preferences";
import { settings, viewer } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 화면 설정 컨트롤. `PAGES.md` §17
 *
 * **고르는 즉시 적용하고 저장한다.** 저장 버튼을 두지 않는 이유가 있다 — 이 화면의 1차
 * 사용자는 글자가 작아서, 대비가 낮아서 못 읽는 사람이다. 그들에게 "고르고 → 저장을 눌러야
 * 적용됨"은 한 단계가 아니라 벽이다. 바뀐 화면을 보고 다음을 고르는 편이 맞다.
 *
 * 서버는 이 값을 모른다. 브라우저에만 저장한다.
 */
function SettingsForm() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // 서버는 저장된 값을 알 수 없으므로 첫 렌더는 기본값으로 그린다.
    // 화면에 붙은 뒤 실제 값으로 맞춘다. 표시가 실제 화면과 어긋나면 안 된다.
    setPreferences(readPreferences());
  }, []);

  const update = (next: Preferences): void => {
    setPreferences(next);
    applyPreferences(next);
    writePreferences(next);
    setRestored(false);
  };

  const reset = (): void => {
    setPreferences(DEFAULTS);
    applyPreferences(DEFAULTS);
    writePreferences(DEFAULTS);
    setRestored(true);
  };

  return (
    <div className={styles.controls}>
      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{settings.defaultLevelLabel}</legend>
        <p className={styles.groupHint}>{settings.defaultLevelHint}</p>
        <div className={styles.options}>
          {DEFAULT_LEVELS.map((level) => (
            <label className={`${styles.option} ${styles.optionWide}`} key={level}>
              <input
                checked={preferences.defaultLevel === level}
                className="sr-only"
                name="defaultLevel"
                onChange={() => {
                  update({ ...preferences, defaultLevel: level });
                }}
                type="radio"
              />
              <span className={styles.optionText}>{viewer.levels[level]}</span>
              <span className={styles.optionHint}>{viewer.levelNotes[level]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{settings.textSizeLabel}</legend>
        <div className={styles.options}>
          {TEXT_SIZES.map((size) => (
            <label className={styles.option} key={size}>
              <input
                checked={preferences.textSize === size}
                className="sr-only"
                name="textSize"
                onChange={() => {
                  update({ ...preferences, textSize: size });
                }}
                type="radio"
              />
              {/* 이름만으로는 차이가 안 보인다. 그 크기로 쓴 글자를 함께 보여 준다. */}
              <span className={`${styles.sample} ${styles[`sample_${size}`]}`}>
                {settings.sampleGlyph}
              </span>
              <span className={styles.optionText}>{settings.textSizes[size]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{settings.displayLabel}</legend>
        <div className={styles.options}>
          {DISPLAY_MODES.map((mode) => (
            <label className={`${styles.option} ${styles.optionWide}`} key={mode}>
              <input
                checked={preferences.display === mode}
                className="sr-only"
                name="display"
                onChange={() => {
                  update({ ...preferences, display: mode });
                }}
                type="radio"
              />
              <span className={styles.optionText}>{settings.displays[mode]}</span>
              <span className={styles.optionHint}>{settings.displayHints[mode]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.resetRow}>
        <Button onClick={reset} size="m" type="button" variant="tertiary">
          {settings.reset}
        </Button>
        {/* 되돌린 것도 변화다. 화면만 바뀌면 무슨 일이 일어났는지 놓칠 수 있다. */}
        <p aria-live="polite" className={styles.resetNote}>
          {restored ? settings.resetDone : ""}
        </p>
      </div>
    </div>
  );
}

export { SettingsForm };
