"use server";

import { revalidatePath } from "next/cache";
import {
  type ContentReportReason,
  type ContentReportStatus,
  createContentReport,
  updateContentReportStatus,
} from "@/db/app/content-reports";
import { recordAuditEvent } from "@/db/app/repository";
import { CONTENT_REPORT_REASONS, CONTENT_REPORT_STATUSES } from "@/db/app/schema";
import { appDb, corpusDb } from "@/db/client";
import { findPublishedSentenceContext } from "@/db/corpus/repository";
import { canReviewContent } from "@/lib/content-permissions";
import { currentSession } from "./owner";

interface ContentReportActionState {
  readonly done?: string;
  readonly problem?: string;
}

const MAX_DETAIL_LENGTH = 1000;

/** 공개 화면의 값 대신 현재 릴리스 연결을 다시 조회해 정확한 판과 문장 UUID를 저장한다. */
async function submitContentReport(
  _previous: ContentReportActionState,
  formData: FormData,
): Promise<ContentReportActionState> {
  const sentenceId = String(formData.get("sentence_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();
  const reasons: readonly string[] = CONTENT_REPORT_REASONS;
  if (sentenceId.length === 0 || !reasons.includes(reason)) {
    return { problem: "신고할 문장과 이유를 확인해 주세요." };
  }
  if (detail.length > MAX_DETAIL_LENGTH) {
    return { problem: `자세한 내용은 ${MAX_DETAIL_LENGTH.toLocaleString()}자까지 적을 수 있어요.` };
  }

  const context = findPublishedSentenceContext(corpusDb(), sentenceId);
  if (context === undefined) {
    return { problem: "이 설명은 지금 공개 중인 판이 아니에요. 화면을 새로 고쳐 주세요." };
  }
  const session = await currentSession();
  const saved = createContentReport(appDb(), {
    reporterId: session?.userId ?? null,
    ...context,
    reason: reason as ContentReportReason,
    detail: detail.length === 0 ? null : detail,
  });
  revalidatePath("/admin/content/reports");
  return {
    done: saved.duplicate ? "같은 문제를 이미 알려 주셨어요." : "문제를 알려 주셔서 고맙습니다.",
  };
}

async function manageContentReport(
  _previous: ContentReportActionState,
  formData: FormData,
): Promise<ContentReportActionState> {
  const session = await currentSession();
  if (session === undefined || !canReviewContent(session.role)) {
    return { problem: "검수자 또는 관리자만 신고 상태를 바꿀 수 있어요." };
  }
  const reportId = String(formData.get("report_id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const statuses: readonly string[] = CONTENT_REPORT_STATUSES;
  if (reportId.length === 0 || !statuses.includes(status)) {
    return { problem: "신고와 처리 상태를 확인해 주세요." };
  }
  const changed = updateContentReportStatus(appDb(), {
    reportId,
    status: status as ContentReportStatus,
    handledBy: session.userId,
  });
  if (!changed) {
    return { problem: "신고를 찾을 수 없어요." };
  }
  recordAuditEvent(appDb(), {
    actorId: session.userId,
    action: `content.report_${status}`,
    targetId: reportId,
  });
  revalidatePath("/admin/content/reports");
  return { done: "처리 상태를 저장했어요." };
}

export { manageContentReport, submitContentReport };
export type { ContentReportActionState };
