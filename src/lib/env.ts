import "server-only";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

/**
 * 서버 설정. **`process.env`를 직접 읽는 곳은 이 파일뿐이다.**
 *
 * `.dev/CONVENTIONS.md` §7 — 비밀값은 서버 전용이다. `NEXT_PUBLIC_*`에 키를 두지 않는다.
 * `import "server-only"`가 클라이언트 번들에 이 모듈이 딸려 들어가면 빌드를 실패시킨다.
 *
 * 값 검증을 한 곳에 모으면 "환경변수를 안 넣었더니 런타임 한참 뒤에 이상하게 죽는" 문제가 사라진다.
 */

const DEFAULT_DAILY_GENERATION_LIMIT = 200;

const schema = z.object({
  /** 공개 코퍼스 DB 경로. */
  CORPUS_DB_PATH: z.string().min(1).default("data/corpus.sqlite"),

  /**
   * 사용자 문서 DB 경로. 코퍼스와 **다른 파일**이어야 한다(`PRODUCT.md` §6.1).
   * 같은 파일을 가리키면 분리의 의미가 사라지므로 아래에서 막는다.
   */
  APP_DB_PATH: z.string().min(1).default("data/app.sqlite"),

  /**
   * 법제처 OPEN API 인증키(OC). 발급받은 본인만 쓸 수 있으므로 서버에만 둔다.
   * 없으면 판례 조회 기능이 꺼진 채로 동작한다 — 개발과 테스트를 막지 않기 위해서다.
   */
  LAW_API_OC: z.string().min(1).optional(),

  /** LLM 공급자 설정. 없으면 생성 기능이 꺼진 채로 동작한다. */
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("claude-sonnet-5"),

  /** 하루 총 생성 상한. 공개 서비스에서 `설명 만들기` 버튼은 곧 지출이다([F-42]). */
  GENERATION_DAILY_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DAILY_GENERATION_LIMIT),
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function env(): Env {
  if (cached) {
    return cached;
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n  ");
    throw new Error(`환경변수 설정이 잘못되었습니다.\n  ${detail}`);
  }

  if (resolve(parsed.data.CORPUS_DB_PATH) === resolve(parsed.data.APP_DB_PATH)) {
    // 여기서 막지 않으면 사용자 업로드가 공개 코퍼스와 같은 파일에 쌓인다.
    // 설정 실수 한 번으로 §6.1의 격리가 통째로 무너지는 자리라 기동 시점에 죽인다.
    throw new Error("CORPUS_DB_PATH와 APP_DB_PATH는 서로 다른 파일이어야 합니다.");
  }

  cached = parsed.data;
  return cached;
}

/** 법제처 API를 쓸 수 있는 상태인가. 꺼져 있으면 조회 대신 안내를 보여 준다. */
function hasLawApi(): boolean {
  return env().LAW_API_OC !== undefined;
}

/** LLM 생성을 쓸 수 있는 상태인가. 꺼져 있으면 `설명 만들기`를 비활성화한다. */
function hasLlm(): boolean {
  const config = env();
  return config.LLM_API_KEY !== undefined && config.LLM_BASE_URL !== undefined;
}

export { env, hasLawApi, hasLlm };
export type { Env };
