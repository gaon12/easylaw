import "server-only";
import process from "node:process";
import { and, eq } from "drizzle-orm";
import { corpusDb } from "@/db/client";
import {
  findJudgmentByCaseNo,
  type Level,
  listStructureNodes,
  type SentenceInput,
  saveRendition,
} from "@/db/corpus/repository";
import { judgment as judgmentTable, rendition } from "@/db/corpus/schema";
import type { GlossEvidence } from "@/lib/gloss-evidence";
import { PROMPT_VERSION as EXTRACT_VERSION } from "@/lib/pipeline/extract-prompt";
import { RENDER_PROMPT_VERSION } from "@/lib/pipeline/render-prompt";
import { hasBlockingIssue, lintRendition } from "@/lib/rendition/lint";

const CASE_NO = "2023다287663";
const PIPELINE_VERSION = `${EXTRACT_VERSION}+${RENDER_PROMPT_VERSION}`;

interface EditorialSentence {
  readonly role: "heading" | "body" | "gloss";
  readonly text: string;
  /** 추출 구조 노드의 orderIdx. 제목에는 쓰지 않는다. */
  readonly nodeOrder?: number;
  /** 사전 풀이에만 붙는 출처. */
  readonly source?: string;
  readonly glossEvidence?: GlossEvidence;
}

const GLOSS_EVIDENCE = {
  변제: {
    definitionSource: "stdict",
    definitionId: "431758-171340",
    term: "변제",
    definition: "남에게 진 빚을 갚음.",
    sourceLabel: "표준국어대사전",
  },
  원고: {
    definitionSource: "stdict",
    definitionId: "253979-241018",
    term: "원고",
    definition: "법원에 민사 소송을 제기한 사람.",
    sourceLabel: "표준국어대사전",
  },
  피고: {
    definitionSource: "stdict",
    definitionId: "362338-27816",
    term: "피고",
    definition: "민사 소송에서, 소송을 당한 측의 당사자.",
    sourceLabel: "표준국어대사전",
  },
  파기환송: {
    definitionSource: "stdict",
    definitionId: "499534-308830",
    term: "파기환송",
    definition:
      "상소심 법원이 종국 판결에서 원심 판결을 파기한 경우에 사건을 다시 심판하도록 원심 법원으로 돌려보내는 일.",
    sourceLabel: "표준국어대사전",
  },
} as const satisfies Readonly<Record<string, GlossEvidence>>;

const CONTENT: Readonly<Record<Level, readonly EditorialSentence[]>> = {
  L1: [
    { role: "heading", text: "판결 요지" },
    {
      role: "body",
      text: "회생계획이 담보목적물 처분대금으로 변제기가 도래한 회생담보권만 변제하도록 정했다면, 그 계획에 따른 변제는 유효하다고 보아야 한다.",
      nodeOrder: 15,
    },
    {
      role: "body",
      text: "대법원은 원심판결을 파기하고 사건을 서울고등법원에 환송했다.",
      nodeOrder: 0,
    },
    { role: "heading", text: "사실관계" },
    {
      role: "body",
      text: "채무자 회사에 회생절차가 개시되었고, 관계인집회에서 가결된 회생계획이 2020년 7월 22일 인가되었다.",
      nodeOrder: 6,
    },
    {
      role: "body",
      text: "관리인은 법원의 허가를 받아 담보 부동산 등을 매각한 뒤, 처분대금에서 보증금과 제세공과금 등을 뺀 금액을 변제재원으로 삼았다.",
      nodeOrder: 9,
    },
    {
      role: "body",
      text: "관리인은 1차 연도 미변제 원리금과 연체이자 등을 기준으로 원고와 피고에게 각각 변제했다.",
      nodeOrder: 9,
    },
    { role: "heading", text: "쟁점과 당사자 주장" },
    {
      role: "body",
      text: "처분대금을 변제기가 도래한 부분에만 써야 하는지, 전체 회생담보권액을 기준으로 담보권 순위에 따라 써야 하는지가 쟁점이었다.",
      nodeOrder: 10,
    },
    {
      role: "body",
      text: "원고는 전체 회생담보권액을 기준으로 순위에 따라 변제해야 하므로 피고에 대한 변제가 무효라고 주장했다.",
      nodeOrder: 11,
    },
    { role: "heading", text: "법원의 판단" },
    {
      role: "body",
      text: "회생계획은 문언을 합리적으로 해석하고, 불명확하면 작성 경위와 이해관계인의 의사 등을 함께 고려해야 한다.",
      nodeOrder: 13,
    },
    {
      role: "body",
      text: "회생계획 인가결정으로 담보채권의 액수와 변제기가 실체적으로 변경되었으므로, 채무자 회사는 처분대금으로 1차 연도 변제분을 지급할 의무가 있었다.",
      nodeOrder: 16,
    },
    {
      role: "body",
      text: "자금수지계획표도 처분대금을 1차 연도 변제분과 임대차보증금에 사용하도록 정하고 있었다.",
      nodeOrder: 17,
    },
    {
      role: "body",
      text: "원고와 피고는 회생계획안 결의에 참여했고, 두 채권자 사이에 계획과 다른 방식으로 권리를 행사하기로 한 별도 약정도 없었다.",
      nodeOrder: 18,
    },
    {
      role: "body",
      text: "이 회생계획이 선순위 담보권자의 권리를 침해하거나 청산가치보장의 원칙을 위반했다고 볼 수도 없었다.",
      nodeOrder: 19,
    },
    { role: "heading", text: "결론과 의미" },
    {
      role: "body",
      text: "원심은 회생계획의 해석과 권리변경의 효력을 오해해 판결에 영향을 미친 잘못이 있었다.",
      nodeOrder: 20,
    },
    {
      role: "body",
      text: "따라서 사건은 서울고등법원에서 다시 심리된다.",
      nodeOrder: 0,
    },
  ],
  L2: [
    { role: "heading", text: "먼저 보는 결론" },
    {
      role: "body",
      text: "대법원은 서울고등법원의 판결을 파기하고 사건을 다시 심리하도록 돌려보냈습니다.",
      nodeOrder: 0,
    },
    {
      role: "body",
      text: "부동산을 판 돈은 회생계획에서 지급일이 된 몫에 사용하는 것이 맞다고 보았습니다.",
      nodeOrder: 15,
    },
    { role: "heading", text: "무슨 일이 있었나요" },
    {
      role: "body",
      text: "회생 중인 회사는 법원의 허가를 받아 담보 부동산과 공장기계를 팔았습니다.",
      nodeOrder: 8,
    },
    {
      role: "body",
      text: "관리인은 남은 매각대금으로 첫해에 지급할 두 채권자의 돈을 나누어 지급했습니다.",
      nodeOrder: 9,
    },
    { role: "heading", text: "서로 무엇을 주장했나요" },
    {
      role: "body",
      text: "원고는 담보권 순위를 먼저 적용해야 하므로 피고가 받은 돈은 돌려줘야 한다고 주장했습니다.",
      nodeOrder: 11,
    },
    {
      role: "body",
      text: "서울고등법원은 이 주장을 받아들여 피고에 대한 지급이 무효라고 판단했습니다.",
      nodeOrder: 12,
    },
    { role: "heading", text: "법원은 왜 이렇게 판단했나요" },
    {
      role: "body",
      text: "인가된 회생계획은 담보채권의 금액과 지급 시기를 실제로 바꿉니다.",
      nodeOrder: 14,
    },
    {
      role: "body",
      text: "이 사건 계획표에는 매각대금을 첫해 지급분과 보증금에 쓰도록 적혀 있었습니다.",
      nodeOrder: 17,
    },
    {
      role: "body",
      text: "두 채권자는 회생계획의 결의에 참여했고, 서로 다른 약정을 따로 맺지도 않았습니다.",
      nodeOrder: 18,
    },
    { role: "heading", text: "나에게 어떤 영향이 있나요" },
    {
      role: "body",
      text: "피고에 대한 지급을 무효라고 본 앞선 판단은 그대로 유지되지 않습니다.",
      nodeOrder: 20,
    },
    { role: "heading", text: "다음 절차" },
    {
      role: "body",
      text: "서울고등법원이 대법원의 판단에 따라 이 사건을 다시 심리합니다.",
      nodeOrder: 0,
    },
  ],
  L3: [
    { role: "heading", text: "무슨 일이 있었나요" },
    {
      role: "body",
      text: "한 회사가 법원의 도움을 받아 회생하고 있었어요.",
      nodeOrder: 5,
    },
    {
      role: "body",
      text: "회사는 법원의 허가를 받고 공장과 건물을 팔았어요.",
      nodeOrder: 8,
    },
    {
      role: "body",
      text: "관리인은 그 돈을 두 채권자에게 나누어 주었어요.",
      nodeOrder: 9,
    },
    {
      role: "body",
      text: "그해에 주기로 한 돈만 계산했어요.",
      nodeOrder: 15,
    },
    { role: "heading", text: "사람들은 무엇을 말했나요" },
    {
      role: "body",
      text: "한 채권자는 담보권 순서를 먼저 따라야 한다고 했어요.",
      nodeOrder: 11,
    },
    {
      role: "body",
      text: "앞 법원은 다른 채권자에게 준 돈이 잘못이라고 보았어요.",
      nodeOrder: 12,
    },
    { role: "heading", text: "법원은 무엇을 살펴봤나요" },
    {
      role: "body",
      text: "대법원은 인가된 회생계획의 내용부터 살펴봤어요.",
      nodeOrder: 14,
    },
    {
      role: "body",
      text: "계획표에는 그해 줄 돈과 보증금이 적혀 있었어요.",
      nodeOrder: 17,
    },
    {
      role: "body",
      text: "두 채권자가 그 계획에 동의했는지도 살펴봤어요.",
      nodeOrder: 18,
    },
    { role: "heading", text: "법원은 왜 그렇게 정했나요" },
    {
      role: "body",
      text: "회생계획이 채권의 금액과 돈 주는 때를 바꾸기 때문이에요.",
      nodeOrder: 16,
    },
    {
      role: "body",
      text: "그래서 그해 줄 돈만 준 것은 계획에 맞았어요.",
      nodeOrder: 15,
    },
    { role: "heading", text: "다음에는 어떻게 되나요" },
    {
      role: "body",
      text: "서울고등법원이 이 사건을 다시 심리해요.",
      nodeOrder: 0,
    },
  ],
  L4: [
    { role: "heading", text: "먼저 알아둘 것" },
    {
      role: "gloss",
      text: '"변제"는 빚을 갚는 일이에요.',
      source: "표준국어대사전",
      glossEvidence: GLOSS_EVIDENCE.변제,
    },
    {
      role: "gloss",
      text: '"원고"는 재판을 요청한 쪽이에요.',
      source: "표준국어대사전",
      glossEvidence: GLOSS_EVIDENCE.원고,
    },
    {
      role: "gloss",
      text: '"피고"는 요청을 받은 쪽이에요.',
      source: "표준국어대사전",
      glossEvidence: GLOSS_EVIDENCE.피고,
    },
    { role: "body", text: "법원이 빚 갚는 계획을 인정했어요.", nodeOrder: 6 },
    { role: "body", text: "회사는 정해진 때에 돈을 갚아야 해요.", nodeOrder: 14 },
    { role: "heading", text: "무슨 일이 있었나요" },
    { role: "body", text: "회사는 공장과 건물을 팔았어요.", nodeOrder: 8 },
    { role: "body", text: "법원이 회사를 맡긴 사람이 돈을 나눴어요.", nodeOrder: 9 },
    { role: "body", text: "원고와 피고가 돈을 받았어요.", nodeOrder: 9 },
    { role: "body", text: "2020년에 줄 돈만 주었어요.", nodeOrder: 15 },
    { role: "heading", text: "법원은 어떻게 정했나요" },
    { role: "body", text: "서울고등법원은 돈을 잘못 줬다고 봤어요.", nodeOrder: 12 },
    { role: "body", text: "대법원은 돈을 준 일이 맞다고 봤어요.", nodeOrder: 15 },
    { role: "heading", text: "왜 그런가요" },
    { role: "body", text: "빚 갚는 계획에 날짜가 있었어요.", nodeOrder: 17 },
    { role: "body", text: "회사는 2020년 몫만 줘야 했어요.", nodeOrder: 16 },
    { role: "body", text: "원고와 피고도 계획에 동의했어요.", nodeOrder: 18 },
    { role: "heading", text: "그래서 어떻게 되나요" },
    { role: "body", text: "대법원은 서울고등법원 판결을 없앴어요.", nodeOrder: 0 },
    { role: "body", text: "서울고등법원이 다시 심리해요.", nodeOrder: 0 },
    {
      role: "gloss",
      text: '"파기환송"은 판결을 없애요.',
      source: "표준국어대사전",
      glossEvidence: GLOSS_EVIDENCE.파기환송,
    },
    {
      role: "gloss",
      text: '"파기환송"은 사건을 원래 법원에 보내요.',
      source: "표준국어대사전",
      glossEvidence: GLOSS_EVIDENCE.파기환송,
    },
    { role: "heading", text: "이해 확인" },
    { role: "body", text: "회사는 무엇을 팔았나요?", nodeOrder: 8 },
    { role: "body", text: "어느 법원이 다시 심리하나요?", nodeOrder: 0 },
  ],
};

const db = corpusDb();
const judgment = findJudgmentByCaseNo(db, CASE_NO);
if (judgment === undefined) {
  throw new Error(`${CASE_NO} 판결문을 먼저 받아야 합니다.`);
}

const nodes = listStructureNodes(db, judgment.id, EXTRACT_VERSION);
if (nodes.length === 0) {
  throw new Error("근거가 연결된 구조 분석이 없습니다.");
}
const nodeByOrder = new Map(nodes.map((node) => [node.orderIdx, node]));

db.update(judgmentTable)
  .set({ outcome: "reversed_and_remanded" })
  .where(eq(judgmentTable.id, judgment.id))
  .run();

const results: { level: Level; renditionId: string; sentences: number }[] = [];
for (const level of ["L1", "L2", "L3", "L4"] as const) {
  const editorial = CONTENT[level];
  const issues = lintRendition(
    level,
    editorial.map((sentence, orderIdx) => ({ ...sentence, orderIdx })),
  );
  if (hasBlockingIssue(issues) || issues.length > 0) {
    throw new Error(`${level} 작성 규칙 위반: ${JSON.stringify(issues)}`);
  }

  const sentences: SentenceInput[] = editorial.map((sentence, orderIdx) => {
    const node = sentence.nodeOrder === undefined ? undefined : nodeByOrder.get(sentence.nodeOrder);
    if (sentence.nodeOrder !== undefined && node === undefined) {
      throw new Error(`${level} ${orderIdx}번 문장의 구조 노드 ${sentence.nodeOrder}가 없습니다.`);
    }
    return {
      orderIdx,
      role: sentence.role,
      text: sentence.text,
      structureNodeId: node?.id ?? null,
      source: sentence.source ?? null,
      glossEvidence: sentence.glossEvidence ?? null,
      confidence: "grounded",
    };
  });

  db.delete(rendition)
    .where(
      and(
        eq(rendition.judgmentId, judgment.id),
        eq(rendition.level, level),
        eq(rendition.promptVersion, PIPELINE_VERSION),
      ),
    )
    .run();

  const renditionId = saveRendition(db, {
    judgmentId: judgment.id,
    level,
    model: "codex-editorial-2026-09-07",
    promptVersion: PIPELINE_VERSION,
    reviewState: "approved",
    sentences,
  });
  results.push({ level, renditionId, sentences: sentences.length });
}

process.stdout.write(
  `${JSON.stringify({ caseNo: CASE_NO, pipelineVersion: PIPELINE_VERSION, results }, null, 2)}\n`,
);
