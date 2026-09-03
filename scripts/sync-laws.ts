/**
 * 법령 판 목록 동기화. `.dev/PRODUCT.md` §6.4
 *
 * **판례는 요청할 때 만들고, 법령은 미리 받아 둔다.** 둘을 다르게 다루는 이유가 있다.
 *
 * - 판례는 아무도 안 볼 것을 미리 만들면 그대로 비용이다(§5.1).
 * - 법령은 반대다. 판결이 인용한 조문을 검증하려면 **그 판결 당시의 법**이 있어야 하는데,
 *   그때 가서 찾으면 "어느 판이 그때 시행 중이었나"를 매번 법제처에 물어야 한다.
 *   목록을 미리 받아 두면 그 질문이 우리 DB의 인덱스 조회 하나로 끝난다.
 *
 * ## 목록은 전부, 본문은 필요한 것만
 *
 * 시행일법령(연혁 포함)은 **168,496건**이다. 목록만 받으면 `display=500`으로 337번
 * 요청하면 끝나고 저장도 작다. 반면 본문까지 전부 받으면 요청이 168,496번이고 10GB를
 * 넘는다 — 우리에게도 법제처에도 무리다.
 *
 * 그래서 이 스크립트는 **목록만** 받는다. 본문은 실제로 인용된 판을 만났을 때 그 판만
 * 받아서 영구 캐시한다(과거 판의 내용은 변하지 않는다, §6.4).
 *
 * 사용: npm run law:sync            (목록 전체)
 *       npm run law:sync -- --pages 5   (앞 5쪽만 — 개발용)
 */

import process from "node:process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { CorpusDb } from "@/db/client";
import { upsertLawVersions } from "@/db/corpus/repository";
import { corpusSchema } from "@/db/corpus/schema";
import { parseListPage } from "@/lib/law-api/envelope";
import { readRejection } from "@/lib/law-api/parse";
import { parseLawSummary } from "@/lib/law-api/parse-law";
import { TARGETS } from "@/lib/law-api/targets";

/** 한 번에 받을 건수. 500까지 실제로 동작하는 것을 확인했다. */
const PAGE_SIZE = 500;

/**
 * 요청 사이 간격.
 *
 * 337번을 쉬지 않고 두드릴 이유가 없다. 이 API는 공공 서비스이고, 우리가 급할 일도 아니다.
 * 전체가 대략 3~4분 걸린다.
 */
const PAUSE_MS = 300;

/** `sqlite3` 연결. `src/db/client.ts`는 `server-only`라 스크립트에서 쓸 수 없다(`seed.ts` 참고). */
function openCorpus(path: string): { db: CorpusDb; close: () => void } {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { db: drizzle(sqlite, { schema: corpusSchema }), close: () => sqlite.close() };
}

function readOc(appDbPath: string): string {
  /*
   * 인증키는 `app` DB의 `setting` 표에 있다(§10.5). 코퍼스와 다른 파일이라 따로 연다.
   * 스크립트가 두 DB를 잇는 것은 애플리케이션 레이어에서 하는 일과 같다 —
   * 표를 조인하지 않고 값만 읽어 온다.
   */
  const app = new Database(appDbPath, { readonly: true });
  const row = app.prepare("SELECT value FROM setting WHERE key = 'law_api_oc'").get() as
    | { value: string }
    | undefined;
  app.close();

  const oc = row?.value.trim();
  if (oc === undefined || oc.length === 0) {
    throw new Error("법제처 인증키가 없습니다. /setup 또는 /admin에서 넣은 뒤 다시 실행해 주세요.");
  }
  return oc;
}

async function fetchPage(oc: string, page: number): Promise<unknown> {
  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", TARGETS.eflaw.target);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`법제처 응답이 ${response.status}입니다 (${page}쪽).`);
  }

  const payload: unknown = JSON.parse(await response.text());
  // 인증 실패도 200으로 온다. 여기서 걸러야 "0건"과 구분된다.
  const rejection = readRejection(payload);
  if (rejection !== undefined) {
    throw new Error(rejection);
  }
  return payload;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `--pages 5` 같은 인자를 읽는다. 없으면 끝까지 돈다. */
function pageLimit(): number {
  const index = process.argv.indexOf("--pages");
  if (index === -1) {
    return Number.POSITIVE_INFINITY;
  }
  const value = Number(process.argv[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
}

async function main(): Promise<void> {
  const corpusPath = process.env.CORPUS_DB_PATH ?? "data/corpus.sqlite";
  const appPath = process.env.APP_DB_PATH ?? "data/app.sqlite";

  const { db, close } = openCorpus(corpusPath);
  try {
    const oc = readOc(appPath);
    const limit = pageLimit();

    let page = 1;
    let seen = 0;
    let added = 0;
    let total = 0;

    while (page <= limit) {
      /*
       * biome-ignore lint/performance/noAwaitInLoops: 순서대로 받아야 한다. 페이지는 앞 쪽의
       * 응답을 봐야 다음 쪽이 있는지 알 수 있고, 무엇보다 요청 사이의 간격(PAUSE_MS)이
       * 이 코드의 목적이다. 병렬로 바꾸면 공공 API를 337번 동시에 두드리게 된다.
       */
      const payload = await fetchPage(oc, page);
      const parsed = parseListPage(payload, TARGETS.eflaw, parseLawSummary);
      total = parsed.total;

      if (parsed.items.length === 0) {
        break;
      }

      added += upsertLawVersions(
        db,
        parsed.items.map((law) => ({
          lawId: law.lawId ?? law.lawSerial,
          mst: law.lawSerial,
          name: law.name,
          shortName: law.shortName,
          kind: law.kind,
          ministry: law.ministry,
          promulgatedAt: law.promulgatedAt,
          effectiveAt: law.effectiveAt,
          historyCode: law.historyCode,
        })),
      );
      seen += parsed.items.length;

      process.stdout.write(`\r  ${page}쪽 · 받음 ${seen}/${total} · 새로 넣음 ${added}   `);
      page += 1;
      await sleep(PAUSE_MS);
    }

    process.stdout.write(`\n법령 판 동기화 완료 (${corpusPath})\n`);
    process.stdout.write(`  받은 목록 ${seen}건 / 법제처 총 ${total}건\n`);
    process.stdout.write(`  새로 넣은 판 ${added}건 (나머지는 이미 있어 건너뜀)\n`);
  } finally {
    close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
