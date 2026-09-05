/**
 * 표준국어대사전을 사전 DB로 가져온다. [F-29]
 *
 * **뜻풀이를 만들지 않고 받아 온다.** 이 스크립트가 있는 이유가 그것이다 — "과태료"의
 * 뜻을 모델이 지어내게 두면 틀려도 그럴듯해서 아무도 못 잡는다. 공식 정의를 받아 두고,
 * 모델에게는 **그 뜻을 이 사건 문맥에 맞게 옮기는 일**만 시킨다.
 *
 * 사용:
 *   npm run dict:sync                 # 내려받아서 가져오기
 *   npm run dict:sync -- --file a.zip # 이미 받아 둔 파일로
 *   npm run dict:sync -- --force      # 같은 판이어도 다시 넣기
 *
 * 국립국어원은 zip 안에 5,000개씩 나눈 JSON 88개를 넣어 준다. **한 번에 한 파일씩**
 * 풀어 넣는다 — 전부 풀면 788MB가 메모리에 올라간다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import Database from "better-sqlite3";
import { parseStdictFile } from "@/lib/dict/stdict";
import { readZip } from "@/lib/zip";

/** 국립국어원 내려받기. `link_key`가 "전체 내려받기(JSON)"를 가리킨다. */
const DOWNLOAD_URL = "https://stdict.korean.go.kr/common/download.do";
const LINK_KEY = "1582758";
const DOWNLOAD_TIMEOUT_MS = 600_000;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : (process.argv[at + 1] ?? "");
}

/**
 * 파일 이름에 적힌 판. `…_JSON_20260806.zip`에서 날짜만 꺼낸다.
 *
 * 받은 날짜만 적어 두면 **같은 판을 또 받았는지** 알 수 없다. 주기적으로 도는 작업이라
 * 그 구분이 곧 "일을 해야 하나"의 답이 된다.
 */
function builtAtFrom(disposition: string | null): string | undefined {
  const match = /(\d{8})\.zip/u.exec(decodeURIComponent(disposition ?? ""));
  return match?.[1];
}

async function download(): Promise<{ body: Buffer; builtAt: string | undefined }> {
  out(`내려받는 중… ${DOWNLOAD_URL}`);
  const response = await fetch(DOWNLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ link_key: LINK_KEY, pageUnit: "10", pageIndex: "1" }).toString(),
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`내려받기 실패: HTTP ${response.status}`);
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    builtAt: builtAtFrom(response.headers.get("content-disposition")),
  };
}

function openDict(): Database.Database {
  const path = process.env.DICT_DB_PATH ?? "data/dict.sqlite";
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}

/** 이미 이 판이 들어 있나. `--force`면 묻지 않는다. */
function alreadyImported(db: Database.Database, builtAt: string | undefined): boolean {
  if (builtAt === undefined || flag("force") !== undefined) {
    return false;
  }
  const row = db
    .prepare("select built_at as builtAt, entries from dict_source where id = 'stdict'")
    .get() as { builtAt: string | null; entries: number } | undefined;
  return row?.builtAt === builtAt && row.entries > 0;
}

function importAll(db: Database.Database, zip: Buffer): number {
  const insert = db.prepare(
    `insert into dict_entry
       (id, word, word_raw, hanja, pos, category, sense_type, definition, sense_order)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set
       word = excluded.word, word_raw = excluded.word_raw, hanja = excluded.hanja,
       pos = excluded.pos, category = excluded.category, sense_type = excluded.sense_type,
       definition = excluded.definition, sense_order = excluded.sense_order`,
  );

  const files = readZip(zip).filter((entry) => entry.name.endsWith(".json"));
  out(`JSON ${files.length}개`);

  let total = 0;
  for (const [index, file] of files.entries()) {
    const entries = parseStdictFile(file.read().toString("utf8"));
    /* 파일 하나가 한 트랜잭션이다. 88개를 한 트랜잭션에 묶으면 중간에 끊길 때 전부 잃는다. */
    db.transaction(() => {
      for (const entry of entries) {
        insert.run(
          entry.id,
          entry.word,
          entry.wordRaw,
          entry.hanja ?? null,
          entry.pos ?? null,
          entry.category ?? null,
          entry.senseType ?? null,
          entry.definition,
          entry.senseOrder,
        );
      }
    })();
    total += entries.length;
    out(`  [${index + 1}/${files.length}] ${file.name} — 뜻 ${entries.length}개 (누적 ${total})`);
  }

  return total;
}

async function main(): Promise<void> {
  const local = flag("file");
  const source =
    local === undefined || local.length === 0
      ? await download()
      : { body: readFileSync(local), builtAt: builtAtFrom(local) };

  const keep = flag("save");
  if (keep !== undefined && keep.length > 0) {
    writeFileSync(keep, source.body);
    out(`받은 파일을 ${keep}에 두었습니다.`);
  }

  const db = openDict();
  if (alreadyImported(db, source.builtAt)) {
    out(`이미 ${source.builtAt} 판이 들어 있습니다. 다시 넣으려면 --force.`);
    db.close();
    return;
  }

  const started = Date.now();
  const total = importAll(db, source.body);

  db.prepare(
    `insert into dict_source (id, label, built_at, fetched_at, entries)
     values ('stdict', '표준국어대사전', ?, ?, ?)
     on conflict(id) do update set
       built_at = excluded.built_at, fetched_at = excluded.fetched_at, entries = excluded.entries`,
  ).run(source.builtAt ?? null, Date.now(), total);

  const legal = db
    .prepare("select count(*) as n from dict_entry where category = '법률'")
    .get() as { n: number };

  out("");
  out(
    `끝. 뜻 ${total.toLocaleString("ko-KR")}개 (${((Date.now() - started) / 1000).toFixed(1)}초)`,
  );
  out(`그중 법률 분야 ${legal.n.toLocaleString("ko-KR")}개`);
  db.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
