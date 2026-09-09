"use server";

import { redirect } from "next/navigation";
import { appDb, legalDb } from "@/db/client";
import { findLegalDetailOverview } from "@/db/legal/detail-revisions";
import { checkLegalDetailRevision } from "@/db/legal/revision-checks";
import { isBulkLegalSyncSource, isLegalSyncSource, startLegalSync } from "./legal-sync";
import { currentSession } from "./owner";
import { writeSettings } from "./settings";

const MAX_INTERVAL_HOURS = 8760;

function selected(formData: FormData) {
  return formData.getAll("source").map(String).filter(isBulkLegalSyncSource);
}

async function runLegalSync(formData: FormData): Promise<void> {
  if ((await currentSession())?.role !== "admin") {
    return;
  }
  const sources = selected(formData);
  if (sources.length > 0) {
    const includeDetails = formData.get("include_details") === "true";
    startLegalSync(sources, "manual", includeDetails).catch(() => {
      // 각 실행 행에 실패 이유가 저장된다. 응답이 끝난 뒤의 미처리 rejection만 막는다.
    });
  }
  redirect("/admin/content?sync=started");
}

async function saveLegalSyncSchedule(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (session?.role !== "admin") {
    return;
  }
  const interval = Number(formData.get("interval_hours"));
  const sources = selected(formData);
  const automatic = formData.get("automatic") === "true" && sources.length > 0;
  const normalized = Number.isFinite(interval)
    ? String(Math.max(1, Math.min(MAX_INTERVAL_HOURS, Math.floor(interval))))
    : "24";
  writeSettings(
    appDb(),
    {
      legal_sync_auto: automatic ? "true" : "false",
      legal_sync_interval_hours: normalized,
      legal_sync_sources: sources.join(","),
      legal_sync_details: formData.get("include_details") === "true" ? "true" : "false",
    },
    session.userId,
  );
  redirect("/admin/content?sync=saved");
}

async function recheckLegalDetailRevision(formData: FormData): Promise<void> {
  if ((await currentSession())?.role !== "admin") {
    return;
  }
  const source = String(formData.get("source") ?? "");
  const detailId = String(formData.get("detail_id") ?? "");
  const revisionId = String(formData.get("revision_id") ?? "");
  if (!isLegalSyncSource(source)) {
    return;
  }
  const db = legalDb();
  const detail = findLegalDetailOverview(db, source, detailId);
  if (detail?.currentRevisionId !== revisionId) {
    return;
  }
  checkLegalDetailRevision(db, {
    source,
    detailId,
    detailKey: detail.detailKey,
    revisionId,
  });
  redirect(`/admin/content/legal/${source}/${detailId}?checked=true`);
}

export { recheckLegalDetailRevision, runLegalSync, saveLegalSyncSchedule };
