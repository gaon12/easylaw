import "server-only";
import { eq } from "drizzle-orm";
import { setting } from "@/db/app/schema";
import type { AppDb } from "@/db/client";
import { appDb } from "@/db/client";
import { isProduction } from "@/lib/env";

/**
 * 서비스 설정. `CONVENTIONS.md` §7
 *
 * **환경변수 대신 데이터베이스에 둔다.** 환경변수는 값을 바꿀 때마다 서버를 다시 띄워야
 * 하고, 파일을 직접 고칠 수 있는 사람만 바꿀 수 있다. 자가 호스팅하는 사람이 화면에서
 * 법제처 키를 넣고 고칠 수 있어야 한다.
 *
 * 환경변수에 남는 것은 **이 표를 읽기 전에 알아야 하는 값**뿐이다 — 데이터베이스 경로와
 * 실행 환경. 그건 `src/lib/env.ts`에 있다.
 *
 * 값은 매번 읽는다. 캐시하지 않는 이유는, 로컬 SQLite의 기본 키 조회 한 번이
 * 캐시 무효화를 잘못 다뤄 옛 설정으로 도는 위험보다 훨씬 싸기 때문이다.
 */

/**
 * 설정 항목 정의.
 *
 * `secret: true`인 항목은 **화면에 값을 되돌려 보여 주지 않는다.** 관리자 화면은
 * "설정됨 / 설정 안 됨"만 보여 준다 — 키를 확인할 방법이 필요한 경우는 거의 없고,
 * 화면에 띄우는 순간 어깨너머로도, 스크린샷으로도 샌다.
 */
const SETTINGS = {
  /** IANA 시간대 이름. 날짜를 보여 주고 보관 기한을 세는 기준이 된다. */
  time_zone: { secret: false },
  /** HTTPS로 서비스하는가. 세션 쿠키의 `secure` 플래그가 이 값을 본다. */
  secure_cookies: { secret: false },
  law_api_oc: { secret: true },
  llm_base_url: { secret: false },
  llm_api_key: { secret: true },
  llm_model: { secret: false },
  /** 같은 모델 alias의 실제 대상이 바뀌었을 때 운영자가 올리는 명시적 판. */
  llm_revision: { secret: false },
  /**
   * 음성 합성. `llm_*`과 같은 모양이다 — 주소·키·모델 세 칸이면 어느 제공자든 꽂힌다.
   *
   * **목소리는 운영자가 하나 고른다.** 이용자에게 고르게 하면 저장이 목소리 수만큼
   * 늘어나고(문장마다 파일이 하나씩이다), 화면에는 설정이 하나 더 는다. 이용자가
   * 바꾸고 싶은 것은 대개 목소리가 아니라 **속도**이고, 그것은 재생할 때 바꾼다.
   */
  tts_base_url: { secret: false },
  tts_api_key: { secret: true },
  tts_model: { secret: false },
  tts_voice: { secret: false },
  /**
   * 음성은 **따로 센다.** 설명 생성과 값이 다르다 — 설명은 한 번 만들면 끝이지만 음성은
   * 같은 판결문의 네 단계에 각각 붙고, 글자당 값이 붙는 제공자도 있다.
   */
  tts_daily_limit: { secret: false },
  /**
   * 올린 문서도 음성으로 만들까. **기본은 금지.**
   *
   * 올린 판결문을 밖의 TTS로 보내면 그 사람이 어떤 사건을 들고 왔는지가 남의 서버에
   * 남는다. 그래서 이 값은 **주소가 내 컴퓨터를 가리킬 때만** 화면에 나타난다
   * (`admin/page.tsx`) — 외부 주소를 넣은 설치에서는 켤 길 자체가 없다.
   */
  tts_uploads: { secret: false },
  generation_daily_limit: { secret: false },
  generation_ip_limit: { secret: false },
  generation_session_limit: { secret: false },
  /** 설치 마법사를 마친 시각(ISO 문자열). 이 값이 있으면 마법사는 더 열리지 않는다. */
  setup_completed_at: { secret: false },
} as const;

type SettingKey = keyof typeof SETTINGS;

const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

function isSecret(key: SettingKey): boolean {
  return SETTINGS[key].secret;
}

/** 값 하나. 없거나 빈 문자열이면 undefined — "빈 값으로 설정됨"과 "설정 안 됨"을 구분하지 않는다. */
function readSetting(db: AppDb, key: SettingKey): string | undefined {
  const row = db.select().from(setting).where(eq(setting.key, key)).get();
  const value = row?.value.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

/**
 * 쓰기에 필요한 최소한의 면.
 *
 * 트랜잭션 객체는 `AppDb`와 타입이 다르지만 쓰기 메서드는 같다. 여기서 필요한 것만
 * 요구하면 연결과 트랜잭션 양쪽에 같은 함수를 쓸 수 있다 — 캐스팅으로 억지로 맞추면
 * 나중에 실제로 다른 타입이 들어와도 컴파일러가 잡지 못한다.
 */
type SettingWriter = Pick<AppDb, "insert" | "delete">;

/**
 * 값을 쓴다. 빈 문자열을 넘기면 **지운다** — 화면에서 칸을 비우는 것이 곧 해제여야 한다.
 * 빈 값을 저장해 두면 "설정됨"으로 보이면서 동작하지 않는 상태가 된다.
 */
function writeSetting(db: SettingWriter, key: SettingKey, value: string, updatedBy?: string): void {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    db.delete(setting).where(eq(setting.key, key)).run();
    return;
  }

  const row = { value: trimmed, updatedAt: new Date(), updatedBy: updatedBy ?? null };
  db.insert(setting)
    .values({ key, ...row })
    .onConflictDoUpdate({ target: setting.key, set: row })
    .run();
}

/** 여러 항목을 한 번에. 마법사와 관리자 화면이 폼 하나를 그대로 넘긴다. */
function writeSettings(
  db: AppDb,
  values: Partial<Record<SettingKey, string>>,
  updatedBy?: string,
): void {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) {
        writeSetting(tx, key as SettingKey, value, updatedBy);
      }
    }
  });
}

/** 화면에 보여 줄 형태. 비밀 항목은 값 대신 설정 여부만 담는다. */
interface SettingView {
  readonly key: SettingKey;
  readonly secret: boolean;
  readonly configured: boolean;
  /** 비밀이 아닌 항목만 값이 들어온다. */
  readonly value: string | undefined;
}

function listSettings(db: AppDb): SettingView[] {
  return SETTING_KEYS.map((key) => {
    const value = readSetting(db, key);
    return {
      key,
      secret: isSecret(key),
      configured: value !== undefined,
      value: isSecret(key) ? undefined : value,
    };
  });
}

/**
 * 비밀 항목의 값까지 담아 낸다. **관리자 설정 화면 전용이다.**
 *
 * `listSettings`가 비밀을 가리는 것은 값이 실수로 흘러나가지 않게 하는 안전한 기본값이다.
 * 그 기본값을 바꾸는 대신 통로를 하나 더 두는 이유는, 이 값을 화면에 싣는 결정이
 * **부르는 쪽에서 눈에 보여야** 하기 때문이다. `listSettings`에 옵션을 다는 방식이면
 * 나중에 다른 화면이 무심코 `true`를 넘겨도 아무도 알아채지 못한다.
 *
 * 부르는 쪽은 반드시 관리자인지 먼저 확인한다.
 */
function listSettingsForEditing(db: AppDb): SettingView[] {
  return SETTING_KEYS.map((key) => ({
    key,
    secret: isSecret(key),
    configured: readSetting(db, key) !== undefined,
    value: readSetting(db, key),
  }));
}

/** 설치 마법사를 마쳤는가. 마쳤으면 마법사는 더 열리지 않는다. */
function isSetupComplete(db: AppDb = appDb()): boolean {
  return readSetting(db, "setup_completed_at") !== undefined;
}

function markSetupComplete(db: SettingWriter, updatedBy: string): void {
  writeSetting(db, "setup_completed_at", new Date().toISOString(), updatedBy);
}

/** 법제처 조회 인증키(OC). 없으면 공개 판례 조회가 꺼진 채로 동작한다. */
function lawApiKey(db: AppDb = appDb()): string | undefined {
  return readSetting(db, "law_api_oc");
}

interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly modelRevision?: string;
}

/** LLM 설정. 셋 중 하나라도 없으면 생성 기능은 꺼진 것으로 본다. */
function llmConfig(db: AppDb = appDb()): LlmConfig | undefined {
  const baseUrl = readSetting(db, "llm_base_url");
  const apiKey = readSetting(db, "llm_api_key");
  if (baseUrl === undefined || apiKey === undefined) {
    return;
  }
  return {
    baseUrl,
    apiKey,
    model: readSetting(db, "llm_model") ?? DEFAULT_LLM_MODEL,
    modelRevision: llmModelRevision(db),
  };
}

const DEFAULT_LLM_MODEL = "claude-sonnet-5";
const DEFAULT_LLM_MODEL_REVISION = "1";

/**
 * 제공자가 같은 모델 이름 뒤의 실제 대상을 바꿔도 알아볼 수 있게 하는 운영 판.
 * 숫자가 아닌 저장값은 예전 결과와 뜻없이 다른 키를 만들지 않고 기본 1판으로 돌린다.
 */
function llmModelRevision(db: AppDb = appDb()): string {
  return normalizeLlmModelRevision(readSetting(db, "llm_revision"));
}

function normalizeLlmModelRevision(raw: string | undefined): string {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : DEFAULT_LLM_MODEL_REVISION;
}

interface TtsConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly voice: string;
}

/**
 * 음성 연결. 주소가 없으면 `undefined`이고, 그때는 브라우저 음성으로 읽는다.
 *
 * **키는 없어도 된다.** 자기 컴퓨터에 띄운 서버는 키를 요구하지 않는 경우가 흔하다 —
 * 키를 필수로 두면 그런 설치가 아무 이유 없이 막힌다(`llm_*`과 다른 점이다).
 */
function ttsConfig(db: AppDb = appDb()): TtsConfig | undefined {
  const baseUrl = readSetting(db, "tts_base_url");
  if (baseUrl === undefined) {
    return;
  }
  return {
    baseUrl,
    apiKey: readSetting(db, "tts_api_key") ?? "",
    model: readSetting(db, "tts_model") ?? DEFAULT_TTS_MODEL,
    voice: readSetting(db, "tts_voice") ?? DEFAULT_TTS_VOICE,
  };
}

const DEFAULT_TTS_MODEL = "melo-ko";
const DEFAULT_TTS_VOICE = "KR";

/** 하루에 음성을 몇 벌까지 만들까. 변환본 하나가 한 벌이다. */
const DEFAULT_TTS_DAILY_LIMIT = 100;

function ttsDailyLimit(db: AppDb = appDb()): number {
  const raw = Number(readSetting(db, "tts_daily_limit") ?? DEFAULT_TTS_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TTS_DAILY_LIMIT;
}

/**
 * 올린 문서도 음성으로 만들까.
 *
 * **주소가 내 컴퓨터를 가리킬 때만 참이 될 수 있다.** 설정값이 켜져 있어도 주소가 밖을
 * 가리키면 거짓이다 — 주소를 바꾼 뒤 설정을 끄는 것을 잊는 일이 실제로 일어난다.
 */
function ttsAllowsUploads(db: AppDb = appDb()): boolean {
  if (readSetting(db, "tts_uploads") !== "true") {
    return false;
  }
  return isLocalUrl(readSetting(db, "tts_base_url"));
}

/** 내 컴퓨터를 가리키는 주소인가. 사내망 주소는 밖으로 본다 — 우리가 알 수 없다. */
function isLocalUrl(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }
  try {
    const { hostname } = new URL(raw);
    return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
  } catch {
    return false;
  }
}

/**
 * 기본 시간대.
 *
 * 서버가 어디에서 돌든 사용자가 보는 "오늘"은 하나여야 한다. 이 서비스가 다루는 것이
 * 한국 판결문이라 한국 시간을 기본값으로 두되, 설치할 때 바꿀 수 있게 한다.
 */
const DEFAULT_TIME_ZONE = "Asia/Seoul";

/** 날짜 표시와 보관 기한 계산의 기준 시간대. */
function siteTimeZone(db: AppDb = appDb()): string {
  const stored = readSetting(db, "time_zone");
  if (stored === undefined) {
    return DEFAULT_TIME_ZONE;
  }
  /*
   * 저장된 값이 이 런타임에서 쓸 수 없는 이름일 수 있다 — 설정 표는 사람이 고칠 수 있고,
   * Node를 올리면 목록이 바뀐다. 날짜 하나 때문에 화면 전체가 죽으면 안 된다.
   */
  try {
    new Intl.DateTimeFormat("ko-KR", { timeZone: stored });
    return stored;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * 세션 쿠키에 `secure`를 붙일까.
 *
 * 설정하지 않았으면 실행 환경을 따른다 — 개발 중에는 http로 띄우므로 붙이면 로그인이
 * 되지 않고, 운영에서는 붙는 편이 맞다.
 *
 * 이름을 `use…`로 짓지 않는다. 그렇게 지으면 도구가 React 훅으로 오인하고, 사람도
 * 컴포넌트 안에서만 부를 수 있는 것으로 읽는다.
 */
function shouldUseSecureCookies(db: AppDb = appDb()): boolean {
  const stored = readSetting(db, "secure_cookies");
  if (stored === undefined) {
    return isProduction();
  }
  return stored === "true";
}
const DEFAULT_DAILY_GENERATION_LIMIT = 200;
const DEFAULT_GENERATION_IP_LIMIT = 20;
const DEFAULT_GENERATION_SESSION_LIMIT = 10;

/** 하루 총 생성 상한. 공개 서비스에서 `설명 만들기` 버튼은 곧 지출이다([F-42]). */
function generationDailyLimit(db: AppDb = appDb()): number {
  const raw = readSetting(db, "generation_daily_limit");
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_GENERATION_LIMIT;
}

/** 같은 IP가 하루 동안 실제 모델 호출을 시작할 수 있는 횟수. */
function generationIpLimit(db: AppDb = appDb()): number {
  const raw = readSetting(db, "generation_ip_limit");
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_GENERATION_IP_LIMIT;
}

/** 같은 로그인 세션이 하루 동안 실제 모델 호출을 시작할 수 있는 횟수. */
function generationSessionLimit(db: AppDb = appDb()): number {
  const raw = readSetting(db, "generation_session_limit");
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_GENERATION_SESSION_LIMIT;
}

export {
  isLocalUrl,
  ttsAllowsUploads,
  ttsConfig,
  ttsDailyLimit,
  DEFAULT_DAILY_GENERATION_LIMIT,
  DEFAULT_GENERATION_IP_LIMIT,
  DEFAULT_GENERATION_SESSION_LIMIT,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_MODEL_REVISION,
  DEFAULT_TIME_ZONE,
  generationDailyLimit,
  generationIpLimit,
  generationSessionLimit,
  isSetupComplete,
  lawApiKey,
  listSettings,
  listSettingsForEditing,
  llmConfig,
  llmModelRevision,
  markSetupComplete,
  normalizeLlmModelRevision,
  readSetting,
  SETTING_KEYS,
  siteTimeZone,
  shouldUseSecureCookies,
  writeSetting,
  writeSettings,
};
export type { LlmConfig, SettingKey, SettingView, TtsConfig };
