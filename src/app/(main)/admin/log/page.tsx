import { Card } from "@/components/ui/card";
import { listRecentUploadFailures } from "@/db/app/generation";
import { appDb, corpusDb } from "@/db/client";
import { listRecentGenerationFailures } from "@/db/corpus/repository";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import { listAuditEntries } from "@/server/admin-overview";
import { siteTimeZone } from "@/server/settings";
import styles from "../admin.module.css";
import { RecentFailures } from "../recent-failures";

/** 최근 실패를 몇 개까지 보여 주나. 원인을 알아보는 데 필요한 만큼이면 된다. */
const RECENT_FAILURES = 10;

/** 감사 기록을 몇 줄까지. 더 필요하면 데이터베이스를 보는 편이 낫다 — 화면은 훑는 곳이다. */
const AUDIT_ROWS = 50;

/**
 * 기록. `PAGES.md` §17
 *
 * 두 가지가 함께 있다 — **감사 기록**(누가 무엇을 했나)과 **최근 실패**(무엇이 깨졌나).
 * 성격이 달라 보이지만 운영자가 둘을 찾는 순간은 같다: "무슨 일이 있었지?"
 *
 * 감사 기록은 **쌓기만 하고 볼 곳이 없었다.** 가입·권한 변경·문서 올림이 전부 남고
 * 있었는데 확인하려면 SQLite를 직접 열어야 했다. 쓰기만 하고 아무도 읽지 않는 기록은
 * 없는 것과 같다.
 */
export default function AdminLogPage() {
  const db = appDb();
  const timeZone = siteTimeZone(db);
  const entries = listAuditEntries(AUDIT_ROWS);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.logTitle}</h1>
        <p className={styles.intro}>{admin.logIntro}</p>
      </header>

      <RecentFailures
        cases={listRecentGenerationFailures(corpusDb(), RECENT_FAILURES)}
        formatTime={(at) => formatDateTime(at, timeZone)}
        uploads={listRecentUploadFailures(db, RECENT_FAILURES)}
      />

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.auditTitle}</h2>
        <p className={styles.sectionBody}>{admin.auditIntro}</p>

        {entries.length === 0 ? (
          <p className={styles.empty}>{admin.auditEmpty}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{admin.auditColumns.at}</th>
                  <th scope="col">{admin.auditColumns.action}</th>
                  <th scope="col">{admin.auditColumns.actor}</th>
                  <th scope="col">{admin.auditColumns.target}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.at, timeZone)}</td>
                    {/*
                      아는 이름은 우리말로 옮기고, 모르는 것은 적힌 그대로 둔다. 기록을 남기는
                      자리가 늘 때마다 이 표를 고쳐야 한다면 언젠가는 안 고치고, 그러면 화면에
                      빈 칸이 뜬다. 원래 값을 보여 주는 편이 빈 칸보다 낫다.
                    */}
                    <td>{admin.auditActions[entry.action] ?? entry.action}</td>
                    <td>{entry.actorName ?? entry.actorEmail ?? admin.auditUnknownActor}</td>
                    <td>{entry.target ?? "—"}</td>
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

/** 방금 있었던 일이 보여야 한다. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.logTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
