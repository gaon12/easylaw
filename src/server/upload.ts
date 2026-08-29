import "server-only";
import { createHash } from "node:crypto";
import { deleteExpiredUploads, saveUpload } from "@/db/app/repository";
import type { AppDb } from "@/db/client";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { DAY_MS } from "@/lib/format";
import { prepareDocument, type RejectReason } from "@/lib/text/prepare";

/**
 * 업로드 처리. `PRODUCT.md` §5.5 · `PAGES.md` §4
 *
 * LLM도 외부 API도 쓰지 않는다. 여기서 하는 일은 **가리고, 나누고, 저장하는 것**뿐이다.
 * 설명 생성은 나중에 이 결과 위에 얹힌다.
 */

/** 보관 기간 선택지. `PAGES.md` §17 — 7·30·90일, 그리고 "직접 지울 때까지". */
const RETENTION_CHOICES = ["7", "30", "90", "keep"] as const;
type RetentionChoice = (typeof RETENTION_CHOICES)[number];

interface IngestInput {
  ownerId: string;
  /** 붙여넣기 또는 파일에서 읽은 원문. */
  raw: string;
  /** 원본 파일명. 붙여넣기면 null. */
  filename: string | null;
  /** 사용자가 적은 문서 이름. 비어 있으면 서버가 만든다. */
  title: string;
  /** 사용자가 적은 사건번호. 형식이 아니면 조용히 버린다 — 필수 정보가 아니다. */
  caseNo: string;
  retention: RetentionChoice;
}

type IngestResult =
  | { readonly kind: "saved"; readonly docId: string; readonly duplicate: boolean }
  | { readonly kind: "rejected"; readonly reason: RejectReason };

function isRetentionChoice(value: string): value is RetentionChoice {
  return (RETENTION_CHOICES as readonly string[]).includes(value);
}

/** `keep`은 기한 없음이다. null을 저장한다 — 먼 미래 날짜로 대신하면 "직접 지울 때까지"가 거짓말이 된다. */
function retentionUntil(choice: RetentionChoice, now: Date): Date | null {
  return choice === "keep" ? null : new Date(now.getTime() + Number(choice) * DAY_MS);
}

const FILE_EXTENSION = /\.[^.]+$/u;

/** 파일명에서 확장자를 뗀다. 이름이 없으면 올린 날짜로 만든다. */
function fallbackTitle(filename: string | null, now: Date): string {
  const base = filename?.replace(FILE_EXTENSION, "").trim();
  if (base !== undefined && base.length > 0) {
    return base;
  }
  return `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}.에 올린 판결문`;
}

/**
 * 올린 문서를 저장한다.
 *
 * 저장되는 것은 **마스킹을 마친 본문**뿐이다. 가리기 전 텍스트는 이 함수를 벗어나지 않는다.
 * 실패는 예외가 아니라 값으로 돌려준다 — 화면에서 이유를 그대로 말해 줘야 하기 때문이다.
 */
function ingestUpload(db: AppDb, input: IngestInput, now: Date = new Date()): IngestResult {
  const prepared = prepareDocument(input.raw);
  if (!prepared.ok) {
    return { kind: "rejected", reason: prepared.reason };
  }

  const { document } = prepared;
  const title = input.title.trim();

  const saved = saveUpload(db, {
    userId: input.ownerId,
    title: title.length > 0 ? title : fallbackTitle(input.filename, now),
    filename: input.filename,
    // 해시도 마스킹된 본문에서 만든다. 원문 해시를 남기면 지운 내용의 흔적이 남는다.
    docHash: createHash("sha256").update(document.text).digest("hex"),
    charCount: document.charCount,
    caseNoCanonical: toCanonicalCaseNumber(input.caseNo) ?? null,
    retentionUntil: retentionUntil(input.retention, now),
    spans: document.spans,
    maskCounts: document.maskCounts,
  });

  return { kind: "saved", docId: saved.id, duplicate: saved.duplicate };
}

/**
 * 보관 기간이 지난 문서를 치운다.
 *
 * 스케줄러를 두지 않고 문서를 읽는 화면에서 부른다. 사용자가 고른 기간은 약속이고,
 * 약속이 지켜지는 시점이 "누군가 서버를 재시작할 때"가 되면 안 된다.
 */
function purgeExpiredUploads(db: AppDb, now: Date = new Date()): number {
  return deleteExpiredUploads(db, now);
}

export { ingestUpload, isRetentionChoice, purgeExpiredUploads, RETENTION_CHOICES };
export type { IngestInput, IngestResult, RetentionChoice };
