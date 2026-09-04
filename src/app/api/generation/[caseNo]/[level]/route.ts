import { corpusDb } from "@/db/client";
import {
  findGenerationProgress,
  findJudgmentByCaseNo,
  type JobProgress,
} from "@/db/corpus/repository";
import { LEVELS } from "@/db/corpus/schema";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { PIPELINE_VERSION } from "@/server/generate";

/**
 * 생성 진행 전달(SSE). `PRODUCT.md` §5.3
 *
 * 설명 하나를 만드는 데 수십 초가 걸린다. 그동안 화면이 아무 말도 하지 않으면 기다리는
 * 사람은 **멈춘 것과 만들고 있는 것을 구별할 수 없다.** 그래서 작업이 지금 어느 단계인지를
 * 흘려보낸다. 두 번째 이후 요청자에게도 같은 창이 열린다 — 남이 만들고 있는 것도 진행이다.
 *
 * **작업 표를 1초마다 들여다본다.** 프로세스 안 이벤트 버스를 두지 않은 이유는 두 가지다.
 * 하나, 생성은 서버 액션이 `after()`로 이어 돌리는 일이라 SSE를 받는 요청과 같은 프로세스라는
 * 보장이 없다. 둘, 진실은 이미 DB에 있다 — 메모리에 사본을 두면 둘이 갈라진다.
 * SQLite 조회 한 번은 인덱스 하나짜리 단일 행이라 1초 간격이면 무시할 만하다.
 */

/** 얼마나 자주 들여다보나. 단계가 바뀌는 간격(수 초~수십 초)에 비하면 촘촘하다. */
const POLL_MS = 1000;

/**
 * 이만큼 지나면 스스로 닫는다.
 *
 * 브라우저는 SSE가 끊기면 다시 붙으므로 여기서 닫아도 잃는 것이 없다. 반대로 닫지 않으면
 * 탭을 열어 둔 사람마다 열린 연결이 하나씩 쌓인다. 5분이다.
 */
const MAX_MS = 300_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 화면이 읽을 형태. 작업이 없으면 `idle`이다. */
function toEvent(progress: JobProgress | undefined): string {
  const payload =
    progress === undefined
      ? { status: "idle" }
      : { status: progress.status, stage: progress.stage };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * 작업 상태를 흘려보내는 스트림. 바뀔 때만 한 줄씩 나간다.
 *
 * 끝난 작업(`done`·`failed`)에서는 스스로 닫는다 — 화면이 그때 다시 그리면 그만이다.
 */
function progressStream(input: {
  db: ReturnType<typeof corpusDb>;
  judgmentId: string;
  level: (typeof LEVELS)[number];
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  /*
   * 브라우저가 탭을 닫으면 스트림이 우리보다 먼저 끊긴다. 그 뒤에 밀어 넣거나 닫으려 하면
   * 예외가 나므로, 끊겼다는 사실을 여기서 들고 있는다 — `signal`만 보면 앞단이 연결을
   * 접은 경우를 놓친다.
   */
  let open = true;

  return new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let last = "";

      while (open && !input.signal.aborted && Date.now() - startedAt < MAX_MS) {
        const progress = findGenerationProgress(input.db, {
          judgmentId: input.judgmentId,
          level: input.level,
          promptVersion: PIPELINE_VERSION,
        });
        const event = toEvent(progress);

        // 바뀐 것이 없으면 보내지 않는다. 같은 말을 1초마다 되풀이할 이유가 없다.
        if (event !== last) {
          controller.enqueue(encoder.encode(event));
          last = event;
        }

        // 끝난 작업에는 더 볼 것이 없다.
        if (progress?.status === "done" || progress?.status === "failed") {
          break;
        }

        // biome-ignore lint/performance/noAwaitInLoops: 폴링은 한 번 자고 다시 보는 일이다.
        await sleep(POLL_MS);
      }

      if (open) {
        controller.close();
      }
    },
    cancel() {
      open = false;
    },
  });
}

async function GET(
  request: Request,
  context: { params: Promise<{ caseNo: string; level: string }> },
) {
  const { caseNo, level } = await context.params;

  const canonical = toCanonicalCaseNumber(decodeURIComponent(caseNo));
  const levels: readonly string[] = LEVELS;
  if (canonical === undefined || !levels.includes(level)) {
    return new Response("not found", { status: 404 });
  }

  const db = corpusDb();
  const judgment = findJudgmentByCaseNo(db, canonical);
  if (judgment === undefined) {
    return new Response("not found", { status: 404 });
  }

  const stream = progressStream({
    db,
    judgmentId: judgment.id,
    level: level as (typeof LEVELS)[number],
    signal: request.signal,
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      // 앞단에 nginx를 두면 기본 설정이 스트림을 모아 뒀다가 한꺼번에 보낸다.
      "x-accel-buffering": "no",
    },
  });
}

export { GET };
