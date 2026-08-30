import "server-only";
import { eq } from "drizzle-orm";
import { setting } from "@/db/app/schema";
import type { AppDb } from "@/db/client";
import { appDb } from "@/db/client";

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
  law_api_oc: { secret: true },
  llm_base_url: { secret: false },
  llm_api_key: { secret: true },
  llm_model: { secret: false },
  generation_daily_limit: { secret: false },
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
}

/** LLM 설정. 셋 중 하나라도 없으면 생성 기능은 꺼진 것으로 본다. */
function llmConfig(db: AppDb = appDb()): LlmConfig | undefined {
  const baseUrl = readSetting(db, "llm_base_url");
  const apiKey = readSetting(db, "llm_api_key");
  if (baseUrl === undefined || apiKey === undefined) {
    return;
  }
  return { baseUrl, apiKey, model: readSetting(db, "llm_model") ?? DEFAULT_LLM_MODEL };
}

const DEFAULT_LLM_MODEL = "claude-sonnet-5";
const DEFAULT_DAILY_GENERATION_LIMIT = 200;

/** 하루 총 생성 상한. 공개 서비스에서 `설명 만들기` 버튼은 곧 지출이다([F-42]). */
function generationDailyLimit(db: AppDb = appDb()): number {
  const raw = readSetting(db, "generation_daily_limit");
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_GENERATION_LIMIT;
}

export {
  DEFAULT_DAILY_GENERATION_LIMIT,
  DEFAULT_LLM_MODEL,
  generationDailyLimit,
  isSetupComplete,
  lawApiKey,
  listSettings,
  llmConfig,
  markSetupComplete,
  readSetting,
  SETTING_KEYS,
  writeSetting,
  writeSettings,
};
export type { LlmConfig, SettingKey, SettingView };
