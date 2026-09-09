import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AppDb } from "../client";
import {
  type CONTENT_REPORT_STATUSES,
  type MEDIA_REPORT_REASONS,
  mediaReport,
  user,
} from "./schema";

type MediaReportReason = (typeof MEDIA_REPORT_REASONS)[number];
type MediaReportStatus = (typeof CONTENT_REPORT_STATUSES)[number];

interface NewMediaReport {
  readonly reporterId: string | null;
  readonly judgmentId: string;
  readonly sourceRevisionId: string;
  readonly contentReleaseId: string;
  readonly renditionId: string;
  readonly placementId: string;
  readonly assetId: string;
  readonly recipeKey: string;
  readonly reason: MediaReportReason;
  readonly detail: string | null;
}

/** 같은 사람이 같은 공개 배치에 남긴 열린 신고는 한 건으로 유지한다. */
function createMediaReport(db: AppDb, input: NewMediaReport) {
  const reporterCondition =
    input.reporterId === null
      ? isNull(mediaReport.reporterId)
      : eq(mediaReport.reporterId, input.reporterId);
  const existing = db
    .select({ id: mediaReport.id })
    .from(mediaReport)
    .where(
      and(
        eq(mediaReport.placementId, input.placementId),
        eq(mediaReport.assetId, input.assetId),
        eq(mediaReport.reason, input.reason),
        reporterCondition,
        inArray(mediaReport.status, ["open", "reviewing"]),
      ),
    )
    .get();
  if (existing !== undefined) {
    return { id: existing.id, duplicate: true } as const;
  }

  const id = crypto.randomUUID();
  db.insert(mediaReport)
    .values({ id, ...input })
    .run();
  return { id, duplicate: false } as const;
}

function listMediaReports(db: AppDb, limit: number) {
  return db
    .select({
      id: mediaReport.id,
      reporterId: mediaReport.reporterId,
      reporterEmail: user.email,
      judgmentId: mediaReport.judgmentId,
      sourceRevisionId: mediaReport.sourceRevisionId,
      contentReleaseId: mediaReport.contentReleaseId,
      renditionId: mediaReport.renditionId,
      placementId: mediaReport.placementId,
      assetId: mediaReport.assetId,
      recipeKey: mediaReport.recipeKey,
      reason: mediaReport.reason,
      detail: mediaReport.detail,
      status: mediaReport.status,
      createdAt: mediaReport.createdAt,
      handledBy: mediaReport.handledBy,
      handledAt: mediaReport.handledAt,
    })
    .from(mediaReport)
    .leftJoin(user, eq(user.id, mediaReport.reporterId))
    .orderBy(desc(mediaReport.createdAt))
    .limit(limit)
    .all();
}

function updateMediaReportStatus(
  db: AppDb,
  input: { reportId: string; status: MediaReportStatus; handledBy: string },
): boolean {
  const result = db
    .update(mediaReport)
    .set({ status: input.status, handledBy: input.handledBy, handledAt: new Date() })
    .where(eq(mediaReport.id, input.reportId))
    .run();
  return result.changes > 0;
}

export { createMediaReport, listMediaReports, updateMediaReportStatus };
export type { MediaReportReason, MediaReportStatus, NewMediaReport };
