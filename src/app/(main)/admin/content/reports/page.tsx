import Link from "next/link";
import { Card } from "@/components/ui/card";
import { listContentReports } from "@/db/app/content-reports";
import { appDb, corpusDb } from "@/db/client";
import { listJudgmentIdentities, listReportedSentenceDetails } from "@/db/corpus/repository";
import { canReviewContent } from "@/lib/content-permissions";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import styles from "../../admin.module.css";
import { ReportStatusControl } from "./report-status-control";

const REPORT_ROWS = 100;

export default async function ContentReportsPage() {
  const [session, reports] = await Promise.all([
    currentSession(),
    Promise.resolve(listContentReports(appDb(), REPORT_ROWS)),
  ]);
  const db = corpusDb();
  const judgments = new Map(
    listJudgmentIdentities(db, [...new Set(reports.map(({ judgmentId }) => judgmentId))]).map(
      (item) => [item.id, item] as const,
    ),
  );
  const sentences = new Map(
    listReportedSentenceDetails(
      db,
      reports.map(({ sentenceId }) => sentenceId),
    ).map((item) => [item.id, item] as const),
  );
  const at = (value: Date) => formatDateTime(value, siteTimeZone(appDb()));
  const canManage = canReviewContent(session?.role);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.reportsTitle}</h1>
        <p className={styles.intro}>{admin.reportsIntro}</p>
      </header>
      <Card as="section" className={styles.usage}>
        {reports.length === 0 ? (
          <p className={styles.empty}>{admin.reportsEmpty}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{admin.reportColumns.at}</th>
                  <th scope="col">{admin.reportColumns.document}</th>
                  <th scope="col">{admin.reportColumns.reason}</th>
                  <th scope="col">{admin.reportColumns.sentence}</th>
                  <th scope="col">{admin.reportColumns.status}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((item) => {
                  const judgment = judgments.get(item.judgmentId);
                  const sentence = sentences.get(item.sentenceId);
                  return (
                    <tr key={item.id}>
                      <td>{at(item.createdAt)}</td>
                      <td>
                        {judgment === undefined ? (
                          admin.reportMissingDocument
                        ) : (
                          <Link
                            className={styles.link}
                            href={`/admin/content/judgments/${item.judgmentId}?releaseTo=${item.contentReleaseId}`}
                          >
                            {judgment.caseNoDisplay}
                          </Link>
                        )}
                      </td>
                      <td>
                        {admin.reportReasons[item.reason]}
                        {item.detail === null ? null : <p className={styles.hint}>{item.detail}</p>}
                      </td>
                      <td>{sentence?.text ?? admin.reportMissingSentence}</td>
                      <td>
                        {canManage ? (
                          <ReportStatusControl reportId={item.id} status={item.status} />
                        ) : (
                          admin.reportStatuses[item.status]
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.reportsTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
