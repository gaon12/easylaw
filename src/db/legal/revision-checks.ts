import { eq, inArray } from "drizzle-orm";
import type { LegalDb } from "@/db/client";
import { assessLegalRevision } from "@/lib/legal-revision-check";
import { listLegalDetailRevisions, readLegalDetailRevisionJsonForDetail } from "./detail-revisions";
import { legalDetailRevisionCheck } from "./schema";

function saveLegalRevisionCheck(
  db: LegalDb,
  input: {
    revisionId: string;
    baselineRevisionId?: string;
    assessment: ReturnType<typeof assessLegalRevision>;
    checkedAt?: Date;
  },
): void {
  const { revisionId, baselineRevisionId, assessment, checkedAt = new Date() } = input;
  db.insert(legalDetailRevisionCheck)
    .values({ revisionId, baselineRevisionId, ...assessment, checkedAt })
    .onConflictDoUpdate({
      target: legalDetailRevisionCheck.revisionId,
      set: { baselineRevisionId, ...assessment, checkedAt },
    })
    .run();
}

/** 저장된 원문판을 바로 전 판과 대조하고 결과를 원문판 UUID에 고정한다. */
function checkLegalDetailRevision(
  db: LegalDb,
  input: { source: string; detailId: string; detailKey: string; revisionId: string },
) {
  const revisions = listLegalDetailRevisions(db, input.source, input.detailKey);
  const baseline = revisions.find((revision) => revision.id !== input.revisionId);
  const after = readLegalDetailRevisionJsonForDetail(
    db,
    input.source,
    input.detailId,
    input.revisionId,
  );
  const before =
    baseline === undefined
      ? undefined
      : readLegalDetailRevisionJsonForDetail(db, input.source, input.detailId, baseline.id);
  const assessment = assessLegalRevision(before, after);
  saveLegalRevisionCheck(db, {
    revisionId: input.revisionId,
    baselineRevisionId: baseline?.id,
    assessment,
  });
  return assessment;
}

function listLegalRevisionChecks(db: LegalDb, revisionIds: readonly string[]) {
  if (revisionIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(legalDetailRevisionCheck)
    .where(inArray(legalDetailRevisionCheck.revisionId, [...revisionIds]))
    .all();
}

function findLegalRevisionCheck(db: LegalDb, revisionId: string) {
  return db
    .select()
    .from(legalDetailRevisionCheck)
    .where(eq(legalDetailRevisionCheck.revisionId, revisionId))
    .get();
}

export {
  checkLegalDetailRevision,
  findLegalRevisionCheck,
  listLegalRevisionChecks,
  saveLegalRevisionCheck,
};
