import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appDb } from "@/db/client";
import { admin, adminTest, setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { listSettings, shouldUseSecureCookies, siteTimeZone } from "@/server/settings";
import { saveSettings } from "@/server/setup-actions";
import styles from "./page.module.css";

/** 화면에서 고칠 수 있는 항목. 설치 완료 표시는 여기서 건드리지 않는다. */
const EDITABLE = [
  "time_zone",
  "law_api_oc",
  "llm_base_url",
  "llm_api_key",
  "llm_model",
  "generation_daily_limit",
] as const;

type EditableKey = (typeof EDITABLE)[number];

const SECRET_KEYS = new Set<string>(["law_api_oc", "llm_api_key"]);

/**
 * 시간대 칸.
 *
 * 목록을 손으로 적지 않고 `Intl.supportedValuesOf`로 이 런타임이 아는 것만 보여 준다.
 * 적어 둔 목록은 Node를 올리는 순간 낡는다.
 */
function TimeZoneField({ timeZone, zones }: { timeZone: string; zones: readonly string[] }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{setup.settingNames.time_zone}</span>
      <select className={styles.input} defaultValue={timeZone} name="time_zone">
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 글로 적는 칸. 비밀 항목이면 값을 채우지 않고 설정 여부만 알린다. */
function TextField({
  name,
  secret,
  configured,
  value,
}: {
  name: EditableKey;
  secret: boolean;
  configured: boolean;
  value: string | undefined;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{setup.settingNames[name]}</span>
      <input
        autoComplete="off"
        className={styles.input}
        defaultValue={secret ? undefined : value}
        name={name}
        type={secret ? "password" : "text"}
      />
      {secret ? (
        <span className={styles.hint}>{configured ? admin.secretSet : admin.secretUnset}</span>
      ) : null}
    </label>
  );
}

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
        <Alert title={admin.deniedTitle} tone="warning">
          {admin.deniedBody}
        </Alert>
      </div>
    );
  }

  const db = appDb();
  const settings = listSettings(db);
  const zones = Intl.supportedValuesOf("timeZone");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.title}</h1>
        <p className={styles.intro}>{admin.intro}</p>
      </header>

      {searchParams.saved === undefined ? null : (
        <div aria-live="polite">
          <Alert title={admin.saved} tone="success" />
        </div>
      )}

      <form action={saveSettings}>
        <Card className={styles.form}>
          {EDITABLE.map((key) =>
            key === "time_zone" ? (
              <TimeZoneField key={key} timeZone={siteTimeZone(db)} zones={zones} />
            ) : (
              <TextField
                configured={settings.find((entry) => entry.key === key)?.configured ?? false}
                name={key}
                key={key}
                secret={SECRET_KEYS.has(key)}
                value={settings.find((entry) => entry.key === key)?.value}
              />
            ),
          )}

          {/*
          https 설정은 값을 적는 칸이 아니라 켜고 끄는 것이라 따로 그린다.
          잘못 켜면 로그인이 조용히 막히므로 경고를 함께 둔다.
        */}
          <label className={styles.checkboxRow}>
            <input
              className={styles.checkbox}
              defaultChecked={shouldUseSecureCookies(db)}
              name="secure_cookies"
              type="checkbox"
              value="true"
            />
            <span className={styles.label}>{setup.httpsLabel}</span>
          </label>
          <p className={styles.hint}>{setup.httpsWarn}</p>

          <p className={styles.hint}>{admin.secretClear}</p>

          <Button size="m" type="submit">
            {admin.save}
          </Button>
        </Card>
      </form>

      {/*
        저장한 값이 실제로 통하는지 확인하는 통로. 폼 안에 두지 않는 이유는, 시험이
        **저장된 값**으로 돌기 때문이다 — 비밀 항목은 폼에 값이 없어서(§10.5) 폼 값으로는
        시험할 수 없다. 먼저 저장하고, 그 다음에 시험한다.
      */}
      <nav className={styles.afterForm}>
        <Link className={styles.link} href="/admin/test">
          {adminTest.title}
        </Link>
      </nav>
    </div>
  );
}

export const metadata = { title: admin.title, robots: { index: false, follow: false } };
