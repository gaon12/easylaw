import Link from "next/link";
import { account, data, settings } from "@/lib/strings";
import styles from "./page.module.css";
import { SettingsForm } from "./settings-form";

/**
 * 화면 설정. `PAGES.md` §17 · `DESIGN.md` §10
 *
 * 미리보기를 컨트롤 **아래**가 아니라 옆에 둔다. 글자 크기를 고르는 사람은 스크롤하지
 * 않고도 결과를 봐야 한다 — 스크롤해서 확인하고 다시 올라와 고르는 왕복이 이 화면에서는
 * 특히 비싸다.
 *
 * 미리보기 문장은 L4(쉬운말) 규격이다. 가장 크게 보여 주는 단계라 차이가 가장 잘 보이고,
 * 이 설정이 실제로 누구를 위한 것인지도 드러난다.
 */
export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{settings.title}</h1>
        <p className={styles.intro}>{settings.intro}</p>
        <p className={styles.intro}>{settings.liveHint}</p>
      </header>

      <div className={styles.layout}>
        <SettingsForm />

        <aside className={styles.preview}>
          <h2 className={styles.previewLabel}>{settings.previewLabel}</h2>
          <div className={styles.previewBody}>
            {settings.previewSentences.map((sentence) => (
              <p className={styles.previewLine} key={sentence}>
                {sentence}
              </p>
            ))}
          </div>
          <p className={styles.previewNote}>{settings.previewNote}</p>
        </aside>
      </div>

      {/*
        계정 설정은 서버에 저장되므로 이 화면과 성격이 다르다. 섞지 않고 길만 낸다 —
        이 화면은 "이 브라우저에만 저장돼요"라고 말하고 있다.
      */}
      <nav className={styles.links}>
        <Link className={styles.link} href="/settings/account">
          {account.title}
        </Link>
        <Link className={styles.link} href="/settings/data">
          {data.title}
        </Link>
      </nav>

      <section className={styles.later}>
        <h2 className={styles.laterTitle}>{settings.laterTitle}</h2>
        <ul className={styles.laterList}>
          {settings.laterPoints.map((point) => (
            <li className={styles.laterItem} key={point}>
              {point}
            </li>
          ))}
        </ul>
        <p className={styles.laterNote}>{settings.laterNote}</p>
      </section>
    </div>
  );
}

export const metadata = { title: settings.title };
