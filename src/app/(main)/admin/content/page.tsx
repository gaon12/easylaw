import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { appDb } from "@/db/client";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import {
  contentCounts,
  dictSources,
  listJudgments,
  listLookupMisses,
} from "@/server/admin-overview";
import { dictScheduleState } from "@/server/dict-schedule";
import { legalSyncOverview, SOURCE_NAMES } from "@/server/legal-sync";
import { runLegalSync, saveLegalSyncSchedule } from "@/server/legal-sync-actions";
import { currentSession } from "@/server/owner";
import { readSetting, siteTimeZone } from "@/server/settings";
import styles from "../admin.module.css";
import { JudgmentList } from "../judgment-list";

const syncCopy = {
  title: "법제처 자료 동기화",
  intro:
    "법제처의 10개 자료 목록을 카탈로그로 받습니다. 새 자료와 변경을 반영하고, 공식 목록에서 사라진 자료는 삭제하지 않고 ‘사라짐’으로 표시합니다. 실행은 백그라운드에서 진행되며 이 페이지를 새로고침하면 상태를 확인할 수 있습니다.",
  started: "동기화를 시작했습니다.",
  saved: "자동 동기화 설정을 저장했습니다.",
  columns: ["자료", "상태", "활성", "상세 저장", "상세 이력", "사라짐", "최근 결과"],
  manualLegend: "지금 동기화할 자료",
  manualButton: "선택 자료 지금 동기화",
  includeDetails: "상세 본문까지 다운로드·압축 저장",
  automatic: "자동 동기화 사용",
  interval: "실행 주기(시간)",
  automaticLegend: "자동 동기화 대상",
  saveButton: "자동 설정 저장",
} as const;

const runStatus = { running: "실행 중", done: "완료", failed: "실패" } as const;

/** 못 찾은 사건번호를 몇 개까지 보여 주나. 자주 오르는 것만 보면 된다. */
const MISS_ROWS = 20;

/** 판례를 몇 줄까지. 최근에 받은 것부터 — 이상한 것은 대개 방금 받은 것이다. */
const JUDGMENT_ROWS = 30;

/**
 * 자료. `PAGES.md` §17
 *
 * **여기가 없으면 "우리가 무엇을 들고 있나"를 알 길이 SQLite를 직접 여는 것뿐이었다.**
 * 사전이 실제로 받아졌는지, 법령이 몇 판이나 있는지, 사람들이 찾았는데 없던 사건번호가
 * 무엇인지 — 셋 다 운영 판단에 쓰이는데 화면이 없었다.
 *
 * 데이터베이스들은 서로 조인하지 않으며, 화면에서만 각 자료군의 운영 상태를 모아 보여 준다.
 */
export default async function AdminContentPage(props: {
  searchParams: Promise<{ sync?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await currentSession();
  const counts = contentCounts();
  const sources = dictSources();
  const misses = listLookupMisses(MISS_ROWS);
  const judgments = listJudgments(JUDGMENT_ROWS);
  const schedule = dictScheduleState();
  const timeZone = siteTimeZone(appDb());
  const at = (value: Date) => formatDateTime(value, timeZone);
  const syncRows = legalSyncOverview();
  const automatic = readSetting(appDb(), "legal_sync_auto") === "true";
  const intervalHours = readSetting(appDb(), "legal_sync_interval_hours") ?? "24";
  const configured = new Set((readSetting(appDb(), "legal_sync_sources") ?? "eflaw").split(","));
  const includeDetails = readSetting(appDb(), "legal_sync_details") === "true";

  /** 자동 갱신이 마지막에 무엇을 했나. 한 번도 안 돌았을 때와 실패했을 때는 다른 말이다. */
  function scheduleLine(): string {
    if (schedule.lastRunAt === undefined) {
      return admin.dictScheduleIdle;
    }
    return schedule.lastOk === true
      ? admin.dictScheduleOk(at(schedule.lastRunAt))
      : admin.dictScheduleFailed(at(schedule.lastRunAt));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.contentTitle}</h1>
        <p className={styles.intro}>{admin.contentIntro}</p>
      </header>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.contentCorpus}</h2>
        <StructuredList
          rows={[
            { label: admin.contentJudgments, value: `${counts.judgments.toLocaleString()}건` },
            { label: admin.contentRenditions, value: `${counts.renditions.toLocaleString()}건` },
          ]}
        />
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.contentLegalCorpus}</h2>
        <StructuredList
          rows={[
            { label: admin.contentLawVersions, value: `${counts.lawVersions.toLocaleString()}건` },
            { label: admin.contentLawArticles, value: `${counts.lawArticles.toLocaleString()}건` },
          ]}
        />
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{syncCopy.title}</h2>
        <p className={styles.sectionBody}>{syncCopy.intro}</p>
        {searchParams.sync === "started" ? <p className={styles.hint}>{syncCopy.started}</p> : null}
        {searchParams.sync === "saved" ? <p className={styles.hint}>{syncCopy.saved}</p> : null}

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {syncCopy.columns.map((column) => (
                  <th scope="col" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {syncRows.map((row) => (
                <tr key={row.source}>
                  <td>{row.label}</td>
                  <td>{row.latest === undefined ? "실행 전" : runStatus[row.latest.status]}</td>
                  <td>{`${row.active.toLocaleString()}건`}</td>
                  <td>{`${(row.details ?? 0).toLocaleString()}건`}</td>
                  <td>{`${row.detailRevisions.toLocaleString()}판`}</td>
                  <td>{`${row.missing.toLocaleString()}건`}</td>
                  <td>
                    {row.latest === undefined
                      ? "—"
                      : `${at(row.latest.startedAt)} · 목록 ${row.latest.received.toLocaleString()} / 추가 ${row.latest.added.toLocaleString()} / 변경 ${row.latest.changed.toLocaleString()} / 재등장 ${row.latest.restored.toLocaleString()} / 사라짐 ${row.latest.missing.toLocaleString()} · 상세 ${row.latest.detailReceived.toLocaleString()} / 공식 미제공 ${row.latest.detailUnavailable.toLocaleString()} / 실패 ${row.latest.detailFailed.toLocaleString()}${row.latest.detail ? ` · ${row.latest.detail}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={runLegalSync} className={styles.syncForm}>
          <fieldset className={styles.syncChoices}>
            <legend className={styles.label}>{syncCopy.manualLegend}</legend>
            {SOURCE_NAMES.map((source) => {
              const row = syncRows.find((item) => item.source === source);
              return (
                <div className={styles.checkboxRow} key={source}>
                  <Checkbox
                    aria-label={row?.label ?? source}
                    name="source"
                    value={source}
                    defaultChecked={source === "eflaw"}
                  />
                  <span>{row?.label ?? source}</span>
                </div>
              );
            })}
          </fieldset>
          <div className={styles.checkboxRow}>
            <Checkbox name="include_details" value="true" defaultChecked={true} />
            <span className={styles.label}>{syncCopy.includeDetails}</span>
          </div>
          <Button type="submit">{syncCopy.manualButton}</Button>
        </form>

        <form action={saveLegalSyncSchedule} className={styles.syncForm}>
          <div className={styles.checkboxRow}>
            <Checkbox
              aria-label={syncCopy.automatic}
              name="automatic"
              value="true"
              defaultChecked={automatic}
            />
            <span className={styles.label}>{syncCopy.automatic}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>{syncCopy.interval}</span>
            <Input
              aria-label={syncCopy.interval}
              name="interval_hours"
              type="number"
              min={1}
              max={8760}
              defaultValue={intervalHours}
            />
          </div>
          <fieldset className={styles.syncChoices}>
            <legend className={styles.label}>{syncCopy.automaticLegend}</legend>
            {SOURCE_NAMES.map((source) => {
              const row = syncRows.find((item) => item.source === source);
              return (
                <div className={styles.checkboxRow} key={source}>
                  <Checkbox
                    aria-label={row?.label ?? source}
                    name="source"
                    value={source}
                    defaultChecked={configured.has(source)}
                  />
                  <span>{row?.label ?? source}</span>
                </div>
              );
            })}
          </fieldset>
          <div className={styles.checkboxRow}>
            <Checkbox name="include_details" value="true" defaultChecked={includeDetails} />
            <span className={styles.label}>{syncCopy.includeDetails}</span>
          </div>
          <Button type="submit" variant="secondary">
            {syncCopy.saveButton}
          </Button>
        </form>
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.judgmentTitle}</h2>
        <p className={styles.sectionBody}>{admin.judgmentIntro}</p>
        <JudgmentList
          canRefresh={session?.role === "admin"}
          formatTime={(value) => (value === null ? admin.judgmentNever : at(value))}
          rows={judgments}
        />
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.contentDict}</h2>
        <StructuredList
          rows={[
            { label: admin.contentDictEntries, value: `${counts.dictEntries.toLocaleString()}개` },
            { label: admin.contentLegalTerms, value: `${counts.legalTerms.toLocaleString()}개` },
          ]}
        />

        {sources.length === 0 ? (
          <p className={styles.empty}>{admin.dictNever}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{admin.dictSourceColumns.label}</th>
                  <th scope="col">{admin.dictSourceColumns.builtAt}</th>
                  <th scope="col">{admin.dictSourceColumns.fetchedAt}</th>
                  <th scope="col">{admin.dictSourceColumns.entries}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.label}</td>
                    <td>{source.builtAt ?? "—"}</td>
                    <td>{at(source.fetchedAt)}</td>
                    <td>{source.entries.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/*
          자동 갱신은 서버가 스스로 돈다(`dict-schedule.ts`). 마지막에 무슨 일이 있었는지
          보이지 않으면, 조용히 실패한 채로 몇 달이 지나도 아무도 모른다.
        */}
        <h3 className={styles.label}>{admin.dictScheduleTitle}</h3>
        <p className={styles.sectionBody}>{scheduleLine()}</p>
        {schedule.lastDetail === undefined ? null : (
          <p className={styles.hint}>{schedule.lastDetail}</p>
        )}
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.missTitle}</h2>
        <p className={styles.sectionBody}>{admin.missIntro}</p>

        {misses.length === 0 ? (
          <p className={styles.empty}>{admin.missEmpty}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{admin.missColumns.caseNo}</th>
                  <th scope="col">{admin.missColumns.count}</th>
                  <th scope="col">{admin.missColumns.lastTriedAt}</th>
                </tr>
              </thead>
              <tbody>
                {misses.map((miss) => (
                  <tr key={miss.caseNo}>
                    <td>{miss.caseNo}</td>
                    <td>{miss.count.toLocaleString()}</td>
                    <td>{at(miss.lastTriedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** 세는 화면이다. 캐시하면 방금 받은 사전이 "아직 없음"으로 보인다. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.contentTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
