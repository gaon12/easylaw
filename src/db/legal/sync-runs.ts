import { and, eq, lt } from "drizzle-orm";
import type { LegalDb } from "@/db/client";
import { legalSyncRun } from "./schema";

const INTERRUPTED_DETAIL = "서버 재시작으로 중단되었습니다.";
const STALE_RUN_MS = 86_400_000;

/**
 * 이전 프로세스가 남긴 실행 중 표시를 시작 시점에 닫는다.
 *
 * 메모리의 작업 큐는 프로세스와 함께 사라진다. 다중 인스턴스가 같은 DB를 쓰는 경우 다른
 * 프로세스의 최근 작업일 수 있으므로 24시간 유예하고, 오래된 행만 다음 실행이 이어받는다.
 */
function failInterruptedLegalSyncRuns(
  db: LegalDb,
  finishedAt = new Date(),
  staleBefore = new Date(finishedAt.getTime() - STALE_RUN_MS),
): number {
  return db
    .update(legalSyncRun)
    .set({ status: "failed", finishedAt, detail: INTERRUPTED_DETAIL })
    .where(and(eq(legalSyncRun.status, "running"), lt(legalSyncRun.startedAt, staleBefore)))
    .run().changes;
}

export { failInterruptedLegalSyncRuns, INTERRUPTED_DETAIL, STALE_RUN_MS };
