import { help } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 이용 안내. `PAGES.md` §20
 *
 * **이 페이지가 스스로 두 가지 말로 쓰여 있다.** 도움말이 어려우면 도움말이 아니다.
 * 이 서비스가 판결문에 대고 하는 일을 자기 안내문에도 그대로 한다.
 *
 * 전환은 라디오와 `:has()`로만 한다 — 자바스크립트 없이 동작해야 하고, 안내를 읽으러 온
 * 사람에게 스크립트를 요구하는 것은 앞뒤가 맞지 않는다. `:has()`를 모르는 브라우저에서는
 * 자세한 설명만 남는다.
 */
export default function HelpPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{help.title}</h1>
        <p className={styles.intro}>{help.intro}</p>
      </header>

      <div className={styles.doc}>
        <fieldset className={styles.tabs}>
          <legend className="sr-only">{help.toggleLabel}</legend>
          <label className={`${styles.tab} ${styles.tabFull}`}>
            <input className="sr-only" defaultChecked={true} name="el-help-mode" type="radio" />
            <span className={styles.tabText}>{help.modes.full}</span>
          </label>
          <label className={`${styles.tab} ${styles.tabPlain}`}>
            <input className="sr-only" name="el-help-mode" type="radio" />
            <span className={styles.tabText}>{help.modes.plain}</span>
          </label>
        </fieldset>

        <div className={`${styles.version} ${styles.versionFull}`}>
          {help.full.map((section) => (
            <section className={styles.section} key={section.heading}>
              <h2 className={styles.heading}>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p className={styles.paragraph} key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* 쉬운 말은 L4 규격으로 그린다 — 21px / 1.7. 규칙을 말로만 설명하지 않는다. */}
        <div className={`${styles.version} ${styles.versionPlain}`}>
          {help.plain.map((section) => (
            <section className={styles.section} key={section.heading}>
              <h2 className={styles.heading}>{section.heading}</h2>
              {section.body.map((line) => (
                <p className={styles.plainLine} key={line}>
                  {line}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: help.title };
