import "server-only";
import { randomUUID } from "node:crypto";
import { appDb, corpusDb } from "@/db/client";
import { countGenerationsOn, reserveGenerationSlot } from "@/db/corpus/repository";
import { dayKey } from "@/lib/format";
import { type GenerationIdentity, GenerationLimiter } from "@/lib/generation-limit";
import type { JobFailure } from "@/lib/job-outcome";
import { LlmError, llm } from "@/lib/llm/client";
import { type Claim, checkEntailment, toConfidence } from "@/lib/pipeline/entail";
import { extractStructure } from "@/lib/pipeline/extract";
import { PROMPT_VERSION as EXTRACT_VERSION } from "@/lib/pipeline/extract-prompt";
import { renderLevel } from "@/lib/pipeline/render";
import { RENDER_PROMPT_VERSION } from "@/lib/pipeline/render-prompt";
import { viewer } from "@/lib/strings";
import { HEARTBEAT_MS } from "@/lib/timing";
import { glossesInText } from "@/server/glossary";
import type { PipelineStore, StoreLevel, StoreStage } from "@/server/pipeline-store";
import {
  DEFAULT_GENERATION_IP_LIMIT,
  DEFAULT_GENERATION_SESSION_LIMIT,
  generationDailyLimit,
  generationIpLimit,
  generationSessionLimit,
  siteTimeZone,
} from "@/server/settings";

/**
 * 생성 파이프라인을 하나로 엮는다. `PRODUCT.md` §5.5 [7] · §5.3
 *
 * 조각들은 각자 `lib/pipeline`에 있고 DB도 설정도 모른다. 여기가 그것들을 **저장소와
 * 잇는 유일한 자리**다. 그래서 조각은 실호출 없이 시험할 수 있고(§8), 이 파일만
 * 트랜잭션과 작업 선점을 안다.
 */

/**
 * 캐시 키에 들어가는 버전.
 *
 * **두 프롬프트를 합친다.** 구조 추출을 고쳐도 결과가 달라지고 렌더링을 고쳐도 달라지므로,
 * 한쪽만 키에 넣으면 프롬프트를 고친 뒤에도 옛 결과가 그대로 나온다(§6.4).
 */
const PIPELINE_VERSION = `${EXTRACT_VERSION}+${RENDER_PROMPT_VERSION}`;

/**
 * 재생성 횟수.
 *
 * §5.5 [7] — "근거 없음 → 재생성(최대 2회) 후 폐기". 무한히 다시 걸면 한 판결문이
 * 하루 생성 상한을 통째로 먹는다.
 */
const MAX_ATTEMPTS = 2;

/**
 * 이 파일은 **어느 저장소인지 모른다.** 공개 판례든 올린 판결문이든 `PipelineStore` 하나로
 * 받는다(`PRODUCT.md` §6.3). 어느 DB를 쓸지는 store를 만드는 쪽이 이미 정했다.
 */
type Level = StoreLevel;

/**
 * 사이트 시간대의 오늘. 상한은 "하루"에 걸리는데, 그 하루는 서버가 어디서 도는지가 아니라
 * 설치할 때 고른 시간대를 따라야 한다(`lib/format.ts`).
 */
function today(now: Date = new Date()): string {
  return dayKey(now, siteTimeZone());
}

/** 상한에 걸려 닫은 작업에 남기는 말. 화면은 이 문자열이 아니라 남은 몫을 보고 판단한다. */
const LIMIT_REASON = "오늘 만들 수 있는 만큼을 다 만들었습니다.";
const REQUEST_LIMIT_REASON = "잠시 후 다시 시도해 주세요.";

/** 신규 모델 호출에만 적용하는 프로세스별 방어막. 공유 저장소로 교체할 수 있게 호출부와 분리한다. */
let requestLimiter = new GenerationLimiter({
  ipLimit: DEFAULT_GENERATION_IP_LIMIT,
  sessionLimit: DEFAULT_GENERATION_SESSION_LIMIT,
});
let requestLimiterSignature = `${DEFAULT_GENERATION_IP_LIMIT}:${DEFAULT_GENERATION_SESSION_LIMIT}`;

/** 관리자 설정이 바뀌면 다음 요청부터 새 상한을 사용한다. 카운터는 설정 변경 시 초기화한다. */
function configuredRequestLimiter(): GenerationLimiter {
  const ipLimit = generationIpLimit(appDb());
  const sessionLimit = generationSessionLimit(appDb());
  const signature = `${ipLimit}:${sessionLimit}`;
  if (signature !== requestLimiterSignature) {
    requestLimiter = new GenerationLimiter({ ipLimit, sessionLimit });
    requestLimiterSignature = signature;
  }
  return requestLimiter;
}

/**
 * 오늘 얼마나 남았나. 상한은 `app` DB의 설정이고 사용량은 `corpus` DB에 있어서
 * **두 저장소를 잇는 이 계층**이 합친다(§10.2 — 두 DB를 조인하지 않는다).
 */
function generationBudget(): { limit: number; used: number; remaining: number } {
  const limit = generationDailyLimit();
  const used = countGenerationsOn(corpusDb(), today());
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/** `beginGeneration`의 결과. `claimed`일 때만 뒤이어 `runGeneration`을 부른다. */
type BeginResult =
  | { readonly kind: "claimed"; readonly jobId: string }
  | { readonly kind: "running" }
  | { readonly kind: "cached" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "limited" };

type GenerateResult =
  | { readonly kind: "done"; readonly renditionId: string; readonly needsCheck: number }
  /** 다른 요청이 이미 만들고 있다(§5.3). 새로 만들지 않고 기다린다. */
  | { readonly kind: "running" }
  /** 이미 만들어져 있다. 그대로 읽으면 된다. */
  | { readonly kind: "cached" }
  | { readonly kind: "unavailable" }
  /** 오늘 몫을 다 썼다([F-42]). 내일이면 다시 만들 수 있다. */
  | { readonly kind: "limited" }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * 구조를 확보한다. 이미 뽑아 둔 것이 있으면 다시 뽑지 않는다.
 *
 * **구조는 레벨과 무관하다.** 같은 판결문의 L2와 L4는 같은 구조에서 파생되므로, 레벨마다
 * 다시 뽑으면 같은 일을 네 번 하고 네 번 다른 결과가 나온다.
 */
async function ensureStructure(
  store: PipelineStore,
  signal?: AbortSignal,
): Promise<{ ok: true } | JobFailure> {
  /*
   * **이 추출 프롬프트 판이 뽑은 구조**만 본다. 지시문을 고치는 이유는 앞선 판이 잘못
   * 뽑았기 때문인데, 판을 보지 않으면 이미 처리한 판결문은 영영 옛 결과를 쓴다.
   */
  if (store.listNodes(EXTRACT_VERSION).length > 0) {
    return { ok: true };
  }

  const client = llm();
  if (client === undefined) {
    return {
      ok: false,
      reason: viewer.failedReasons.notConfigured,
      detail: "AI 연결이 설정되지 않았습니다.",
    };
  }

  const spans = store.listSpans();
  if (spans.length === 0) {
    return { ok: false, reason: viewer.failedReasons.noOriginal, detail: "원문이 없습니다." };
  }

  const extracted = await extractStructure(client, spans, signal);
  if (extracted.nodes.length === 0) {
    return {
      ok: false,
      reason: viewer.failedReasons.noStructure,
      detail: "구조를 하나도 뽑지 못했습니다.",
    };
  }

  store.saveNodes(EXTRACT_VERSION, extracted.nodes);
  return { ok: true };
}

/** 문장에 매달린 원문을 모은다. 함의 검사가 볼 근거다. */
function claimsFor(
  lines: readonly {
    orderIdx: number;
    role: string;
    text: string;
    structureNodeId: string | null;
  }[],
  nodeSpans: ReadonlyMap<string, readonly string[]>,
  spanText: ReadonlyMap<string, string>,
): Claim[] {
  return lines
    .filter((line) => line.role === "body")
    .map((line) => ({
      orderIdx: line.orderIdx,
      text: line.text,
      sources:
        line.structureNodeId === null
          ? []
          : (nodeSpans.get(line.structureNodeId) ?? [])
              .map((spanId) => spanText.get(spanId))
              .filter((text): text is string => text !== undefined),
    }));
}

/**
 * 근거 있는 결과가 나올 때까지 다시 만든다. §5.5 [7] — 최대 2회.
 *
 * 시도할 때마다 단계를 다시 적는다. 그것이 곧 heartbeat다 — 한 시도가 수십 초라
 * 아무 말도 없으면 그 사이에 좀비로 회수된다.
 */
async function tryUntilGrounded(input: {
  client: NonNullable<ReturnType<typeof llm>>;
  level: Level;
  store: PipelineStore;
  jobId: string;
  signal?: AbortSignal | undefined;
}): Promise<
  { ok: true; sentences: Awaited<ReturnType<typeof attemptOnce>>["sentences"] } | JobFailure
> {
  const nodes = input.store.listNodes(EXTRACT_VERSION);
  const spanText = new Map(input.store.listSpans().map((span) => [span.id, span.text]));

  let lastReason = "근거 있는 설명을 만들지 못했습니다.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: 재시도는 앞 시도의 결과를 봐야 한다.
    const tried = await attemptOnce({
      client: input.client,
      level: input.level,
      nodes,
      spanText,
      store: input.store,
      jobId: input.jobId,
      signal: input.signal,
    });
    if (tried.ok) {
      return { ok: true, sentences: tried.sentences };
    }
    lastReason = tried.reason;
  }

  /*
   * 여기까지 온 실패는 전부 **근거를 못 붙였거나 규칙을 못 지킨 것**이다(P2). 이용자에게는
   * 그 구분이 의미 없다 — 할 수 있는 일이 같다. 어느 규칙이 걸렸는지는 관리자가 본다.
   */
  return { ok: false, reason: viewer.failedReasons.ungrounded, detail: lastReason };
}

/**
 * 한 레벨의 설명을 만든다.
 *
 * 순서: 작업 선점(§5.3) → 구조 확보 → 렌더 → 함의 검사 → 신뢰도 확정 → 저장.
 *
 * **`ungrounded` 문장이 남으면 다시 만든다**(최대 2회). 그래도 남으면 실패로 끝낸다 —
 * 근거 없는 문장을 배지만 붙여 내보내지 않는다(P2). 반면 `needs_check`는 내보낸다.
 * "확인이 필요하다"와 "근거가 없다"는 다른 말이다.
 */
/** 한 번의 시도. 렌더 → 함의 검사 → 신뢰도 확정까지가 한 덩어리다. */
async function attemptOnce(input: {
  client: NonNullable<ReturnType<typeof llm>>;
  level: Level;
  nodes: readonly { id: string; kind: string; payload: unknown; spanIds: readonly string[] }[];
  spanText: ReadonlyMap<string, string>;
  store: PipelineStore;
  jobId: string;
  signal?: AbortSignal | undefined;
}) {
  const { client, level, nodes, spanText, store, jobId, signal } = input;

  /*
   * **낱말 뜻은 찾아서 준다. 모델이 지어내게 두지 않는다.**
   *
   * "과태료는 규칙을 어겼을 때 내는 돈이에요" 같은 풀이를 모델이 만들면 틀려도 그럴듯해서
   * 아무도 못 잡는다. 공식 정의를 먼저 찾아 지시문에 실어 보내고, 모델은 그 뜻을 이
   * 단계의 말투로 옮기기만 한다(`server/glossary.ts`).
   *
   * 쉬운 단계에서만 한다. 법조계·일반 성인 단계는 낱말 뜻을 달지 않는다.
   */
  const glosses =
    level === "L3" || level === "L4"
      ? glossesInText(nodes.map((node) => JSON.stringify(node.payload)).join(" "))
      : [];

  const rendered = await whileAlive(store, jobId, "render", () =>
    renderLevel(client, level, nodes, { glosses, signal }),
  );
  const nodeSpans = new Map(nodes.map((node) => [node.id, node.spanIds]));

  const checks = await whileAlive(store, jobId, "verify", () =>
    checkEntailment(client, claimsFor(rendered.lines, nodeSpans, spanText), signal),
  );
  const byOrder = new Map(checks.map((check) => [check.orderIdx, check]));

  const sentences = rendered.lines.map((line) => {
    const check = byOrder.get(line.orderIdx);
    /*
     * 제목과 낱말 뜻은 함의 검사를 하지 않는다 — 판결문에 근거가 없는 것이 **정상이다.**
     * 제목은 우리가 정한 이름이고, 낱말 뜻은 사전에서 왔다(출처를 함께 적는다).
     * 예전에는 낱말 뜻도 검사에 걸려 전부 "확인 필요"가 됐다. 우리가 시켜서 쓴 문장을
     * 우리가 깎은 셈이고, 가장 쉬워야 할 L4에 경고가 제일 많이 붙는 이유였다.
     */
    const confidence =
      line.role === "body" ? toConfidence(check?.verdict ?? "unsupported") : line.confidence;

    return {
      orderIdx: line.orderIdx,
      role: line.role,
      text: line.text,
      structureNodeId: line.structureNodeId,
      source: line.source,
      confidence,
      checkReason: check?.reason ?? null,
    };
  });

  const ungrounded = sentences.filter((sentence) => sentence.confidence === "ungrounded").length;
  let reason = rendered.issues[0]?.message ?? "규칙 검사를 통과하지 못했습니다.";
  if (rendered.missingNodeIds.length > 0) {
    reason = `구조에 있는 핵심 내용 ${rendered.missingNodeIds.length}개를 설명하지 않았습니다.`;
  }
  if (ungrounded > 0) {
    reason = `근거 없는 문장이 ${ungrounded}개 남았습니다.`;
  }

  return { sentences, ok: ungrounded === 0 && !rendered.blocked, reason };
}

/**
 * 한 레벨의 설명을 만든다.
 *
 * 순서: 작업 선점(§5.3) → 구조 확보 → 렌더 → 함의 검사 → 신뢰도 확정 → 저장.
 *
 * **`ungrounded` 문장이 남으면 다시 만든다**(최대 2회). 그래도 남으면 실패로 끝낸다 —
 * 근거 없는 문장을 배지만 붙여 내보내지 않는다(P2). 반면 `needs_check`는 내보낸다.
 * "확인이 필요하다"와 "근거가 없다"는 다른 말이다.
 */
function beginGeneration(
  store: PipelineStore,
  level: Level,
  identity?: GenerationIdentity,
): BeginResult {
  if (llm() === undefined) {
    return { kind: "unavailable" };
  }

  const claim = store.claimJob({
    level,
    promptVersion: PIPELINE_VERSION,
    workerId: randomUUID(),
  });
  if (claim.kind === "running") {
    return { kind: "running" };
  }
  if (claim.kind === "done") {
    return { kind: "cached" };
  }

  // 캐시·동시 실행은 위에서 끝났으므로 실제 모델 호출 후보만 요청자 몫을 쓴다.
  const limiter = identity === undefined ? undefined : configuredRequestLimiter();
  if (identity !== undefined && limiter !== undefined && !limiter.claim(identity).allowed) {
    store.finishJob(claim.jobId, {
      ok: false,
      reason: REQUEST_LIMIT_REASON,
      detail: "요청자별 상한에 걸렸습니다.",
    });
    return { kind: "limited" };
  }

  /*
   * 오늘 몫을 뗀다. **선점한 뒤에** 뗀다 — 이미 만들어져 있거나 남이 만들고 있는 요청은
   * 위에서 돌아가므로 몫을 쓰지 않아야 한다. 여기까지 온 요청은 실제로 모델을 부른다.
   *
   * 못 떼면 작업을 실패로 닫는다. 선점만 하고 남겨 두면 그 자리가 90초 동안 막힌다.
   */
  if (!reserveGenerationSlot(corpusDb(), { day: today(), limit: generationDailyLimit() })) {
    if (identity !== undefined) {
      limiter?.release(identity);
    }
    store.finishJob(claim.jobId, {
      ok: false,
      reason: LIMIT_REASON,
      detail: "하루 상한을 다 썼습니다.",
    });
    return { kind: "limited" };
  }

  return { kind: "claimed", jobId: claim.jobId };
}

/**
 * 선점해 둔 작업을 실제로 돌린다. **`beginGeneration`이 낸 `jobId`로만 부른다.**
 *
 * 이 함수는 응답을 기다리게 하지 않는 자리(`after()`)에서 불린다. 그래서 선점과 분리한다 —
 * 선점은 요청 안에서 끝나야 화면이 곧바로 "만들고 있어요"를 그릴 수 있고, 오래 걸리는
 * 일은 응답을 보낸 뒤에 이어져야 한다.
 */
/**
 * 일하는 동안 **계속** "살아 있다"고 적는다.
 *
 * 예전에는 단계가 바뀔 때만 적었다. 그래서 두 heartbeat 사이의 간격이 곧 AI 호출 하나의
 * 길이였고, 답을 300초 기다리는 정상 작업이 좀비로 회수돼 **같은 판결문에 두 번 지출**하고
 * 둘이 서로의 구조를 밟았다. 회수 시간을 호출보다 길게 잡는 방법도 있지만, 그러면 정말
 * 죽은 작업이 그만큼 오래 그 판결문을 막는다.
 *
 * 기다리는 동안에도 말하면 둘 다 풀린다 — 호출은 얼마든지 길어도 되고, 회수는 빨라도 된다.
 * 단계 이름을 그대로 다시 적는 것이 곧 heartbeat다(`setStage`).
 */
async function whileAlive<T>(
  store: PipelineStore,
  jobId: string,
  stage: StoreStage,
  work: () => Promise<T>,
): Promise<T> {
  store.setStage(jobId, stage);
  const beat = setInterval(() => {
    store.setStage(jobId, stage);
  }, HEARTBEAT_MS);
  /* 노드를 붙잡아 두지 않는다. 이 타이머 하나 때문에 프로세스가 안 끝나면 안 된다. */
  beat.unref?.();

  try {
    return await work();
  } finally {
    clearInterval(beat);
  }
}

async function runGeneration(
  store: PipelineStore,
  level: Level,
  jobId: string,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const client = llm();
  if (client === undefined) {
    store.finishJob(jobId, {
      ok: false,
      reason: viewer.failedReasons.notConfigured,
      detail: "AI 연결이 설정되지 않았습니다.",
    });
    return { kind: "unavailable" };
  }

  try {
    const structure = await whileAlive(store, jobId, "structure", () =>
      ensureStructure(store, signal),
    );
    if (!structure.ok) {
      store.finishJob(jobId, structure);
      return { kind: "failed", reason: structure.detail };
    }

    const tried = await tryUntilGrounded({ client, level, store, jobId, signal });
    if (!tried.ok) {
      store.finishJob(jobId, tried);
      return { kind: "failed", reason: tried.detail };
    }

    store.setStage(jobId, "save");
    const renditionId = store.saveRendition({
      level,
      model: client.model,
      promptVersion: PIPELINE_VERSION,
      sentences: tried.sentences,
    });
    store.finishJob(jobId, { ok: true });

    return {
      kind: "done",
      renditionId,
      needsCheck: tried.sentences.filter((sentence) => sentence.confidence === "needs_check")
        .length,
    };
  } catch (error) {
    /*
     * **여기가 운영자 진단과 이용자 안내가 갈리는 자리다.** `LlmError.message`에는 상태
     * 코드·제공자 문구·우리가 설정한 주소가 들어 있다. 그것을 그대로 화면에 내보내면
     * 아무나 여는 판결문 페이지에 운영 설정이 찍힌다.
     */
    const detail = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
    const reason = error instanceof LlmError ? error.publicMessage : viewer.failedReasons.unknown;

    /*
     * 작업을 실패로 닫아야 한다. 선점만 하고 끝나면 그 좀비 작업이 캐시를 영구히 막는다
     * (§5.3이 이 구조의 최악으로 꼽은 상황이다). 회수 주기가 있지만 기다릴 이유가 없다.
     */
    store.finishJob(jobId, { ok: false, reason, detail });
    return { kind: "failed", reason: detail };
  }
}

/**
 * 선점부터 저장까지 한 번에. 스크립트와 테스트가 쓰는 입구다.
 *
 * 화면은 이 함수를 쓰지 않는다 — 수십 초를 응답 안에서 기다리게 되기 때문이다.
 * 화면 쪽은 `beginGeneration`으로 자리를 잡고 `runGeneration`을 응답 뒤로 미룬다.
 */
async function generateRendition(
  store: PipelineStore,
  level: Level,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const begun = beginGeneration(store, level);
  if (begun.kind !== "claimed") {
    return begun;
  }
  return await runGeneration(store, level, begun.jobId, signal);
}

export {
  beginGeneration,
  generateRendition,
  generationBudget,
  PIPELINE_VERSION,
  REQUEST_LIMIT_REASON,
  runGeneration,
};
export type { BeginResult, GenerateResult };
