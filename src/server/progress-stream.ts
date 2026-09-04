import "server-only";
import type { StoreProgress } from "@/server/pipeline-store";

/**
 * 생성 진행을 흘려보내는 스트림(SSE). `PRODUCT.md` §5.3
 *
 * 공개 판례와 올린 판결문이 **같은 스트림**을 쓴다. 다른 것은 "지금 상태를 어디서 읽느냐"
 * 하나뿐이라 그것만 함수로 받는다 — 라우트 두 개가 각자 폴링 루프를 갖게 되면 한쪽만
 * 닫히지 않거나 한쪽만 간격이 달라진다.
 *
 * **작업 표를 1초마다 들여다본다.** 프로세스 안 이벤트 버스를 두지 않은 이유는 두 가지다.
 * 하나, 생성은 서버 액션이 `after()`로 이어 돌리는 일이라 SSE를 받는 요청과 같은
 * 프로세스라는 보장이 없다. 둘, 진실은 이미 DB에 있다 — 메모리에 사본을 두면 둘이 갈라진다.
 */

/** 얼마나 자주 들여다보나. 단계가 바뀌는 간격(수 초~수십 초)에 비하면 촘촘하다. */
const POLL_MS = 1000;

/**
 * 이만큼 지나면 스스로 닫는다. 5분이다.
 *
 * 브라우저는 SSE가 끊기면 다시 붙으므로 여기서 닫아도 잃는 것이 없다. 반대로 닫지 않으면
 * 탭을 열어 둔 사람마다 열린 연결이 하나씩 쌓인다.
 */
const MAX_MS = 300_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 화면이 읽을 형태. 작업이 없으면 `idle`이다. */
function toEvent(progress: StoreProgress | undefined): string {
  const payload =
    progress === undefined
      ? { status: "idle" }
      : { status: progress.status, stage: progress.stage };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** 상태가 바뀔 때만 한 줄씩 내보내고, 끝난 작업에서는 스스로 닫는다. */
function progressStream(input: {
  readProgress: () => StoreProgress | undefined;
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
        const progress = input.readProgress();
        const event = toEvent(progress);

        // 바뀐 것이 없으면 보내지 않는다. 같은 말을 1초마다 되풀이할 이유가 없다.
        if (event !== last) {
          controller.enqueue(encoder.encode(event));
          last = event;
        }

        // 끝난 작업에는 더 볼 것이 없다. 화면이 새로 그리면 그만이다.
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

/** SSE 응답. 앞단(nginx 등)이 모아 두지 않도록 버퍼링을 끈다. */
function eventStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export { eventStreamResponse, progressStream };
