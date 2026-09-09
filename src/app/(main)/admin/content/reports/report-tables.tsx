import Image from "next/image";
import Link from "next/link";
import type { listContentReports } from "@/db/app/content-reports";
import type { listMediaReports } from "@/db/app/media-reports";
import type { listJudgmentIdentities, listReportedSentenceDetails } from "@/db/corpus/repository";
import { findCaseMediaPlacement } from "@/lib/case-media";
import { admin } from "@/lib/strings";
import styles from "../../admin.module.css";
import { ReportStatusControl } from "./report-status-control";

type SentenceReport = ReturnType<typeof listContentReports>[number];
type MediaReport = ReturnType<typeof listMediaReports>[number];
type JudgmentIdentity = ReturnType<typeof listJudgmentIdentities>[number];
type SentenceDetail = ReturnType<typeof listReportedSentenceDetails>[number];

interface CommonProps {
  readonly judgments: ReadonlyMap<string, JudgmentIdentity>;
  readonly canManage: boolean;
  readonly at: (value: Date) => string;
}

function SentenceReportRow({
  item,
  judgment,
  sentence,
  canManage,
  at,
}: {
  item: SentenceReport;
  judgment?: JudgmentIdentity;
  sentence?: SentenceDetail;
  canManage: boolean;
  at: CommonProps["at"];
}) {
  return (
    <tr>
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
}

function SentenceReportsTable({
  reports,
  sentences,
  judgments,
  ...common
}: CommonProps & {
  reports: readonly SentenceReport[];
  sentences: ReadonlyMap<string, SentenceDetail>;
}) {
  return (
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
          {reports.map((item) => (
            <SentenceReportRow
              {...common}
              item={item}
              judgment={judgments.get(item.judgmentId)}
              key={item.id}
              sentence={sentences.get(item.sentenceId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediaReportRow({
  item,
  judgment,
  canManage,
  at,
}: {
  item: MediaReport;
  judgment?: JudgmentIdentity;
  canManage: boolean;
  at: CommonProps["at"];
}) {
  const placement = findCaseMediaPlacement(item.placementId);
  return (
    <tr>
      <td>{at(item.createdAt)}</td>
      <td>
        {judgment === undefined ? (
          admin.reportMissingDocument
        ) : (
          <Link
            className={styles.link}
            href={`/case/${encodeURIComponent(judgment.caseNoCanonical)}?level=${placement?.level ?? "L4"}`}
          >
            {judgment.caseNoDisplay}
          </Link>
        )}
      </td>
      <td>
        {admin.mediaReportReasons[item.reason]}
        {item.detail === null ? null : <p className={styles.hint}>{item.detail}</p>}
      </td>
      <td>
        {placement === undefined ? (
          admin.reportMissingMedia
        ) : (
          <div className={styles.reportMedia}>
            <Image
              alt={placement.alt}
              height={90}
              src={placement.src}
              unoptimized={true}
              width={120}
            />
            <span>{placement.caption}</span>
            <code>{item.recipeKey}</code>
          </div>
        )}
      </td>
      <td>
        {canManage ? (
          <ReportStatusControl kind="media" reportId={item.id} status={item.status} />
        ) : (
          admin.reportStatuses[item.status]
        )}
      </td>
    </tr>
  );
}

function MediaReportsTable({
  reports,
  judgments,
  ...common
}: CommonProps & { reports: MediaReport[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{admin.reportColumns.at}</th>
            <th scope="col">{admin.reportColumns.document}</th>
            <th scope="col">{admin.reportColumns.reason}</th>
            <th scope="col">{admin.reportColumns.media}</th>
            <th scope="col">{admin.reportColumns.status}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((item) => (
            <MediaReportRow
              {...common}
              item={item}
              judgment={judgments.get(item.judgmentId)}
              key={item.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { MediaReportsTable, SentenceReportsTable };
