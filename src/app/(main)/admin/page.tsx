import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { listRecentUploadFailures } from "@/db/app/generation";
import { listUsersForAdmin } from "@/db/app/repository";
import { appDb, corpusDb } from "@/db/client";
import { listRecentGenerationFailures } from "@/db/corpus/repository";
import { formatDateTime } from "@/lib/format";
import { baseUrlAdvice, isBaseUrlProblem } from "@/lib/llm/base-url";
import { admin, adminTest, setup } from "@/lib/strings";
import { generationBudget } from "@/server/generate";
import { currentSession } from "@/server/owner";
import { listSettingsForEditing, shouldUseSecureCookies, siteTimeZone } from "@/server/settings";
import { saveSettings } from "@/server/setup-actions";
import { BaseUrlField } from "./base-url-field";
import styles from "./page.module.css";
import { RecentFailures } from "./recent-failures";
import { SecretField } from "./secret-field";
import { UserRoles } from "./user-roles";

/** 최근 실패를 몇 개까지 보여 주나. 원인을 알아보는 데 필요한 만큼이면 된다. */
const RECENT_FAILURES = 10;

/** 화면에서 고칠 수 있는 항목. 설치 완료 표시는 여기서 건드리지 않는다. */
const EDITABLE = [
  "time_zone",
  "law_api_oc",
  "llm_base_url",
  "llm_api_key",
  "llm_model",
  "generation_daily_limit",
  "generation_ip_limit",
  "generation_session_limit",
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

/**
 * 칸마다 붙는 안내. 없는 칸에는 붙이지 않는다.
 *
 * AI 주소는 **OpenAI 호환이어야 한다.** 칸이 하나뿐이라 제공자가 안내하는 주소를 그대로
 * 붙여 넣게 되는데, Gemini 네이티브 주소를 넣으면 `contents is not specified` 400이 오고
 * 그 문장만으로는 원인을 알 수 없다. 마법사에만 적어 두면 소용이 없다 — 설치가 끝난 뒤에
 * 주소를 고치는 곳은 여기다.
 */
const FIELD_HINTS: Partial<Record<EditableKey, string>> = {
  llm_base_url: setup.llmBaseUrlHint,
  llm_model: setup.llmModelHint,
  generation_ip_limit: setup.ipLimitHint,
  generation_session_limit: setup.sessionLimitHint,
};

/** 가릴 것이 없는 칸. 비밀 항목은 `SecretField`가 따로 그린다. */
function TextField({ name, value }: { name: EditableKey; value: string | undefined }) {
  const hint = FIELD_HINTS[name];

  return (
    <label className={styles.field}>
      <span className={styles.label}>{setup.settingNames[name]}</span>
      <input
        autoComplete="off"
        className={styles.input}
        defaultValue={value}
        name={name}
        type="text"
      />
      {hint === undefined ? null : <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

/**
 * 설정 폼. 화면 함수에서 떼어 낸 이유는 길이뿐이다 — 칸 종류가 넷이라(시간대·주소·비밀·글)
 * 한 함수에 두면 "이 화면에 무엇이 있는가"가 폼 안쪽에 묻힌다.
 */
function SettingsForm({
  db,
  settings,
  timeZone,
  zones,
}: {
  db: ReturnType<typeof appDb>;
  settings: readonly { key: string; value: string | undefined }[];
  timeZone: string;
  zones: readonly string[];
}) {
  return (
    <form action={saveSettings}>
      <Card className={styles.form}>
        {EDITABLE.map((key) => {
          const value = settings.find((entry) => entry.key === key)?.value;

          if (key === "time_zone") {
            return <TimeZoneField key={key} timeZone={timeZone} zones={zones} />;
          }
          if (key === "llm_base_url") {
            return (
              <BaseUrlField key={key} label={setup.settingNames[key]} name={key} value={value} />
            );
          }
          if (SECRET_KEYS.has(key)) {
            return (
              <SecretField key={key} label={setup.settingNames[key]} name={key} value={value} />
            );
          }
          return <TextField key={key} name={key} value={value} />;
        })}

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

        <Button size="m" type="submit">
          {admin.save}
        </Button>
      </Card>
    </form>
  );
}

/**
 * 관리자 설정. `PAGES.md` §17
 *
 * 마법사에서 넣은 값을 나중에 못 고치면 오타 하나가 서버를 다시 설치해야 하는 이유가 된다.
 *
 * **비밀 항목은 가린 채로 값을 채워 준다**(`SecretField`). 예전에는 값을 아예 돌려주지
 * 않아서 무엇이 들어 있는지 확인할 방법이 없었고, 그래서 빈 칸을 "그대로 두기"로 읽어야
 * 했다. 지금은 **칸에 보이는 것이 곧 저장될 값**이고 비우면 지워진다 — 규칙이 하나다.
 */
export default async function AdminPage(props: {
  searchParams: Promise<{ saved?: string; url_problem?: string }>;
}) {
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
  const timeZone = siteTimeZone(db);
  const settings = listSettingsForEditing(db);
  const zones = Intl.supportedValuesOf("timeZone");
  const budget = generationBudget();

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

      {/*
        저장 자리에서 되돌려보냈을 때. 주소줄에 실려 오는 것은 문장이 아니라 **문제의
        이름**이다 — 아무나 만든 주소로 이 화면에 아무 문장이나 띄울 수 없어야 한다.
      */}
      {isBaseUrlProblem(searchParams.url_problem) ? (
        <div aria-live="polite">
          <Alert title={setup.llmBaseUrlRejected} tone="danger">
            {baseUrlAdvice(searchParams.url_problem)}
          </Alert>
        </div>
      ) : null}

      <Card className={styles.usage} as="section">
        <h2 className={styles.sectionTitle}>{admin.usageTitle}</h2>
        <p className={styles.usageSummary}>
          {admin.usageSummary(budget.used, budget.limit)} {admin.usageRemaining(budget.remaining)}
        </p>
        <meter
          className={styles.meter}
          min={0}
          max={budget.limit}
          value={budget.used}
          aria-label={admin.usageTitle}
        />
        <StructuredList
          rows={[
            { label: "사용한 횟수", value: `${budget.used}번` },
            { label: "남은 횟수", value: `${budget.remaining}번` },
            { label: "하루 상한", value: `${budget.limit}번` },
          ]}
        />
      </Card>

      <RecentFailures
        cases={listRecentGenerationFailures(corpusDb(), RECENT_FAILURES)}
        formatTime={(at) => formatDateTime(at, timeZone)}
        uploads={listRecentUploadFailures(db, RECENT_FAILURES)}
      />

      <SettingsForm db={db} settings={settings} timeZone={timeZone} zones={zones} />

      <UserRoles users={listUsersForAdmin(db)} />

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
