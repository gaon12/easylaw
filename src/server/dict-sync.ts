import "server-only";
import { eq, sql } from "drizzle-orm";
import { dictDb } from "@/db/client";
import { dictEntry, dictSource } from "@/db/dict/schema";
import { parseStdictFile, type StdictEntry } from "@/lib/dict/stdict";
import { readZip } from "@/lib/zip";

/**
 * 표준국어대사전을 받아 사전 DB에 넣는다. [F-29]
 *
 * 스크립트(`scripts/sync-dict.ts`)와 예약 작업(`dict-schedule.ts`)이 **같은 함수**를 부른다.
 * 두 곳에 같은 절차를 두면 언젠가 한쪽만 고쳐진다.
 *
 * ## 임시 파일을 만들지 않는다
 *
 * 받은 zip은 메모리에 두고 그 안에서 JSON을 하나씩 푼다. 디스크에 풀지 않으므로 지울
 * 것도 없고, **압축 파일 안의 경로가 디스크에 닿지 않는다** — zip에 `../../etc/passwd`
 * 같은 이름이 들어 있어도 우리가 파일을 만들지 않으니 나갈 곳이 없다.
 *
 * ## 받은 것을 그대로 믿지 않는다
 *
 * 정부 공개 자료이고 https로 받지만, 크기와 내용은 확인한다. 이 함수는 서버가 스스로
 * 주기적으로 부르므로 **아무도 보고 있지 않을 때** 돈다.
 */

/** 트랜잭션 안의 db 손잡이. 드리즐이 넘겨 주는 것과 같은 타입이다. */
type DictTx = Parameters<Parameters<ReturnType<typeof dictDb>["transaction"]>[0]>[0];

const DOWNLOAD_URL = "https://stdict.korean.go.kr/common/download.do";
const LINK_KEY = "1582758";
const DOWNLOAD_TIMEOUT_MS = 600_000;

/**
 * 받아들일 최대 크기. 2026-08 판이 68MB다.
 *
 * 상한을 두는 이유는 자료가 커져서가 아니라, **주소가 가리키는 곳이 바뀌었을 때** 서버가
 * 메모리를 다 쓰고 죽는 일을 막기 위해서다. 늘어나면 이 값을 올리고 커밋한다.
 */
const MEGABYTE = 1_048_576;
const MAX_DOWNLOAD_MEGABYTES = 300;
const MAX_DOWNLOAD_BYTES = MAX_DOWNLOAD_MEGABYTES * MEGABYTE;

/** 이만큼도 안 되면 자료가 아니라 오류 페이지다. */
const MIN_DOWNLOAD_BYTES = MEGABYTE;

interface SyncResult {
  readonly kind: "done" | "skipped" | "failed";
  /** 넣은 뜻의 수. 건너뛰었으면 이미 들어 있던 수. */
  readonly entries: number;
  readonly builtAt: string | undefined;
  /** 사람이 읽을 한 줄. 관리 화면과 스크립트가 그대로 보여 준다. */
  readonly detail: string;
}

/** `…_JSON_20260806.zip`에서 판을 꺼낸다. */
const BUILT_AT = /(\d{8})\.zip/u;

function builtAtFrom(name: string | null): string | undefined {
  return BUILT_AT.exec(decodeURIComponent(name ?? ""))?.[1];
}

async function download(signal?: AbortSignal): Promise<{ body: Buffer; builtAt?: string }> {
  const response = await fetch(DOWNLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ link_key: LINK_KEY, pageUnit: "10", pageIndex: "1" }).toString(),
    signal: signal ?? AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`내려받기 실패: HTTP ${response.status}`);
  }

  /* 헤더를 먼저 본다. 다 받고 나서 크기를 재면 이미 메모리를 쓴 뒤다. */
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw new Error(`받으려는 자료가 너무 큽니다(${declared}바이트).`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_DOWNLOAD_BYTES || body.length < MIN_DOWNLOAD_BYTES) {
    throw new Error(`받은 자료의 크기가 이상합니다(${body.length}바이트).`);
  }

  return { body, builtAt: builtAtFrom(response.headers.get("content-disposition")) };
}

function storedSource(): { builtAt: string | null; entries: number; fetchedAt: Date } | undefined {
  return dictDb()
    .select({
      builtAt: dictSource.builtAt,
      entries: dictSource.entries,
      fetchedAt: dictSource.fetchedAt,
    })
    .from(dictSource)
    .where(eq(dictSource.id, "stdict"))
    .all()
    .at(0);
}

/** 확인한 시각만 새로 적는다. 자료는 그대로 둔다. */
function touchFetchedAt(): void {
  dictDb()
    .update(dictSource)
    .set({ fetchedAt: new Date() })
    .where(eq(dictSource.id, "stdict"))
    .run();
}

/** 뜻을 넣는다. **파일 하나가 한 트랜잭션이다** — 중간에 끊겨도 앞의 것은 남는다. */
function importAll(zip: Buffer, onFile?: (done: number, total: number) => void): number {
  const db = dictDb();
  const files = readZip(zip).filter((entry) => entry.name.endsWith(".json"));
  let total = 0;

  for (const [index, file] of files.entries()) {
    const entries = parseStdictFile(file.read().toString("utf8"));
    if (entries.length > 0) {
      db.transaction((tx) => {
        /*
         * **나눠 넣는다.** 파일 하나에 뜻이 6천 개쯤이고 열이 아홉이라, 한 문장에 다 실으면
         * 바인딩이 5만 개가 되어 SQLite가 `too many SQL variables`로 거절한다(한도 32,766).
         * 예약 작업을 실제로 돌려 보고 잡았다.
         */
        for (let at = 0; at < entries.length; at += INSERT_CHUNK) {
          insertChunk(tx, entries.slice(at, at + INSERT_CHUNK));
        }
      });
    }
    total += entries.length;
    onFile?.(index + 1, files.length);
  }

  return total;
}

/** 한 번에 넣을 뜻의 수. 열이 아홉이라 이만큼이면 바인딩 4,500개다. */
const INSERT_CHUNK = 500;

function insertChunk(tx: DictTx, entries: readonly StdictEntry[]): void {
  tx.insert(dictEntry)
    .values(
      entries.map((entry) => ({
        id: entry.id,
        word: entry.word,
        wordRaw: entry.wordRaw,
        hanja: entry.hanja ?? null,
        pos: entry.pos ?? null,
        category: entry.category ?? null,
        senseType: entry.senseType ?? null,
        definition: entry.definition,
        senseOrder: entry.senseOrder,
      })),
    )
    .onConflictDoUpdate({
      target: dictEntry.id,
      set: {
        word: sql`excluded.word`,
        wordRaw: sql`excluded.word_raw`,
        hanja: sql`excluded.hanja`,
        pos: sql`excluded.pos`,
        category: sql`excluded.category`,
        senseType: sql`excluded.sense_type`,
        definition: sql`excluded.definition`,
        senseOrder: sql`excluded.sense_order`,
      },
    })
    .run();
}

/**
 * 한 번 맞춰 본다.
 *
 * **같은 판이면 넣지 않는다.** 주기적으로 도는 작업이라, 받아 온 판이 이미 들어 있는지가
 * 곧 "일을 해야 하나"의 답이다. 받는 것까지는 하고(판을 알아야 한다) 넣는 것만 건너뛴다.
 */
async function syncStandardDictionary(
  options: {
    zip?: Buffer;
    builtAt?: string;
    force?: boolean;
    onFile?: (d: number, t: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<SyncResult> {
  const source =
    options.zip === undefined
      ? await download(options.signal)
      : { body: options.zip, builtAt: options.builtAt };

  const stored = storedSource();
  if (
    options.force !== true &&
    source.builtAt !== undefined &&
    stored?.builtAt === source.builtAt &&
    stored.entries > 0
  ) {
    /*
     * 넣지는 않지만 **확인한 시각은 적는다.** 적지 않으면 예약 작업이 이 자료를 영원히
     * "낡았다"고 보고 여섯 시간마다 68MB를 다시 받는다.
     */
    touchFetchedAt();
    return {
      kind: "skipped",
      entries: stored.entries,
      builtAt: source.builtAt,
      detail: `이미 ${source.builtAt} 판이 들어 있습니다.`,
    };
  }

  const entries = importAll(source.body, options.onFile);

  dictDb()
    .insert(dictSource)
    .values({
      id: "stdict",
      label: "표준국어대사전",
      builtAt: source.builtAt ?? null,
      fetchedAt: new Date(),
      entries,
    })
    .onConflictDoUpdate({
      target: dictSource.id,
      set: {
        builtAt: sql`excluded.built_at`,
        fetchedAt: sql`excluded.fetched_at`,
        entries: sql`excluded.entries`,
      },
    })
    .run();

  return {
    kind: "done",
    entries,
    builtAt: source.builtAt,
    detail: `뜻 ${entries.toLocaleString("ko-KR")}개를 넣었습니다(${source.builtAt ?? "판 미상"}).`,
  };
}

export { storedSource, syncStandardDictionary };
export type { SyncResult };
