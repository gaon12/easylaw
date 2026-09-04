import "server-only";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

/**
 * 부팅 설정. **`process.env`를 직접 읽는 곳은 이 파일뿐이다.**
 *
 * 여기에는 **데이터베이스를 열기 전에 알아야 하는 값만** 둔다. 나머지 설정(법제처 키,
 * LLM 연결, 생성 상한)은 데이터베이스에 있고 `src/server/settings.ts`가 다룬다 —
 * 자가 호스팅하는 사람이 파일을 고치고 서버를 다시 띄우는 대신 화면에서 바꿀 수 있어야 한다.
 *
 * 포트는 여기서 읽지 않는다. Next가 `PORT`를 직접 본다.
 *
 * `.dev/CONVENTIONS.md` §7 — 비밀값은 서버 전용이다. `NEXT_PUBLIC_*`에 키를 두지 않는다.
 * `import "server-only"`가 클라이언트 번들에 이 모듈이 딸려 들어가면 빌드를 실패시킨다.
 */

const schema = z.object({
  /** 실행 환경. 쿠키의 `secure` 플래그처럼 환경에 따라 달라지는 것이 여기에 걸린다. */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** 공개 코퍼스 DB 경로. */
  CORPUS_DB_PATH: z.string().min(1).default("data/corpus.sqlite"),

  /**
   * 사용자 문서 DB 경로. 코퍼스와 **다른 파일**이어야 한다(`PRODUCT.md` §6.1).
   * 같은 파일을 가리키면 분리의 의미가 사라지므로 아래에서 막는다.
   */
  APP_DB_PATH: z.string().min(1).default("data/app.sqlite"),
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

/** 운영 환경인가. HTTPS 전용 쿠키처럼 환경에 따라 갈리는 판단에 쓴다. */
function isProduction(): boolean {
  return env().NODE_ENV === "production";
}

export { env, isProduction };
export type { Env };
