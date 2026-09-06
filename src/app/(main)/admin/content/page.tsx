import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { appDb } from "@/db/client";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import { contentCounts, dictSources, listLookupMisses } from "@/server/admin-overview";
import { dictScheduleState } from "@/server/dict-schedule";
import { siteTimeZone } from "@/server/settings";
import styles from "../admin.module.css";

/** 못 찾은 사건번호를 몇 개까지 보여 주나. 자주 오르는 것만 보면 된다. */
const MISS_ROWS = 20;

/**
 * 자료. `PAGES.md` §17
 *
 * **여기가 없으면 "우리가 무엇을 들고 있나"를 알 길이 SQLite를 직접 여는 것뿐이었다.**
 * 사전이 실제로 받아졌는지, 법령이 몇 판이나 있는지, 사람들이 찾았는데 없던 사건번호가
 * 무엇인지 — 셋 다 운영 판단에 쓰이는데 화면이 없었다.
 *
 * 세 데이터베이스는 서로 조인하지 않으므로(`ARCHITECTURE.md` §3) 이 화면도 **묶어서 한
 * 줄로 보여 주지 않는다.** 판례·법령과 사전은 다른 상자에 담긴 다른 자료다.
 */
export default function AdminContentPage() {
  const counts = contentCounts();
  const sources = dictSources();
  const misses = listLookupMisses(MISS_ROWS);
  const schedule = dictScheduleState();
  const timeZone = siteTimeZone(appDb());
  const at = (value: Date) => formatDateTime(value, timeZone);

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
            { label: admin.contentLawVersions, value: `${counts.lawVersions.toLocaleString()}건` },
            { label: admin.contentLawArticles, value: `${counts.lawArticles.toLocaleString()}건` },
          ]}
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
