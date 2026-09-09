import { Card } from "@/components/ui/card";
import { listContentReports } from "@/db/app/content-reports";
import { listMediaReports } from "@/db/app/media-reports";
import { appDb, corpusDb } from "@/db/client";
import { listJudgmentIdentities, listReportedSentenceDetails } from "@/db/corpus/repository";
import { canReviewContent } from "@/lib/content-permissions";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import styles from "../../admin.module.css";
import { MediaReportsTable, SentenceReportsTable } from "./report-tables";

const REPORT_ROWS = 100;

export default async function ContentReportsPage() {
  const [session, reports, mediaReports] = await Promise.all([
    currentSession(),
    Promise.resolve(listContentReports(appDb(), REPORT_ROWS)),
    Promise.resolve(listMediaReports(appDb(), REPORT_ROWS)),
  ]);
  const db = corpusDb();
  const judgments = new Map(
    listJudgmentIdentities(db, [
      ...new Set([...reports, ...mediaReports].map(({ judgmentId }) => judgmentId)),
    ]).map((item) => [item.id, item] as const),
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
        <h2 className={styles.sectionTitle}>{admin.sentenceReportsTitle}</h2>
        {reports.length === 0 ? (
          <p className={styles.empty}>{admin.sentenceReportsEmpty}</p>
        ) : (
          <SentenceReportsTable
            at={at}
            canManage={canManage}
            judgments={judgments}
            reports={reports}
            sentences={sentences}
          />
        )}
      </Card>
      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.mediaReportsTitle}</h2>
        {mediaReports.length === 0 ? (
          <p className={styles.empty}>{admin.mediaReportsEmpty}</p>
        ) : (
          <MediaReportsTable
            at={at}
            canManage={canManage}
            judgments={judgments}
            reports={mediaReports}
          />
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
