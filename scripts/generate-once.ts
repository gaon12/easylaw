/**
 * 판례 하나를 골라 설명을 **실제로 한 번 만들어 본다**. `PROGRESS.md` 1순위
 *
 * 화면으로 하면 눌러 놓고 기다리다 실패하면 "설명을 만들지 못했어요" 한 줄만 남는다.
 * 여기서는 어느 단계에서 무엇 때문에 멈췄는지 그대로 나온다.
 *
 * **설정을 읽는다.** AI 연결은 `/setup`·`/admin`에서 넣은 값(DB의 `setting`)을 그대로
 * 쓴다 — 스크립트 전용 통로를 따로 두면 화면에서 되는 것과 여기서 되는 것이 갈라진다.
 * 키가 없으면 `npm run llm:mock`으로 가짜 서버를 띄우고 그 주소를 넣으면 된다.
 *
 * 사용:
 *   npm run gen:try -- 2023다287663 L2
 *   npm run gen:try -- 2023다287663 L2 --force   # 이미 만든 것이 있어도 다시 만든다
 *
 * `--conditions=react-server`로 도는 이유는 `server-only`가 붙은 모듈을 부르기 때문이다.
 */

import process from "node:process";
import { and, eq } from "drizzle-orm";
import { corpusDb } from "@/db/client";
import {
  findJudgmentByCaseNo,
  findRendition,
  type Level,
  listSentences,
  listSpans,
  listStructureNodes,
} from "@/db/corpus/repository";
import { generationJob, rendition } from "@/db/corpus/schema";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { generateRendition, generationBudget, PIPELINE_VERSION } from "@/server/generate";
import { llmConfig } from "@/server/settings";

const LEVELS: readonly string[] = ["L1", "L2", "L3", "L4"];

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [rawCaseNo, rawLevel, ...flags] = process.argv.slice(2);
  if (rawCaseNo === undefined || rawLevel === undefined || !LEVELS.includes(rawLevel)) {
    fail("사용법: npm run gen:try -- <사건번호> <L1|L2|L3|L4> [--force]");
  }

  const canonical = toCanonicalCaseNumber(rawCaseNo);
  if (canonical === undefined) {
    fail(`사건번호를 알아보지 못했습니다: ${rawCaseNo}`);
  }

  const level = rawLevel as Level;
  const db = corpusDb();
  const judgment = findJudgmentByCaseNo(db, canonical);
  if (judgment === undefined) {
    fail(`코퍼스에 없는 사건입니다: ${canonical}. 먼저 화면에서 한 번 열거나 npm run db:seed.`);
  }

  const config = llmConfig();
  if (config === undefined) {
    fail("AI 연결이 설정되지 않았습니다. /setup 또는 /admin에서 넣거나 npm run llm:mock을 쓰세요.");
  }

  out(`사건    ${judgment.caseNoDisplay} (${judgment.id})`);
  out(`레벨    ${level}`);
  out(`모델    ${config.model} @ ${config.baseUrl}`);
  out(`프롬프트 ${PIPELINE_VERSION}`);
  out(`원문    ${listSpans(db, judgment.id).length}문장`);
  out(`오늘 몫  ${JSON.stringify(generationBudget())}`);

  /*
   * 다시 만들어 보려면 앞선 작업과 변환본을 치워야 한다. 선점 표에 `done`이 남아 있으면
   * 파이프라인은 "이미 있다"며 곧바로 돌아온다 — 그것이 정상 동작이다(§5.3).
   */
  if (flags.includes("--force")) {
    /*
     * **이 사건, 이 레벨만** 지운다. 표를 통째로 비우면 남의 개발 DB에서 다른 판례의
     * 변환본까지 날아간다 — 되돌릴 수 없는 일을 편의로 하지 않는다.
     */
    db.delete(generationJob)
      .where(and(eq(generationJob.judgmentId, judgment.id), eq(generationJob.level, level)))
      .run();
    db.delete(rendition)
      .where(and(eq(rendition.judgmentId, judgment.id), eq(rendition.level, level)))
      .run();
    out(`--force  ${judgment.caseNoDisplay} ${level}의 기존 작업·변환본을 지웠습니다.`);
  }

  const startedAt = Date.now();
  const result = await generateRendition(judgment.id, level);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  out("");
  out(`결과    ${JSON.stringify(result)}  (${seconds}초)`);
  out(`구조    ${listStructureNodes(db, judgment.id).length}개 노드`);

  const made = findRendition(db, judgment.id, level, PIPELINE_VERSION);
  if (made === undefined) {
    out("문장    (저장된 변환본 없음)");
    process.exit(result.kind === "done" ? 0 : 1);
  }

  const sentences = listSentences(db, made.id);
  out(`문장    ${sentences.length}개`);
  out("");
  for (const sentence of sentences) {
    const mark = sentence.role === "heading" ? "##" : `- [${sentence.confidence}]`;
    out(`${mark} ${sentence.text}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
});
