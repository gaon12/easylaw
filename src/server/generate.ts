import "server-only";
import { randomUUID } from "node:crypto";
import { corpusDb } from "@/db/client";
import {
  claimGenerationJob,
  countGenerationsOn,
  finishGenerationJob,
  type Level,
  listSpans,
  listStructureNodes,
  reserveGenerationSlot,
  saveRendition,
  saveStructure,
  setGenerationStage,
} from "@/db/corpus/repository";
import { dayKey } from "@/lib/format";
import { llm } from "@/lib/llm/client";
import { type Claim, checkEntailment, toConfidence } from "@/lib/pipeline/entail";
import { extractStructure } from "@/lib/pipeline/extract";
import { PROMPT_VERSION as EXTRACT_VERSION } from "@/lib/pipeline/extract-prompt";
import { renderLevel } from "@/lib/pipeline/render";
import { RENDER_PROMPT_VERSION } from "@/lib/pipeline/render-prompt";
import { generationDailyLimit, siteTimeZone } from "@/server/settings";

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
 * 사이트 시간대의 오늘. 상한은 "하루"에 걸리는데, 그 하루는 서버가 어디서 도는지가 아니라
 * 설치할 때 고른 시간대를 따라야 한다(`lib/format.ts`).
 */
function today(now: Date = new Date()): string {
  return dayKey(now, siteTimeZone());
}

/** 상한에 걸려 닫은 작업에 남기는 말. 화면은 이 문자열이 아니라 남은 몫을 보고 판단한다. */
const LIMIT_REASON = "오늘 만들 수 있는 만큼을 다 만들었습니다.";

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
  judgmentId: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = corpusDb();
  if (listStructureNodes(db, judgmentId).length > 0) {
    return { ok: true };
  }

  const client = llm();
  if (client === undefined) {
    return { ok: false, reason: "AI 연결이 설정되지 않았습니다." };
  }

  const spans = listSpans(db, judgmentId);
  if (spans.length === 0) {
    return { ok: false, reason: "원문이 없습니다." };
  }

  const extracted = await extractStructure(client, spans, signal);
  if (extracted.nodes.length === 0) {
    return { ok: false, reason: "구조를 하나도 뽑지 못했습니다." };
  }

  saveStructure(db, judgmentId, extracted.nodes);
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
  judgmentId: string;
  jobId: string;
  signal?: AbortSignal | undefined;
}): Promise<
  | { ok: true; sentences: Awaited<ReturnType<typeof attemptOnce>>["sentences"] }
  | { ok: false; reason: string }
> {
  const db = corpusDb();
  const nodes = listStructureNodes(db, input.judgmentId);
  const spanText = new Map(listSpans(db, input.judgmentId).map((span) => [span.id, span.text]));

  let lastReason = "근거 있는 설명을 만들지 못했습니다.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: 재시도는 앞 시도의 결과를 봐야 한다.
    const tried = await attemptOnce({
      client: input.client,
      level: input.level,
      nodes,
      spanText,
      jobId: input.jobId,
      signal: input.signal,
    });
    if (tried.ok) {
      return { ok: true, sentences: tried.sentences };
    }
    lastReason = tried.reason;
  }

  return { ok: false, reason: lastReason };
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
  jobId: string;
  signal?: AbortSignal | undefined;
}) {
  const { client, level, nodes, spanText, jobId, signal } = input;
  const db = corpusDb();

  setGenerationStage(db, jobId, "render");
  const rendered = await renderLevel(client, level, nodes, signal);
  const nodeSpans = new Map(nodes.map((node) => [node.id, node.spanIds]));

  setGenerationStage(db, jobId, "verify");
  const checks = await checkEntailment(
    client,
    claimsFor(rendered.lines, nodeSpans, spanText),
    signal,
  );
  const byOrder = new Map(checks.map((check) => [check.orderIdx, check]));

  const sentences = rendered.lines.map((line) => {
    const check = byOrder.get(line.orderIdx);
    /*
     * 제목은 함의 검사를 하지 않는다(근거가 없는 것이 정상이다). 렌더 단계가 이미
     * grounded로 뒀으므로 그대로 둔다.
     */
    const confidence =
      line.role === "heading" ? line.confidence : toConfidence(check?.verdict ?? "unsupported");

    return {
      orderIdx: line.orderIdx,
      role: line.role,
      text: line.text,
      structureNodeId: line.structureNodeId,
      confidence,
      checkReason: check?.reason ?? null,
    };
  });

  const ungrounded = sentences.filter((sentence) => sentence.confidence === "ungrounded").length;
  const reason =
    ungrounded > 0
      ? `근거 없는 문장이 ${ungrounded}개 남았습니다.`
      : (rendered.issues[0]?.message ?? "규칙 검사를 통과하지 못했습니다.");

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
function beginGeneration(judgmentId: string, level: Level): BeginResult {
  const db = corpusDb();
  if (llm() === undefined) {
    return { kind: "unavailable" };
  }

  const claim = claimGenerationJob(db, {
    judgmentId,
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

  /*
   * 오늘 몫을 뗀다. **선점한 뒤에** 뗀다 — 이미 만들어져 있거나 남이 만들고 있는 요청은
   * 위에서 돌아가므로 몫을 쓰지 않아야 한다. 여기까지 온 요청은 실제로 모델을 부른다.
   *
   * 못 떼면 작업을 실패로 닫는다. 선점만 하고 남겨 두면 그 자리가 90초 동안 막힌다.
   */
  if (!reserveGenerationSlot(db, { day: today(), limit: generationDailyLimit() })) {
    finishGenerationJob(db, claim.jobId, { ok: false, error: LIMIT_REASON });
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
async function runGeneration(
  judgmentId: string,
  level: Level,
  jobId: string,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const db = corpusDb();
  const client = llm();
  if (client === undefined) {
    finishGenerationJob(db, jobId, { ok: false, error: "AI 연결이 설정되지 않았습니다." });
    return { kind: "unavailable" };
  }

  try {
    setGenerationStage(db, jobId, "structure");
    const structure = await ensureStructure(judgmentId, signal);
    if (!structure.ok) {
      finishGenerationJob(db, jobId, { ok: false, error: structure.reason });
      return { kind: "failed", reason: structure.reason };
    }

    const tried = await tryUntilGrounded({ client, level, judgmentId, jobId, signal });
    if (!tried.ok) {
      finishGenerationJob(db, jobId, { ok: false, error: tried.reason });
      return { kind: "failed", reason: tried.reason };
    }

    setGenerationStage(db, jobId, "save");
    const renditionId = saveRendition(db, {
      judgmentId,
      level,
      model: client.model,
      promptVersion: PIPELINE_VERSION,
      sentences: tried.sentences,
    });
    finishGenerationJob(db, jobId, { ok: true });

    return {
      kind: "done",
      renditionId,
      needsCheck: tried.sentences.filter((sentence) => sentence.confidence === "needs_check")
        .length,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "설명을 만들지 못했습니다.";
    /*
     * 작업을 실패로 닫아야 한다. 선점만 하고 끝나면 그 좀비 작업이 캐시를 영구히 막는다
     * (§5.3이 이 구조의 최악으로 꼽은 상황이다). 회수 주기가 있지만 90초를 기다릴 이유가 없다.
     */
    finishGenerationJob(db, jobId, { ok: false, error: reason });
    return { kind: "failed", reason };
  }
}

/**
 * 선점부터 저장까지 한 번에. 스크립트와 테스트가 쓰는 입구다.
 *
 * 화면은 이 함수를 쓰지 않는다 — 수십 초를 응답 안에서 기다리게 되기 때문이다.
 * 화면 쪽은 `beginGeneration`으로 자리를 잡고 `runGeneration`을 응답 뒤로 미룬다.
 */
async function generateRendition(
  judgmentId: string,
  level: Level,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const begun = beginGeneration(judgmentId, level);
  if (begun.kind !== "claimed") {
    return begun;
  }
  return await runGeneration(judgmentId, level, begun.jobId, signal);
}

export { beginGeneration, generateRendition, generationBudget, PIPELINE_VERSION, runGeneration };
export type { BeginResult, GenerateResult };
