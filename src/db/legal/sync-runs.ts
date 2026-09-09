import { eq } from "drizzle-orm";
import type { LegalDb } from "@/db/client";
import { legalSyncRun } from "./schema";

const INTERRUPTED_DETAIL = "서버 재시작으로 중단되었습니다.";

/**
 * 이전 프로세스가 남긴 실행 중 표시를 시작 시점에 닫는다.
 *
 * 메모리의 작업 큐는 프로세스와 함께 사라지므로, 새 프로세스에서 `running`인 DB 행은
 * 실제 작업이 아니다. 자료 행은 페이지 단위 트랜잭션으로 남아 다음 실행이 이어받는다.
 */
function failInterruptedLegalSyncRuns(db: LegalDb, finishedAt = new Date()): number {
  return db
    .update(legalSyncRun)
    .set({ status: "failed", finishedAt, detail: INTERRUPTED_DETAIL })
    .where(eq(legalSyncRun.status, "running"))
    .run().changes;
}

export { failInterruptedLegalSyncRuns, INTERRUPTED_DETAIL };
