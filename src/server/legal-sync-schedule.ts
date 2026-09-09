import "server-only";

import process from "node:process";
import { desc, eq } from "drizzle-orm";
import { appDb, legalDb } from "@/db/client";
import { legalSyncRun } from "@/db/legal/schema";
import { failInterruptedLegalSyncRuns } from "@/db/legal/sync-runs";
import { isLegalSyncSource, startLegalSync } from "./legal-sync";
import { readSetting } from "./settings";

const CHECK_MS = 60_000;
const FIRST_CHECK_DELAY_MS = 10_000;
const HOUR_MS = 3_600_000;
const MAX_INTERVAL_HOURS = 8760;
const PRODUCTION_BUILD_PHASE = "phase-production-build";

interface LegalScheduleProcessState {
  started: boolean;
}

const processState = globalThis as typeof globalThis & {
  easyLawLegalSchedule?: LegalScheduleProcessState;
};
const scheduleState = processState.easyLawLegalSchedule ?? { started: false };
if (processState.easyLawLegalSchedule === undefined) {
  processState.easyLawLegalSchedule = scheduleState;
}

function configuredSources() {
  const raw = readSetting(appDb(), "legal_sync_sources") ?? "eflaw";
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(isLegalSyncSource);
}

function check(): void {
  if (readSetting(appDb(), "legal_sync_auto") !== "true") {
    return;
  }
  const configuredHours = Number(readSetting(appDb(), "legal_sync_interval_hours") ?? 24);
  const hours = Number.isFinite(configuredHours)
    ? Math.max(1, Math.min(MAX_INTERVAL_HOURS, configuredHours))
    : 24;
  const dueBefore = Date.now() - hours * HOUR_MS;
  const due = configuredSources().filter((source) => {
    const latest = legalDb()
      .select({ startedAt: legalSyncRun.startedAt, status: legalSyncRun.status })
      .from(legalSyncRun)
      .where(eq(legalSyncRun.source, source))
      .orderBy(desc(legalSyncRun.startedAt))
      .limit(1)
      .get();
    // 프로세스가 작업 중 종료되면 running 기록만 남는다. 주기가 지난 기록은 다시 시도한다.
    return latest === undefined || latest.startedAt.getTime() <= dueBefore;
  });
  const includeDetails = readSetting(appDb(), "legal_sync_details") === "true";
  startLegalSync(due, "automatic", includeDetails).catch(() => {
    // 개별 실행은 자체 실패 기록을 남긴다. 타이머 콜백의 미처리 rejection만 막는다.
  });
}

function startLegalSyncSchedule(): void {
  // App Layout 모듈은 `next build`의 정적 페이지 수집 중에도 평가된다. 이때는 빈 CI
  // 작업공간에 운영 DB가 없으며, Next 자체도 instrumentation 등록을 같은 값으로 건너뛴다.
  if (scheduleState.started || process.env.NEXT_PHASE === PRODUCTION_BUILD_PHASE) {
    return;
  }
  scheduleState.started = true;
  failInterruptedLegalSyncRuns(legalDb());
  const timer = setInterval(check, CHECK_MS);
  timer.unref?.();
  const first = setTimeout(check, FIRST_CHECK_DELAY_MS);
  first.unref?.();
}

export { startLegalSyncSchedule };
