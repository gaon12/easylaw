/**
 * 개발용 코퍼스 시드.
 *
 * 법제처 키가 없으면 지금까지는 뷰어를 **볼 방법 자체가 없었다** — 코퍼스가 비어 있으니
 * `/case/...`가 전부 "없음"으로 끝난다. 화면 작업이 외부 API 키에 매여 있으면 안 된다.
 *
 * `.dev/CONVENTIONS.md` §10.3 — 시드는 스크립트로 재현 가능하게 만든다. 손으로 넣은
 * 데이터에 의존하는 순간 다른 사람의 기계에서도, CI에서도 재현되지 않는다.
 *
 * **행을 손으로 적지 않고 실제 파서를 태운다.** `parseDetailResponse` → `segmentJudgment`은
 * 운영 경로(`src/server/lookup.ts`)가 지나가는 바로 그 두 단계다. 여기서 좌표를 따로 만들면
 * `charStart`/`charEnd`가 운영과 미묘하게 어긋나고, 그 위에 올릴 근거 하이라이트가
 * 개발 환경에서만 맞는 물건이 된다.
 *
 * 사용: npm run db:seed   (먼저 npm run db:migrate)
 */

import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { CorpusDb } from "@/db/client";
import { saveJudgmentText, upsertJudgment } from "@/db/corpus/repository";
import { corpusSchema, judgment } from "@/db/corpus/schema";
import { parseCaseNumber } from "@/lib/case-number/normalize";
import { parseDetailResponse } from "@/lib/law-api/parse";
import { segmentJudgment } from "@/lib/text/segment";

/**
 * 시드에 넣을 판례 본문 응답들.
 *
 * `src/lib/law-api/fixtures/`는 픽스처 테스트가 이미 쓰고 있는 **실제 법제처 응답**이다.
 * 시드용 사본을 따로 두면 둘이 갈라진다 — 테스트가 보는 응답과 화면이 보는 응답이
 * 달라지는 순간 이 시드는 아무것도 대변하지 못한다. 그래서 같은 파일을 읽는다.
 *
 * 이 픽스처는 파서 테스트용으로 뜬 것이라 **본문이 중간에서 잘려 있다** — 마지막 문단이
 * 문장 도중에 끊기고, 뒤에 붙은 주문이 앞의 주문과 어긋난다. 파서를 시험하는 데는 상관없지만
 * 화면에서는 그대로 보인다. 판례를 읽으러 온 것이 아니라 화면을 보러 온 데이터다.
 *
 * 골든 세트(`.dev/PRODUCT.md` §11)가 갖춰지면 이 배열에 더한다.
 */
const DETAIL_FIXTURES = ["detail.json"] as const;

const FIXTURE_DIR = new URL("../src/lib/law-api/fixtures/", import.meta.url);

/**
 * 코퍼스 DB를 직접 연다.
 *
 * `src/db/client.ts`를 쓰지 않는 이유는 그 모듈이 `server-only`를 import하기 때문이다.
 * `server-only`의 기본 진입점은 서버 컴포넌트 밖에서 불리면 무조건 던진다 — 번들러가
 * 판정해 주는 환경이 아니면 통과할 수 없다. `vitest.config.ts`가 같은 이유로 그 모듈을
 * 빈 파일로 바꿔치기한다. 스크립트에는 그런 바꿔치기 장치가 없으니 연결만 여기서 만든다.
 *
 * 열기 옵션은 `client.ts`와 같아야 한다 — WAL과 외래 키. 다르면 시드가 만든 DB가
 * 서버가 여는 DB와 다른 물건이 된다.
 */
function openCorpus(path: string): { db: CorpusDb; close: () => void } {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { db: drizzle(sqlite, { schema: corpusSchema }), close: () => sqlite.close() };
}

/**
 * 마이그레이션이 돌았는지 본다.
 *
 * 안 돌았으면 drizzle이 뱉는 `no such table: judgment`로 끝나는데, 그 메시지만 보고
 * 무엇을 해야 하는지 알기 어렵다. 여기서 먼저 잡고 다음 명령을 알려 준다.
 */
function assertMigrated(sqlitePath: string): void {
  const probe = new Database(sqlitePath, { readonly: true, fileMustExist: false });
  const table = probe
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'judgment'")
    .get();
  probe.close();
  if (table === undefined) {
    throw new Error(`${sqlitePath}에 스키마가 없습니다. 먼저 npm run db:migrate 를 실행해 주세요.`);
  }
}

function seedDetail(db: CorpusDb, fixtureName: string): string {
  const payload: unknown = JSON.parse(
    readFileSync(fileURLToPath(new URL(fixtureName, FIXTURE_DIR)), "utf8"),
  );
  const detail = parseDetailResponse(payload);

  const parsed = parseCaseNumber(detail.caseNo);
  if (!parsed.ok) {
    // 픽스처의 사건번호를 우리 파서가 못 읽는다면 시드가 아니라 파서가 문제다. 조용히 넘기지 않는다.
    throw new Error(
      `${fixtureName}: 사건번호를 읽지 못했습니다 (${detail.caseNo}) — ${parsed.reason}`,
    );
  }

  const judgmentId = upsertJudgment(db, {
    caseNoCanonical: parsed.canonical,
    caseNoDisplay: detail.caseNo,
    caseName: detail.caseName.length > 0 ? detail.caseName : undefined,
    court: detail.court,
    decidedAt: detail.decidedAt,
    caseType: detail.caseTypeName,
    // 출처를 속이지 않는다. 이 픽스처는 실제로 법제처에서 받아 온 응답이다.
    source: "law_go_kr",
    sourceUrl: `https://www.law.go.kr/DRF/lawService.do?target=prec&ID=${detail.precedentId}&type=HTML`,
  });

  const spans = segmentJudgment(detail.content);
  saveJudgmentText(db, judgmentId, spans);

  return `${parsed.canonical} — ${spans.length}문장 (${detail.court ?? "법원 미상"})`;
}

function main(): void {
  if (process.env.NODE_ENV === "production") {
    // 운영 코퍼스에 픽스처를 섞으면 어느 것이 진짜인지 구분할 방법이 없다.
    throw new Error("시드는 개발용입니다. NODE_ENV=production에서는 돌리지 않습니다.");
  }

  const path = process.env.CORPUS_DB_PATH ?? "data/corpus.sqlite";
  assertMigrated(path);

  const { db, close } = openCorpus(path);
  try {
    const lines = DETAIL_FIXTURES.map((fixture) => seedDetail(db, fixture));
    const total = db.select().from(judgment).all().length;

    process.stdout.write(`코퍼스 시드 완료 (${path})\n`);
    for (const line of lines) {
      process.stdout.write(`  ${line}\n`);
    }
    process.stdout.write(`  판례 ${total}건\n`);
  } finally {
    close();
  }
}

main();
