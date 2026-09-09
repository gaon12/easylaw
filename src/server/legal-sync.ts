import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { existsSync, statfsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { legalDb } from "@/db/client";
import { upsertLawVersions } from "@/db/corpus/repository";
import {
  lawVersion,
  legalResource,
  legalResourceDetail,
  legalResourceFile,
  legalSyncRun,
} from "@/db/legal/schema";
import { env } from "@/lib/env";
import { parseRawListPage } from "@/lib/law-api/envelope";
import { readRejection } from "@/lib/law-api/parse";
import { parseLawSummary } from "@/lib/law-api/parse-law";
import { TARGETS, type TargetName } from "@/lib/law-api/targets";
import { invalidateLawNameIndex } from "./citations";
import { lawApiKey } from "./settings";

const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 30_000;
const KIBIBYTE = 1024;
const BYTES_PER_GIB = KIBIBYTE * KIBIBYTE * KIBIBYTE;
const FREE_SPACE_RESERVE_BYTES = 2 * BYTES_PER_GIB;
const DETAIL_CONCURRENCY = 4;
const MAX_CONSECUTIVE_FAILURES = 10;
const ERROR_SAMPLE_LIMIT = 5;
const SOURCE_NAMES = [
  "eflaw",
  "admrul",
  "ordin",
  "prec",
  "detc",
  "expc",
  "decc",
  "trty",
  "lstrm",
  "licbyl",
] as const satisfies readonly TargetName[];

type LegalSyncSource = (typeof SOURCE_NAMES)[number];
type SyncTrigger = "manual" | "automatic";

const ID_FIELDS: Record<LegalSyncSource, readonly string[]> = {
  eflaw: ["법령일련번호", "법령ID"],
  admrul: ["행정규칙일련번호", "행정규칙ID"],
  ordin: ["자치법규일련번호", "자치법규ID"],
  prec: ["판례일련번호"],
  detc: ["헌재결정례일련번호"],
  expc: ["법령해석례일련번호"],
  decc: ["행정심판재결례일련번호", "행정심판례일련번호"],
  trty: ["조약일련번호"],
  lstrm: ["법령용어ID", "법령용어일련번호"],
  licbyl: ["별표서식일련번호", "별표일련번호"],
};

const TITLE_FIELDS = [
  "법령명한글",
  "행정규칙명",
  "자치법규명",
  "사건명",
  "헌재결정례명",
  "안건명",
  "행정심판례명",
  "조약명",
  "법령용어명",
  "법령용어",
  "별표서식명",
] as const;

function value(item: Record<string, unknown>, fields: readonly string[]): string | undefined {
  for (const field of fields) {
    const raw = item[field];
    if (raw !== undefined && raw !== null && String(raw).trim().length > 0) {
      return String(raw).trim();
    }
  }
}

function stableJson(item: Record<string, unknown>): string {
  // 법제처 JSON의 필드 순서는 안정적이다. replacer 배열을 쓰면 중첩 객체의 키가 유실된다.
  return JSON.stringify(item);
}

/** 목록의 상세링크에는 `OC=인증키`가 들어 있다. 카탈로그에는 링크 필드를 저장하지 않는다. */
function sanitizeValue(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map(sanitizeValue);
  }
  if (typeof raw === "string") {
    return raw.replace(/([?&]OC=)[^&\s"']+/giu, "$1[redacted]");
  }
  if (raw === null || typeof raw !== "object") {
    return raw;
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([key]) => key !== "id")
      .map(([key, child]) => [key, sanitizeValue(child)]),
  );
}

function detailKey(source: LegalSyncSource, item: Record<string, unknown>): string | undefined {
  const field = TARGETS[source].detailIdField;
  const key = field === undefined ? undefined : value(item, [field]);
  if (source !== "eflaw" || key === undefined) {
    return key;
  }
  const effectiveAt = value(item, ["시행일자"]);
  return effectiveAt === undefined ? undefined : `${key}:${effectiveAt}`;
}

function sanitizeItem(item: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(item) as Record<string, unknown>;
}

function identity(source: LegalSyncSource, item: Record<string, unknown>): string {
  const genericIdField = Object.keys(item).find(
    (key) => key.endsWith("일련번호") || key.endsWith("ID"),
  );
  const found =
    value(item, ID_FIELDS[source]) ??
    (genericIdField === undefined ? undefined : value(item, [genericIdField]));
  if (found !== undefined) {
    const effective = source === "eflaw" ? value(item, ["시행일자"]) : undefined;
    return effective === undefined ? found : `${found}:${effective}`;
  }
  return createHash("sha256").update(stableJson(item)).digest("hex");
}

async function fetchPage(source: LegalSyncSource, page: number, oc: string) {
  const spec = TARGETS[source];
  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", spec.target);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`법제처 응답이 ${response.status}입니다 (${page}쪽).`);
  }
  const payload: unknown = JSON.parse(await response.text());
  const rejection = readRejection(payload);
  if (rejection !== undefined) {
    throw new Error(rejection);
  }
  return parseRawListPage(payload, spec);
}

async function fetchDetail(source: LegalSyncSource, key: string, oc: string): Promise<unknown> {
  const spec = TARGETS[source];
  if (spec.detailKey === undefined) {
    throw new Error(`${spec.label}은 상세 API가 없습니다.`);
  }
  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", spec.target);
  url.searchParams.set("type", "JSON");
  if (source === "eflaw") {
    const [mst, effectiveAt] = key.split(":");
    if (mst === undefined || effectiveAt === undefined) {
      throw new Error(`시행일법령 상세 키가 잘못되었습니다: ${key}`);
    }
    url.searchParams.set("MST", mst);
    url.searchParams.set("efYd", effectiveAt);
  } else {
    url.searchParams.set(spec.detailKey, key);
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`상세 응답이 ${response.status}입니다 (${spec.label} ${key}).`);
  }
  const payload: unknown = JSON.parse(await response.text());
  const rejection = readRejection(payload);
  if (rejection !== undefined) {
    throw new Error(rejection);
  }
  if (
    spec.detailEnvelope === undefined ||
    payload === null ||
    typeof payload !== "object" ||
    !(spec.detailEnvelope in payload)
  ) {
    throw new Error(`${spec.label} 상세 응답 형식이 예상과 다릅니다.`);
  }
  return sanitizeValue(payload);
}

function ensureDetailSpace(): void {
  const stats = statfsSync(env().LEGAL_DB_PATH);
  const free = Number(stats.bavail) * Number(stats.bsize);
  if (free < FREE_SPACE_RESERVE_BYTES) {
    throw new Error("상세자료 저장을 중단했습니다. 디스크 여유 공간 2GB를 확보해야 합니다.");
  }
}

interface DetailCounters {
  received: number;
  added: number;
  changed: number;
  failed: number;
}

interface FileCandidate {
  externalId: string;
  format: "hwp" | "pdf";
  sourcePath: string;
}

interface DetailCandidate {
  key: string;
  listHash: string;
}

async function syncResourceFile(candidate: FileCandidate, counters: DetailCounters): Promise<void> {
  const db = legalDb();
  const existing = db
    .select({ path: legalResourceFile.localPath, sourcePath: legalResourceFile.sourcePath })
    .from(legalResourceFile)
    .where(
      and(
        eq(legalResourceFile.source, "licbyl"),
        eq(legalResourceFile.externalId, candidate.externalId),
        eq(legalResourceFile.format, candidate.format),
      ),
    )
    .get();
  if (existing?.sourcePath === candidate.sourcePath && existsSync(existing.path)) {
    return;
  }
  ensureDetailSpace();
  const response = await fetch(new URL(candidate.sourcePath, "https://www.law.go.kr"), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`별표서식 ${candidate.format.toUpperCase()} 응답이 ${response.status}입니다.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const fileId = createHash("sha256")
    .update(`${candidate.externalId}:${candidate.format}`)
    .digest("hex");
  const localPath = resolve(env().LEGAL_FILES_PATH, "licbyl", `${fileId}.${candidate.format}`);
  const temporaryPath = `${localPath}.${randomUUID()}.tmp`;
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, localPath);
  counters.received += 1;
  if (existing === undefined) {
    counters.added += 1;
  } else {
    counters.changed += 1;
  }
  db.insert(legalResourceFile)
    .values({
      id: randomUUID(),
      source: "licbyl",
      externalId: candidate.externalId,
      format: candidate.format,
      sourcePath: candidate.sourcePath,
      localPath,
      contentHash: hash,
      bytes: bytes.byteLength,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [legalResourceFile.source, legalResourceFile.externalId, legalResourceFile.format],
      set: {
        sourcePath: candidate.sourcePath,
        localPath,
        contentHash: hash,
        bytes: bytes.byteLength,
        fetchedAt: new Date(),
      },
    })
    .run();
}

async function syncItemDetail(input: {
  source: LegalSyncSource;
  candidate: DetailCandidate;
  oc: string;
  counters: DetailCounters;
}): Promise<void> {
  const { source, candidate, oc, counters } = input;
  const { key, listHash: listPayloadHash } = candidate;
  const db = legalDb();
  const existing = db
    .select({
      hash: legalResourceDetail.payloadHash,
      listHash: legalResourceDetail.listPayloadHash,
    })
    .from(legalResourceDetail)
    .where(and(eq(legalResourceDetail.source, source), eq(legalResourceDetail.detailKey, key)))
    .get();
  if (existing?.listHash === listPayloadHash) {
    return;
  }
  const payload = await fetchDetail(source, key, oc);
  const raw = Buffer.from(JSON.stringify(payload));
  const compressed = gzipSync(raw, { level: 9 });
  const hash = createHash("sha256").update(raw).digest("hex");
  counters.received += 1;
  if (existing === undefined) {
    counters.added += 1;
  } else if (existing.hash !== hash) {
    counters.changed += 1;
  }
  db.insert(legalResourceDetail)
    .values({
      id: randomUUID(),
      source,
      detailKey: key,
      payload: compressed,
      payloadHash: hash,
      listPayloadHash,
      originalBytes: raw.byteLength,
      storedBytes: compressed.byteLength,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [legalResourceDetail.source, legalResourceDetail.detailKey],
      set: {
        payload: compressed,
        payloadHash: hash,
        listPayloadHash,
        originalBytes: raw.byteLength,
        storedBytes: compressed.byteLength,
        fetchedAt: new Date(),
      },
    })
    .run();
}

interface LegalSyncProcessState {
  running: Set<LegalSyncSource>;
  pending: Set<LegalSyncSource>;
  workQueue: Promise<void>;
}

const processState = globalThis as typeof globalThis & {
  easyLawLegalSync?: LegalSyncProcessState;
};
const newSyncState: LegalSyncProcessState = {
  running: new Set<LegalSyncSource>(),
  pending: new Set<LegalSyncSource>(),
  workQueue: Promise.resolve(),
};
const syncState = processState.easyLawLegalSync ?? newSyncState;
if (processState.easyLawLegalSync === undefined) {
  processState.easyLawLegalSync = syncState;
}

type LegalTransaction = Parameters<Parameters<ReturnType<typeof legalDb>["transaction"]>[0]>[0];

interface CatalogItemResult {
  added: number;
  changed: number;
  restored: number;
  changedItem?: Record<string, unknown>;
  detailCandidate?: DetailCandidate;
  fileCandidates: FileCandidate[];
}

interface PageWork {
  added: number;
  changed: number;
  restored: number;
  changedItems: Record<string, unknown>[];
  detailCandidates: DetailCandidate[];
  fileCandidates: FileCandidate[];
}

interface SyncCounts {
  received: number;
  added: number;
  changed: number;
  restored: number;
}

function filesForItem(
  source: LegalSyncSource,
  externalId: string,
  rawItem: Record<string, unknown>,
): FileCandidate[] {
  if (source !== "licbyl") {
    return [];
  }
  const links = [
    ["hwp", value(rawItem, ["별표서식파일링크"])],
    ["pdf", value(rawItem, ["별표서식PDF파일링크"])],
  ] as const;
  return links.flatMap(([format, sourcePath]) =>
    sourcePath === undefined ? [] : [{ externalId, format, sourcePath }],
  );
}

function upsertCatalogItem(input: {
  tx: LegalTransaction;
  source: LegalSyncSource;
  item: Record<string, unknown>;
  seenAt: Date;
  detailKeysSeen: Set<string>;
}): CatalogItemResult {
  const { tx, source, item, seenAt, detailKeysSeen } = input;
  const externalId = identity(source, item);
  const safeItem = sanitizeItem(item);
  const existing = tx
    .select({ hash: legalResource.payloadHash, missingAt: legalResource.missingAt })
    .from(legalResource)
    .where(and(eq(legalResource.source, source), eq(legalResource.externalId, externalId)))
    .get();
  const hash = createHash("sha256").update(stableJson(safeItem)).digest("hex");
  const itemDetailKey = detailKey(source, safeItem);
  tx.insert(legalResource)
    .values({
      id: randomUUID(),
      source,
      externalId,
      title: value(safeItem, TITLE_FIELDS) ?? `(제목 없음: ${externalId})`,
      kind: value(safeItem, ["법령구분명", "행정규칙종류", "사건종류명", "조약구분명"]) ?? null,
      payload: safeItem,
      payloadHash: hash,
      detailKey: itemDetailKey ?? null,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      missingAt: null,
    })
    .onConflictDoUpdate({
      target: [legalResource.source, legalResource.externalId],
      set: {
        title: sql`excluded.title`,
        kind: sql`excluded.kind`,
        payload: sql`excluded.payload`,
        payloadHash: sql`excluded.payload_hash`,
        detailKey: sql`excluded.detail_key`,
        lastSeenAt: sql`excluded.last_seen_at`,
        missingAt: null,
      },
    })
    .run();
  const hasNewDetail = itemDetailKey !== undefined && !detailKeysSeen.has(itemDetailKey);
  if (hasNewDetail && itemDetailKey !== undefined) {
    detailKeysSeen.add(itemDetailKey);
  }
  return {
    added: existing === undefined ? 1 : 0,
    changed: existing !== undefined && existing.hash !== hash ? 1 : 0,
    restored: existing?.missingAt == null ? 0 : 1,
    changedItem: existing !== undefined && existing.hash !== hash ? safeItem : undefined,
    detailCandidate:
      hasNewDetail && itemDetailKey !== undefined
        ? { key: itemDetailKey, listHash: hash }
        : undefined,
    // 인증키가 든 원본 링크는 메모리에서만 쓰고, DB에는 위의 safeItem만 저장한다.
    fileCandidates: filesForItem(source, externalId, item),
  };
}

function catalogPage(
  source: LegalSyncSource,
  items: readonly Record<string, unknown>[],
  seenAt: Date,
  detailKeysSeen: Set<string>,
): PageWork {
  const work: PageWork = {
    added: 0,
    changed: 0,
    restored: 0,
    changedItems: [],
    detailCandidates: [],
    fileCandidates: [],
  };
  legalDb().transaction((tx) => {
    for (const item of items) {
      const result = upsertCatalogItem({ tx, source, item, seenAt, detailKeysSeen });
      work.added += result.added;
      work.changed += result.changed;
      work.restored += result.restored;
      if (result.changedItem !== undefined) {
        work.changedItems.push(result.changedItem);
      }
      if (result.detailCandidate !== undefined) {
        work.detailCandidates.push(result.detailCandidate);
      }
      work.fileCandidates.push(...result.fileCandidates);
    }
  });
  return work;
}

function syncLawPage(
  items: readonly Record<string, unknown>[],
  changedItems: readonly Record<string, unknown>[],
): void {
  const db = legalDb();
  const laws = items.map(parseLawSummary);
  upsertLawVersions(
    db,
    laws.map((law) => ({
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
  for (const item of changedItems) {
    const law = parseLawSummary(item);
    db.update(lawVersion)
      .set({
        lawId: law.lawId ?? law.lawSerial,
        name: law.name,
        shortName: law.shortName ?? null,
        kind: law.kind ?? null,
        ministry: law.ministry ?? null,
        promulgatedAt: law.promulgatedAt ?? null,
        historyCode: law.historyCode ?? null,
      })
      .where(
        and(
          eq(lawVersion.mst, law.lawSerial),
          law.effectiveAt === undefined
            ? isNull(lawVersion.effectiveAt)
            : eq(lawVersion.effectiveAt, law.effectiveAt),
        ),
      )
      .run();
  }
}

function rememberFailure(error: unknown, errors: string[], fallback: string): void {
  if (errors.length < ERROR_SAMPLE_LIMIT) {
    errors.push(error instanceof Error ? error.message : fallback);
  }
}

async function syncDetailCandidates(input: {
  source: LegalSyncSource;
  candidates: readonly DetailCandidate[];
  oc: string;
  counters: DetailCounters;
  errors: string[];
}): Promise<void> {
  const { source, candidates, oc, counters, errors } = input;
  let consecutiveFailures = 0;
  for (let index = 0; index < candidates.length; index += DETAIL_CONCURRENCY) {
    const chunk = candidates.slice(index, index + DETAIL_CONCURRENCY);
    // biome-ignore lint/performance/noAwaitInLoops: 공공 API 동시 요청 수를 네 개로 제한한다.
    const results = await Promise.allSettled(
      chunk.map((candidate) => syncItemDetail({ source, candidate, oc, counters })),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures += 1;
        counters.failed += 1;
        rememberFailure(result.reason, errors, "상세자료 저장 실패");
      }
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error(`상세자료 요청이 연속 실패했습니다: ${errors.at(-1)}`);
    }
  }
}

async function syncFileCandidates(
  candidates: readonly FileCandidate[],
  counters: DetailCounters,
  errors: string[],
): Promise<void> {
  for (let index = 0; index < candidates.length; index += DETAIL_CONCURRENCY) {
    const chunk = candidates.slice(index, index + DETAIL_CONCURRENCY);
    // biome-ignore lint/performance/noAwaitInLoops: 파일 다운로드 동시 실행 수를 네 개로 제한한다.
    const results = await Promise.allSettled(
      chunk.map((candidate) => syncResourceFile(candidate, counters)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        counters.failed += 1;
        rememberFailure(result.reason, errors, "첨부파일 저장 실패");
      }
    }
  }
}

function updateRunProgress(runId: string, counts: SyncCounts, details: DetailCounters): void {
  legalDb()
    .update(legalSyncRun)
    .set({
      ...counts,
      detailReceived: details.received,
      detailAdded: details.added,
      detailChanged: details.changed,
      detailFailed: details.failed,
    })
    .where(eq(legalSyncRun.id, runId))
    .run();
}

function markMissing(source: LegalSyncSource, startedAt: Date): number {
  return legalDb()
    .update(legalResource)
    .set({ missingAt: new Date() })
    .where(
      and(
        eq(legalResource.source, source),
        isNull(legalResource.missingAt),
        lt(legalResource.lastSeenAt, startedAt),
      ),
    )
    .run().changes;
}

function finishRun(
  runId: string,
  counts: SyncCounts,
  details: DetailCounters,
  errors: readonly string[],
  missing: number,
): void {
  legalDb()
    .update(legalSyncRun)
    .set({
      status: details.failed === 0 ? "done" : "failed",
      finishedAt: new Date(),
      ...counts,
      missing,
      detailReceived: details.received,
      detailAdded: details.added,
      detailChanged: details.changed,
      detailFailed: details.failed,
      detail: errors.length === 0 ? null : errors.join(" | "),
    })
    .where(eq(legalSyncRun.id, runId))
    .run();
}

async function performLegalSync(input: {
  source: LegalSyncSource;
  runId: string;
  startedAt: Date;
  oc: string;
  includeDetails: boolean;
  detailCounters: DetailCounters;
  detailErrors: string[];
}): Promise<void> {
  const { source, runId, startedAt, oc, includeDetails, detailCounters, detailErrors } = input;
  const counts: SyncCounts = { received: 0, added: 0, changed: 0, restored: 0 };
  const detailKeysSeen = new Set<string>();
  let pageNo = 1;
  while (true) {
    // biome-ignore lint/performance/noAwaitInLoops: 목록은 다음 쪽 번호와 총건수를 앞 응답에서 확인한다.
    const fetched = await fetchPage(source, pageNo, oc);
    if (fetched.items.length === 0) {
      if (counts.received < fetched.total) {
        throw new Error(`목록이 ${counts.received}/${fetched.total}건에서 예기치 않게 끝났습니다.`);
      }
      break;
    }
    const work = catalogPage(source, fetched.items, startedAt, detailKeysSeen);
    counts.added += work.added;
    counts.changed += work.changed;
    counts.restored += work.restored;
    if (source === "eflaw") {
      syncLawPage(fetched.items, work.changedItems);
    }
    if (includeDetails && TARGETS[source].detailKey !== undefined) {
      ensureDetailSpace();
      await syncDetailCandidates({
        source,
        candidates: work.detailCandidates,
        oc,
        counters: detailCounters,
        errors: detailErrors,
      });
    }
    if (includeDetails && source === "licbyl") {
      await syncFileCandidates(work.fileCandidates, detailCounters, detailErrors);
    }
    counts.received += fetched.items.length;
    updateRunProgress(runId, counts, detailCounters);
    if (counts.received >= fetched.total) {
      break;
    }
    pageNo += 1;
  }
  finishRun(runId, counts, detailCounters, detailErrors, markMissing(source, startedAt));
  if (source === "eflaw") {
    invalidateLawNameIndex();
  }
  if (detailCounters.failed > 0) {
    throw new Error(
      detailErrors.join(" | ") || `상세자료 ${detailCounters.failed}건을 받지 못했습니다.`,
    );
  }
}

async function syncLegalSource(
  source: LegalSyncSource,
  trigger: SyncTrigger,
  includeDetails = false,
): Promise<void> {
  if (syncState.running.has(source)) {
    return;
  }
  syncState.running.add(source);
  const db = legalDb();
  const runId = randomUUID();
  const startedAt = new Date();
  const detailCounters: DetailCounters = { received: 0, added: 0, changed: 0, failed: 0 };
  const detailErrors: string[] = [];
  db.update(legalSyncRun)
    .set({ status: "failed", finishedAt: startedAt, detail: "서버 재시작으로 중단되었습니다." })
    .where(and(eq(legalSyncRun.source, source), eq(legalSyncRun.status, "running")))
    .run();
  db.insert(legalSyncRun)
    .values({ id: runId, source, trigger, status: "running", startedAt })
    .run();
  try {
    const oc = lawApiKey();
    if (oc === undefined) {
      throw new Error("법제처 인증키가 설정되지 않았습니다.");
    }
    await performLegalSync({
      source,
      runId,
      startedAt,
      oc,
      includeDetails,
      detailCounters,
      detailErrors,
    });
  } catch (error) {
    db.update(legalSyncRun)
      .set({
        status: "failed",
        finishedAt: new Date(),
        detail: error instanceof Error ? error.message : "알 수 없는 오류입니다.",
        detailReceived: detailCounters.received,
        detailAdded: detailCounters.added,
        detailChanged: detailCounters.changed,
        detailFailed: detailCounters.failed,
      })
      .where(eq(legalSyncRun.id, runId))
      .run();
    throw error;
  } finally {
    syncState.running.delete(source);
  }
}

function startLegalSync(
  sources: readonly LegalSyncSource[],
  trigger: SyncTrigger,
  includeDetails = false,
): Promise<void> {
  for (const source of sources) {
    if (syncState.pending.has(source) || syncState.running.has(source)) {
      continue;
    }
    syncState.pending.add(source);
    // 공공 API를 자료 종류 수만큼 동시에 두드리지 않는다. 관리자 요청은 한 줄로 순서대로 돈다.
    syncState.workQueue = syncState.workQueue
      .then(() => syncLegalSource(source, trigger, includeDetails))
      .catch(() => {
        // syncLegalSource가 실패 기록을 남겼다. 다음 자료가 계속 실행되도록 큐는 복구한다.
      })
      .finally(() => {
        syncState.pending.delete(source);
      });
  }
  return syncState.workQueue;
}

function legalSyncOverview() {
  const db = legalDb();
  return SOURCE_NAMES.map((source) => {
    const latest = db
      .select()
      .from(legalSyncRun)
      .where(eq(legalSyncRun.source, source))
      .orderBy(desc(legalSyncRun.startedAt))
      .limit(1)
      .get();
    const active =
      db
        .select({ count: sql<number>`count(*)` })
        .from(legalResource)
        .where(and(eq(legalResource.source, source), isNull(legalResource.missingAt)))
        .get()?.count ?? 0;
    const missing =
      db
        .select({ count: sql<number>`count(*)` })
        .from(legalResource)
        .where(and(eq(legalResource.source, source), sql`${legalResource.missingAt} is not null`))
        .get()?.count ?? 0;
    const detailRows =
      db
        .select({ count: sql<number>`count(*)` })
        .from(legalResourceDetail)
        .where(eq(legalResourceDetail.source, source))
        .get()?.count ?? 0;
    const files =
      db
        .select({ count: sql<number>`count(*)` })
        .from(legalResourceFile)
        .where(eq(legalResourceFile.source, source))
        .get()?.count ?? 0;
    return {
      source,
      label: TARGETS[source].label,
      latest,
      active,
      missing,
      details: detailRows + files,
    };
  });
}

function isLegalSyncSource(value: string): value is LegalSyncSource {
  return (SOURCE_NAMES as readonly string[]).includes(value);
}

export { isLegalSyncSource, legalSyncOverview, SOURCE_NAMES, startLegalSync, syncLegalSource };
export type { LegalSyncSource, SyncTrigger };
