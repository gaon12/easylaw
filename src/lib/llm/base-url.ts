/**
 * AI API 주소를 **저장하기 전에** 본다.
 *
 * 설정 칸은 하나(`llm_base_url`)이고 화면은 "AI API 주소"라고만 적혀 있다. 그래서 사람들은
 * 제공자 문서에 있는 주소를 그대로 붙여 넣는데, 문서마다 적어 두는 형태가 다르다.
 *
 * **여기서 몰래 고치지 않는다.** 한때 잘못된 주소를 자동으로 바로잡아 부르게 만들었다가
 * 되돌렸다 — 저장된 값과 실제로 부르는 주소가 달라지면, 사람은 자기가 무엇을 넣었는지
 * 모르는 채로 쓰게 되고 다음에도 같은 값을 넣는다. **틀린 값은 넣는 자리에서 막고,
 * 무엇을 어떻게 고쳐야 하는지 말해 준다.**
 *
 * | 붙여 넣는 것 | 왜 안 되나 | 우리가 하는 말 |
 * |---|---|---|
 * | `…/v1/chat/completions` | 끝까지 적힌 주소. SDK가 뒤에 또 붙여 404 | 그 부분을 빼라 |
 * | `…/v1beta`(Gemini) | 네이티브 주소. `messages`를 못 읽는다 | `/openai`까지 넣어라 |
 * | `http://…` (내 컴퓨터가 아님) | 키가 평문으로 나간다 | https를 쓰라 |
 * | 주소가 아닌 글자 | 오타·따옴표 | 주소를 확인하라 |
 *
 * 이 파일은 서버 전용이 아니다. **입력 칸에서도 같은 판단을 써야** 사람이 저장을 누르기
 * 전에 알 수 있고, 저장 자리(`setup-actions.ts`)는 같은 함수로 한 번 더 막는다.
 */

const TRAILING_SLASHES = /\/+$/u;

/** 이미 완성된 엔드포인트. 사람이 문서에서 통째로 복사해 오는 형태다. */
const COMPLETIONS_SUFFIX = "/chat/completions";

/** Gemini의 OpenAI 호환 계층은 네이티브 주소 뒤에 `/openai`를 붙인 자리에 있다. */
const GEMINI_HOST = "generativelanguage.googleapis.com";

/**
 * 무엇이 잘못됐는지. **문장이 아니라 이름으로 오간다.**
 *
 * 저장 자리에서 막았다는 사실을 화면까지 옮길 때 주소줄을 거치는데(`?문제=…`), 거기에
 * 문장을 실으면 아무나 만든 주소로 **우리 화면에 아무 문장이나 띄울 수 있다.**
 * 이름만 오가면 화면이 아는 문장만 나온다.
 */
type BaseUrlProblem =
  | "not_a_url"
  | "not_http"
  | "completions_suffix"
  | "gemini_native"
  | "insecure_http";

const PROBLEMS: readonly BaseUrlProblem[] = [
  "not_a_url",
  "not_http",
  "completions_suffix",
  "gemini_native",
  "insecure_http",
];

/** 주소줄로 돌아온 이름이 우리가 아는 것인가. 모르는 값은 화면에 아무것도 띄우지 않는다. */
function isBaseUrlProblem(value: string | undefined): value is BaseUrlProblem {
  return value !== undefined && (PROBLEMS as readonly string[]).includes(value);
}

/**
 * 저장할 값으로 다듬는다. **뜻을 바꾸지 않는다** — 앞뒤 공백과 끝의 슬래시만 턴다.
 * 그 둘은 사람이 의도한 값이 아니고, 고쳐도 어느 서버를 부르는지가 달라지지 않는다.
 */
function trimBaseUrl(raw: string): string {
  return raw.trim().replace(TRAILING_SLASHES, "");
}

/**
 * 이 주소로 부를 수 있나. 부를 수 없으면 무엇이 잘못됐는지 이름으로 돌려준다.
 *
 * 빈 값은 문제가 아니다 — AI 연결을 켜지 않겠다는 뜻이고, 그때는 생성 기능만 꺼진다.
 */
function checkBaseUrl(raw: string): BaseUrlProblem | undefined {
  const url = trimBaseUrl(raw);
  if (url.length === 0) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "not_a_url";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "not_http";
  }

  if (url.endsWith(COMPLETIONS_SUFFIX)) {
    return "completions_suffix";
  }

  if (parsed.hostname === GEMINI_HOST && !parsed.pathname.includes("/openai")) {
    return "gemini_native";
  }

  /*
   * 내 컴퓨터가 아닌 http는 막는다. 이 주소로 **키가 함께 나가기** 때문이다(§7).
   * 같은 컴퓨터에 띄운 모델(vLLM·Ollama)은 http가 정상이라 그때는 통과시킨다.
   */
  const local = parsed.hostname === "localhost" || parsed.hostname.startsWith("127.");
  if (parsed.protocol === "http:" && !local) {
    return "insecure_http";
  }

  return;
}

/**
 * 사람에게 할 말. **고칠 방법을 말한다** — 무엇이 틀렸는지만 알려 주면 고칠 수 없다.
 *
 * 넣은 값을 함께 받으면 고쳐 쓴 주소를 예로 보여 준다. 주소줄을 거쳐 온 경우처럼
 * 값이 없으면 방법만 말한다.
 */
function baseUrlAdvice(problem: BaseUrlProblem, raw?: string): string {
  const url = raw === undefined ? "" : trimBaseUrl(raw);

  switch (problem) {
    case "not_a_url":
      return "주소 형태가 아니에요. 따옴표나 공백이 섞이지 않았는지 보고, `https://`로 시작하는 주소를 넣어 주세요.";
    case "not_http":
      return "AI API 주소는 `https://`(또는 내 컴퓨터에 띄운 모델이면 `http://`)로 시작해야 해요.";
    case "completions_suffix": {
      const shorter = url.endsWith(COMPLETIONS_SUFFIX)
        ? url.slice(0, -COMPLETIONS_SUFFIX.length)
        : "";
      const example = shorter === "" ? "" : ` — \`${shorter}\`까지만 넣으면 돼요.`;
      return `주소 끝의 \`${COMPLETIONS_SUFFIX}\`는 빼 주세요. 그 부분은 우리가 붙여요${example}`;
    }
    case "gemini_native": {
      const example = url === "" ? "`…/v1beta/openai`" : `\`${url}/openai\``;
      return `Gemini는 OpenAI 호환 주소가 따로 있어요. ${example}처럼 \`/openai\`까지 넣어 주세요.`;
    }
    case "insecure_http":
      return "`http://` 주소로 보내면 API 키가 그대로 흘러가요. `https://` 주소를 쓰거나, 내 컴퓨터에 띄운 모델이면 `localhost`를 쓰세요.";
    default:
      return "";
  }
}

export { baseUrlAdvice, checkBaseUrl, isBaseUrlProblem, trimBaseUrl };
export type { BaseUrlProblem };
