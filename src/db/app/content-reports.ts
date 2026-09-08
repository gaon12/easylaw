import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AppDb } from "../client";
import {
  type CONTENT_REPORT_REASONS,
  type CONTENT_REPORT_STATUSES,
  contentReport,
  user,
} from "./schema";

type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];
type ContentReportStatus = (typeof CONTENT_REPORT_STATUSES)[number];

interface NewContentReport {
  readonly reporterId: string | null;
  readonly judgmentId: string;
  readonly sourceRevisionId: string;
  readonly contentReleaseId: string;
  readonly renditionId: string;
  readonly sentenceId: string;
  readonly reason: ContentReportReason;
  readonly detail: string | null;
}

/** 같은 사람이 같은 공개 문장에 남긴 열린 신고는 합쳐 반복 제출로 큐가 불어나지 않게 한다. */
function createContentReport(db: AppDb, input: NewContentReport) {
  const reporterCondition =
    input.reporterId === null
      ? isNull(contentReport.reporterId)
      : eq(contentReport.reporterId, input.reporterId);
  const existing = db
    .select({ id: contentReport.id })
    .from(contentReport)
    .where(
      and(
        eq(contentReport.sentenceId, input.sentenceId),
        eq(contentReport.reason, input.reason),
        reporterCondition,
        inArray(contentReport.status, ["open", "reviewing"]),
      ),
    )
    .get();
  if (existing !== undefined) {
    return { id: existing.id, duplicate: true } as const;
  }

  const id = crypto.randomUUID();
  db.insert(contentReport)
    .values({ id, ...input })
    .run();
  return { id, duplicate: false } as const;
}

function listContentReports(db: AppDb, limit: number) {
  return db
    .select({
      id: contentReport.id,
      reporterId: contentReport.reporterId,
      reporterEmail: user.email,
      judgmentId: contentReport.judgmentId,
      sourceRevisionId: contentReport.sourceRevisionId,
      contentReleaseId: contentReport.contentReleaseId,
      renditionId: contentReport.renditionId,
      sentenceId: contentReport.sentenceId,
      reason: contentReport.reason,
      detail: contentReport.detail,
      status: contentReport.status,
      createdAt: contentReport.createdAt,
      handledBy: contentReport.handledBy,
      handledAt: contentReport.handledAt,
    })
    .from(contentReport)
    .leftJoin(user, eq(user.id, contentReport.reporterId))
    .orderBy(desc(contentReport.createdAt))
    .limit(limit)
    .all();
}

/** 검수 큐 상태만 바꾼다. 해결·기각을 다시 열 수도 있고 그때도 담당자와 시각을 남긴다. */
function updateContentReportStatus(
  db: AppDb,
  input: { reportId: string; status: ContentReportStatus; handledBy: string },
): boolean {
  const result = db
    .update(contentReport)
    .set({
      status: input.status,
      handledBy: input.handledBy,
      handledAt: new Date(),
    })
    .where(eq(contentReport.id, input.reportId))
    .run();
  return result.changes > 0;
}

export { createContentReport, listContentReports, updateContentReportStatus };
export type { ContentReportReason, ContentReportStatus, NewContentReport };
