import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { Input } from "@/components/shadcn/ui/input";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appDb } from "@/db/client";
import { baseUrlAdvice, isBaseUrlProblem } from "@/lib/llm/base-url";
import { admin, setup } from "@/lib/strings";
import { requireAdministrator } from "@/server/admin-access";
import {
  DEFAULT_LLM_MODEL_REVISION,
  isLocalUrl,
  listSettingsForEditing,
  shouldUseSecureCookies,
  siteTimeZone,
  ttsAllowsUploads,
} from "@/server/settings";
import { saveSettings } from "@/server/setup-actions";
import styles from "../admin.module.css";
import { BaseUrlField } from "../base-url-field";
import { SecretField } from "../secret-field";

/** 화면에서 고칠 수 있는 항목. 설치 완료 표시는 여기서 건드리지 않는다. */
const EDITABLE = [
  "time_zone",
  "law_api_oc",
  "llm_base_url",
  "llm_api_key",
  "llm_model",
  "llm_revision",
  "tts_base_url",
  "tts_api_key",
  "tts_model",
  "tts_voice",
  "tts_daily_limit",
  "generation_daily_limit",
  "generation_ip_limit",
  "generation_session_limit",
] as const;

type EditableKey = (typeof EDITABLE)[number];

const SECRET_KEYS = new Set<string>(["law_api_oc", "llm_api_key", "tts_api_key"]);

/**
 * 시간대 칸.
 *
 * 목록을 손으로 적지 않고 `Intl.supportedValuesOf`로 이 런타임이 아는 것만 보여 준다.
 * 적어 둔 목록은 Node를 올리는 순간 낡는다.
 */
function TimeZoneField({ timeZone, zones }: { timeZone: string; zones: readonly string[] }) {
  return (
    <label className={styles.field} htmlFor="time_zone">
      <span className={styles.label}>{setup.settingNames.time_zone}</span>
      <NativeSelect className={styles.input} defaultValue={timeZone} name="time_zone">
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </NativeSelect>
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
  llm_revision: setup.llmRevisionHint,
  tts_base_url: setup.ttsBaseUrlHint,
  tts_model: setup.ttsModelHint,
  tts_voice: setup.ttsVoiceHint,
  tts_daily_limit: setup.ttsLimitHint,
  generation_ip_limit: setup.ipLimitHint,
  generation_session_limit: setup.sessionLimitHint,
};

/** 가릴 것이 없는 칸. 비밀 항목은 `SecretField`가 따로 그린다. */
function TextField({ name, value }: { name: EditableKey; value: string | undefined }) {
  const hint = FIELD_HINTS[name];

  return (
    <label className={styles.field} htmlFor={name}>
      <span className={styles.label}>{setup.settingNames[name]}</span>
      <Input
        autoComplete="off"
        className={styles.input}
        defaultValue={value}
        inputMode={name === "llm_revision" ? "numeric" : undefined}
        min={name === "llm_revision" ? 1 : undefined}
        name={name}
        type={name === "llm_revision" ? "number" : "text"}
        id={name}
      />
      {hint === undefined ? null : <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

/**
 * 설정. `PAGES.md` §17
 *
 * 마법사에서 넣은 값을 나중에 못 고치면 오타 하나가 서버를 다시 설치해야 하는 이유가 된다.
 *
 * **비밀 항목은 가린 채로 값을 채워 준다**(`SecretField`). 예전에는 값을 아예 돌려주지
 * 않아서 무엇이 들어 있는지 확인할 방법이 없었고, 그래서 빈 칸을 "그대로 두기"로 읽어야
 * 했다. 지금은 **칸에 보이는 것이 곧 저장될 값**이고 비우면 지워진다 — 규칙이 하나다.
 */
export default async function AdminSettingsPage(props: {
  searchParams: Promise<{ saved?: string; url_problem?: string }>;
}) {
  await requireAdministrator();
  const searchParams = await props.searchParams;
  const db = appDb();
  const timeZone = siteTimeZone(db);
  const settings = listSettingsForEditing(db);
  const zones = Intl.supportedValuesOf("timeZone");
  const localTts = isLocalUrl(settings.find((entry) => entry.key === "tts_base_url")?.value);
  const uploadsOn = ttsAllowsUploads(db);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.settingsTitle}</h1>
        <p className={styles.intro}>{admin.settingsIntro}</p>
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

      <form action={saveSettings}>
        <Card className={styles.form}>
          {EDITABLE.map((key) => {
            const stored = settings.find((entry) => entry.key === key)?.value;
            const value = key === "llm_revision" ? (stored ?? DEFAULT_LLM_MODEL_REVISION) : stored;

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
          <label className={styles.checkboxRow} htmlFor="secure_cookies">
            <Checkbox
              className={styles.checkbox}
              defaultChecked={shouldUseSecureCookies(db)}
              name="secure_cookies"
              value="true"
            />
            <span className={styles.label}>{setup.httpsLabel}</span>
          </label>
          <p className={styles.hint}>{setup.httpsWarn}</p>

          {/*
            **주소가 내 컴퓨터를 가리킬 때만 이 칸이 있다.**

            외부 주소를 넣은 설치에는 켜는 길 자체가 없다 — 실수로 켤 수 있는 경로를 없애는
            것이 안내 문구보다 확실하다. 설정이 켜져 있어도 주소가 밖을 가리키면 서버가
            다시 거짓으로 본다(`ttsAllowsUploads`).
          */}
          {localTts ? (
            <>
              <label className={styles.checkboxRow} htmlFor="tts_uploads">
                <Checkbox
                  className={styles.checkbox}
                  defaultChecked={uploadsOn}
                  name="tts_uploads"
                  value="true"
                />
                <span className={styles.label}>{setup.settingNames.tts_uploads}</span>
              </label>
              <p className={styles.hint}>{setup.ttsUploadsHint}</p>
            </>
          ) : null}

          <Button size="m" type="submit">
            {admin.save}
          </Button>
        </Card>
      </form>
    </div>
  );
}

export const metadata = {
  title: `${admin.settingsTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
