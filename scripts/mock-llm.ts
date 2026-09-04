/**
 * 가짜 AI 서버. OpenAI 호환 `chat/completions` 하나만 답한다.
 *
 * **무엇을 위한 것인가.** `PROGRESS.md`의 1순위는 "생성을 한 번 실제로 돌려 보기"인데
 * 그것이 살아 있는 API 키에 막혀 있었다. 그런데 키가 없어도 확인할 수 있는 것이 있다 —
 * **우리 배관**이다. 추출 스키마가 렌더 입력과 맞물리는지, 렌더 결과가 우리 린터를
 * 통과하는지, 함의 검사 번호가 문장과 다시 이어지는지, 저장까지 가는지.
 *
 * **이것이 확인해 주지 않는 것**도 분명히 해 둔다. 진짜 모델이 우리 지시를 따르는지는
 * 여기서 알 수 없다. 이 서버는 지시를 읽지 않고 규격에 맞는 답을 지어낸다. 프롬프트의
 * 품질은 실제 모델로만 확인된다.
 *
 * 그래서 이것은 테스트가 아니다(`CONVENTIONS.md` §8은 테스트에서의 실호출을 금한다).
 * 사람이 손으로 돌려 보는 **개발용 하네스**다.
 *
 * 사용:
 *   npm run llm:mock            # 기본 3999 포트
 *   PORT=4100 npm run llm:mock
 *
 * 그리고 `/admin`(또는 `/setup`)의 AI 설정에 이렇게 넣는다.
 *   주소  http://127.0.0.1:3999/v1
 *   키    아무 값이나 (검사하지 않는다)
 *   모델  mock
 */

import { createServer } from "node:http";
import process from "node:process";

const DEFAULT_PORT = 3999;

/** `[p0.s3] 문장` — 추출 단계가 주는 원문 줄. */
const SPAN_LINE = /^\[(p\d+\.s\d+)\]\s*(.+)$/u;
/** `[n0] holding: 내용` — 렌더 단계가 주는 구조 줄. */
const NODE_LINE = /^\[(n\d+)\]\s*([a-z_]+):\s*(.*)$/u;
/** `### 3` — 함의 검사가 주는 항목 번호. */
const CLAIM_HEADING = /^###\s*(\d+)$/u;

interface ChatMessage {
  readonly role: string;
  readonly content: string;
}

interface SpanLine {
  readonly label: string;
  readonly text: string;
}

interface NodeLine {
  readonly label: string;
  readonly kind: string;
  readonly text: string;
}

/**
 * 어느 단계가 부르고 있나.
 *
 * 울타리 이름은 요청마다 난수라 표지로 쓸 수 없다(`llm/client.ts`). 대신 그 울타리에
 * 붙는 `이름="…"`이 단계마다 다르고 고정이다.
 */
function stageOf(messages: readonly ChatMessage[]): "extract" | "render" | "entail" | "unknown" {
  const body = messages.map((message) => message.content).join("\n");
  if (body.includes('이름="판결문 구조"')) {
    return "render";
  }
  if (body.includes('이름="확인할 문장"')) {
    return "entail";
  }
  if (body.includes('이름="판결문"')) {
    return "extract";
  }
  return "unknown";
}

/** 지시문에서 이번 요청의 레벨을 알아낸다. 문장 길이 상한이 레벨마다 다르다. */
function levelOf(messages: readonly ChatMessage[]): "L1" | "L2" | "L3" | "L4" {
  // `render-prompt.ts`의 `LEVEL_BRIEF.reader`를 표지로 쓴다. 레벨을 따로 보내지 않기 때문이다.
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  if (system.includes("발달장애인")) {
    return "L4";
  }
  if (system.includes("초등학교 고학년")) {
    return "L3";
  }
  if (system.includes("변호사")) {
    return "L1";
  }
  return "L2";
}

function documentText(messages: readonly ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
}

function spanLines(document: string): SpanLine[] {
  return document
    .split("\n")
    .map((line) => SPAN_LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ label: String(match[1]), text: String(match[2]) }));
}

/**
 * 추출. 원문 줄에 있는 span 이름을 **그대로** 가져다 쓴다.
 *
 * 없는 이름을 지어내지 않는다. 지어내면 저장소가 그 노드를 버리게 되어 있는데,
 * 그러면 이 하네스가 보려는 정상 경로가 아니라 방어 경로를 도는 셈이 된다.
 */
function extraction(document: string): unknown {
  const spans = spanLines(document);
  const first = spans[0];
  if (first === undefined) {
    return { nodes: [] };
  }

  const middle = spans[Math.floor(spans.length / 2)] ?? first;
  const last = spans.at(-1) ?? first;

  return {
    nodes: [
      {
        kind: "fact_event",
        text: `${first.text.slice(0, 40)} (가짜)`,
        source_spans: [first.label],
      },
      { kind: "issue", text: "이 사건에서 다투는 점 (가짜)", source_spans: [middle.label] },
      { kind: "holding", text: "법원의 판단 (가짜)", source_spans: [middle.label] },
      { kind: "conclusion", text: "최종 결론 (가짜)", source_spans: [last.label] },
    ],
  };
}

/** 레벨별로 반드시 있어야 하는 제목. `rendition/lint.ts`의 `requiredSections`를 포함한다. */
const REQUIRED_HEADINGS: Readonly<Record<string, readonly string[]>> = {
  L1: ["사건의 구조"],
  L2: ["무슨 일이 있었나요", "다음 절차"],
  L3: ["무슨 일이 있었나요", "다음에는 어떻게 되나요"],
  L4: ["그래서 어떻게 되나요", "이해 확인"],
};

/** 레벨별 본문 길이 상한(공백 제외). 린터와 같은 값이다. */
const MAX_BODY: Readonly<Record<string, number>> = { L1: 200, L2: 60, L3: 35, L4: 20 };

const TRIM_MARGIN = 10;

/**
 * 레벨별 한 문장. **린터를 통과하도록 지어낸다** — 단정 표현과 비유를 쓰지 않고,
 * L4는 3인칭 호칭 없이 "당신"만 쓴다.
 */
function bodyFor(level: string, kind: string, text: string): string {
  if (level === "L4") {
    return kind === "conclusion" ? "당신은 확인해 보세요." : "법원이 이렇게 봤어요.";
  }
  if (level === "L3") {
    return "무슨 일이 있었는지 쉽게 옮긴 문장이에요.";
  }

  const limit = MAX_BODY[level] ?? 60;
  const body = `${text} — 가짜 AI가 만든 문장이에요.`;
  return body.replace(/\s/gu, "").length > limit ? `${body.slice(0, limit - TRIM_MARGIN)}…` : body;
}

function nodeLines(document: string): NodeLine[] {
  return document
    .split("\n")
    .map((line) => NODE_LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      label: String(match[1]),
      kind: String(match[2]),
      text: String(match[3]),
    }));
}

function rendition(document: string, level: string): unknown {
  const nodes = nodeLines(document);
  const headings = REQUIRED_HEADINGS[level] ?? [];
  const lastLabel = nodes.at(-1)?.label ?? "n0";
  const sentences: { role: string; text: string; from?: string }[] = [
    { role: "heading", text: headings[0] ?? "설명" },
  ];

  for (const node of nodes) {
    sentences.push({ role: "body", text: bodyFor(level, node.kind, node.text), from: node.label });
  }

  for (const heading of headings.slice(1)) {
    sentences.push({ role: "heading", text: heading });
    sentences.push({
      role: "body",
      text: bodyFor(level, "conclusion", "다음 절차"),
      from: lastLabel,
    });
  }

  return { sentences };
}

/** 함의 검사. 물어본 항목마다 `entailed`로 답한다 — 배관을 보는 것이 목적이다. */
function entailment(document: string): unknown {
  const indexes = document
    .split("\n")
    .map((line) => CLAIM_HEADING.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));

  return {
    checks: (indexes.length > 0 ? indexes : [0]).map((index) => ({
      index,
      verdict: "entailed",
      reason: "가짜 서버가 통과시켰습니다.",
    })),
  };
}

function answer(messages: readonly ChatMessage[]): unknown {
  const document = documentText(messages);
  const stage = stageOf(messages);

  if (stage === "extract") {
    return extraction(document);
  }
  if (stage === "render") {
    return rendition(document, levelOf(messages));
  }
  if (stage === "entail") {
    return entailment(document);
  }
  return { error: "이 하네스가 모르는 단계입니다." };
}

const NOT_FOUND = 404;
const OK = 200;

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url?.includes("/chat/completions") !== true) {
    response.writeHead(NOT_FOUND, { "content-type": "text/plain; charset=utf-8" });
    response.end("이 서버는 POST /v1/chat/completions만 답합니다.");
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    let content = "{}";
    let stage = "unknown";
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        messages?: ChatMessage[];
      };
      const messages = body.messages ?? [];
      stage = stageOf(messages);
      content = JSON.stringify(answer(messages));
    } catch (error) {
      content = JSON.stringify({ error: error instanceof Error ? error.message : "알 수 없음" });
    }

    process.stdout.write(`  ← ${stage} (${content.length}자)\n`);
    response.writeHead(OK, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        id: "mock",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      }),
    );
  });
});

const port = Number(process.env.PORT ?? DEFAULT_PORT);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`가짜 AI 서버: http://127.0.0.1:${port}/v1  (모델 이름은 아무거나)\n`);
});
