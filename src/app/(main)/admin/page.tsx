import { Button } from "@/components/ui/button";
import { Infobox } from "@/components/ui/infobox";
import { appDb } from "@/db/client";
import { admin, setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { listSettings } from "@/server/settings";
import { saveSettings } from "@/server/setup-actions";
import styles from "./page.module.css";

/** 화면에서 고칠 수 있는 항목. 설치 완료 표시는 여기서 건드리지 않는다. */
const EDITABLE = [
  "law_api_oc",
  "llm_base_url",
  "llm_api_key",
  "llm_model",
  "generation_daily_limit",
] as const;

const SECRET_KEYS = new Set(["law_api_oc", "llm_api_key"]);

/**
 * 관리자 설정. `PAGES.md` §17
 *
 * 마법사에서 넣은 값을 나중에 못 고치면 오타 하나가 서버를 다시 설치해야 하는 이유가 된다.
 *
 * **비밀 항목은 값을 되돌려 보여 주지 않는다.** 대신 설정 여부만 알린다. 그래서 빈 칸은
 * "지우기"가 아니라 **"그대로 두기"** 로 읽는다 — 그러지 않으면 모델 이름 하나 고치려고
 * 저장을 눌렀다가 API 키가 지워진다. 지우는 방법은 화면에서 따로 안내한다.
 */
export default async function AdminPage(props: { searchParams: Promise<{ saved?: string }> }) {
  const [session, searchParams] = await Promise.all([currentSession(), props.searchParams]);

  if (session?.role !== "admin") {
    return (
      <div className={styles.page}>
        <Infobox title={admin.deniedTitle} tone="warning">
          {admin.deniedBody}
        </Infobox>
      </div>
    );
  }

  const settings = listSettings(appDb());

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.title}</h1>
        <p className={styles.intro}>{admin.intro}</p>
      </header>

      {searchParams.saved === undefined ? null : (
        <p aria-live="polite" className={styles.saved}>
          {admin.saved}
        </p>
      )}

      <form action={saveSettings} className={styles.form}>
        {EDITABLE.map((key) => {
          const view = settings.find((entry) => entry.key === key);
          const secret = SECRET_KEYS.has(key);
          return (
            <label className={styles.field} key={key}>
              <span className={styles.label}>{setup.settingNames[key]}</span>
              <input
                autoComplete="off"
                className={styles.input}
                defaultValue={secret ? undefined : view?.value}
                name={key}
                type={secret ? "password" : "text"}
              />
              {secret ? (
                <span className={styles.hint}>
                  {view?.configured ? admin.secretSet : admin.secretUnset}
                </span>
              ) : null}
            </label>
          );
        })}

        <p className={styles.hint}>{admin.secretClear}</p>

        <Button size="m" type="submit">
          {admin.save}
        </Button>
      </form>
    </div>
  );
}

export const metadata = { title: admin.title, robots: { index: false, follow: false } };
