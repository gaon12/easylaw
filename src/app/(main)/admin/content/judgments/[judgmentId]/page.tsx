import Link from "next/link";
import { notFound } from "next/navigation";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appDb, corpusDb } from "@/db/client";
import {
  findContentReleaseBundle,
  findJudgmentById,
  listContentReleases,
  listJudgmentRevisionSummaries,
  listRenditionReleaseOverview,
  listSentences,
  listSpans,
  type ReleaseState,
  type RenditionReleaseOverview,
} from "@/db/corpus/repository";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import { diffParagraphs, type Paragraph } from "@/lib/text/revision-diff";
import { siteTimeZone } from "@/server/settings";
import styles from "../../../admin.module.css";
import { ReleaseComparison } from "./release-comparison";
import { ReleaseControls, RestoreReleaseControl } from "./release-controls";

interface SearchParams {
  readonly from?: string | string[];
  readonly to?: string | string[];
  readonly releaseFrom?: string | string[];
  readonly releaseTo?: string | string[];
}

interface RevisionView {
  readonly id: string;
  readonly contentHash: string | null;
  readonly fetchedAt: Date;
  readonly createdAt: Date;
  readonly spans: number;
}

interface DiffRow {
  readonly key: string;
  readonly before?: Paragraph;
  readonly after?: Paragraph;
  readonly changed: boolean;
}

const HASH_PREVIEW_LENGTH = 12;
const HASH_OPTION_LENGTH = 10;
const RELEASE_ID_LENGTH = 8;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function paragraphsFor(spans: ReturnType<typeof listSpans>): Paragraph[] {
  const grouped = new Map<number, string[]>();
  for (const span of spans) {
    const sentences = grouped.get(span.paraIdx) ?? [];
    sentences.push(span.text);
    grouped.set(span.paraIdx, sentences);
  }
  return [...grouped].map(([index, sentences]) => ({ index, text: sentences.join(" ") }));
}

function rowsFor(chunks: ReturnType<typeof diffParagraphs>["chunks"]): DiffRow[] {
  const rows: DiffRow[] = [];
  let index = 0;
  while (index < chunks.length) {
    const chunk = chunks[index];
    if (chunk === undefined) {
      break;
    }
    if (chunk.kind === "same") {
      rows.push(
        ...chunk.paragraphs.map((paragraph) => ({
          key: `same-${rows.length}-${paragraph.index}`,
          before: paragraph,
          after: paragraph,
          changed: false,
        })),
      );
      index += 1;
      continue;
    }

    let removed: readonly Paragraph[] = [];
    let added: readonly Paragraph[] = [];
    if (chunk.kind === "removed") {
      removed = chunk.paragraphs;
    } else {
      added = chunk.paragraphs;
    }
    const next = chunks[index + 1];
    if (chunk.kind === "removed" && next?.kind === "added") {
      added = next.paragraphs;
      index += 1;
    }
    const length = Math.max(removed.length, added.length);
    for (let offset = 0; offset < length; offset += 1) {
      rows.push({
        key: `changed-${rows.length}`,
        before: removed[offset],
        after: added[offset],
        changed: true,
      });
    }
    index += 1;
  }
  return rows;
}

function revisionLabel(revision: RevisionView, at: (value: Date) => string): string {
  const hash = revision.contentHash?.slice(0, HASH_OPTION_LENGTH) ?? admin.revisionLegacy;
  return `${at(revision.fetchedAt)} · ${hash}`;
}

function RevisionTable({
  revisions,
  currentRevisionId,
  judgmentId,
  at,
}: {
  revisions: readonly RevisionView[];
  currentRevisionId: string | null;
  judgmentId: string;
  at: (value: Date) => string;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{admin.revisionColumns.order}</th>
            <th scope="col">{admin.revisionColumns.fetchedAt}</th>
            <th scope="col">{admin.revisionColumns.spans}</th>
            <th scope="col">{admin.revisionColumns.hash}</th>
            <th scope="col">{admin.revisionColumns.action}</th>
          </tr>
        </thead>
        <tbody>
          {revisions.map((revision, index) => {
            const older = revisions[index + 1];
            return (
              <tr key={revision.id}>
                <td>
                  {revisions.length - index}
                  {revision.id === currentRevisionId ? (
                    <span className={styles.currentMark}>{admin.revisionCurrent}</span>
                  ) : null}
                </td>
                <td>{at(revision.fetchedAt)}</td>
                <td>{revision.spans.toLocaleString()}</td>
                <td title={revision.contentHash ?? admin.revisionLegacy}>
                  {revision.contentHash?.slice(0, HASH_PREVIEW_LENGTH) ?? admin.revisionLegacy}
                </td>
                <td>
                  {older === undefined ? (
                    "—"
                  ) : (
                    <Link
                      className={styles.link}
                      href={`/admin/content/judgments/${judgmentId}?from=${older.id}&to=${revision.id}`}
                    >
                      {admin.revisionCompare}
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ParagraphCell({
  paragraph,
  changed,
  added,
}: {
  paragraph?: Paragraph;
  changed: boolean;
  added: boolean;
}) {
  let className: string | undefined;
  if (changed && paragraph) {
    className = added ? styles.diffAdded : styles.diffRemoved;
  }
  return (
    <td className={className}>
      {paragraph === undefined ? null : (
        <>
          <span className={styles.paragraphNumber}>{`문단 ${paragraph.index + 1}`}</span>
          {paragraph.text}
        </>
      )}
    </td>
  );
}

function DiffTable({ rows }: { rows: readonly DiffRow[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={`${styles.table} ${styles.diffTable}`}>
        <thead>
          <tr>
            <th scope="col">{admin.revisionOldText}</th>
            <th scope="col">{admin.revisionNewText}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <ParagraphCell added={false} changed={row.changed} paragraph={row.before} />
              <ParagraphCell added={true} changed={row.changed} paragraph={row.after} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Comparison({
  revisions,
  from,
  to,
  comparison,
  at,
}: {
  revisions: readonly RevisionView[];
  from?: RevisionView;
  to?: RevisionView;
  comparison?: ReturnType<typeof diffParagraphs>;
  at: (value: Date) => string;
}) {
  if (revisions.length < 2) {
    return <p className={styles.empty}>{admin.revisionNoDiff}</p>;
  }
  return (
    <>
      <form className={styles.compareForm} method="get">
        {(
          [
            { name: "from", label: admin.revisionFrom, selected: from?.id },
            { name: "to", label: admin.revisionTo, selected: to?.id },
          ] as const
        ).map((field) => (
          <label className={styles.field} key={field.name} htmlFor={field.name}>
            <span className={styles.label}>{field.label}</span>
            <NativeSelect
              className={styles.select}
              defaultValue={field.selected}
              name={field.name}
              id={field.name}
            >
              {revisions.map((revision) => (
                <option key={revision.id} value={revision.id}>
                  {revisionLabel(revision, at)}
                </option>
              ))}
            </NativeSelect>
          </label>
        ))}
        <Button type="submit" variant="secondary">
          {admin.revisionCompareAction}
        </Button>
      </form>
      {comparison === undefined ? null : (
        <>
          <p className={styles.diffSummary} aria-live="polite">
            <span>{`${admin.revisionSame} ${comparison.unchanged.toLocaleString()}개`}</span>
            <span>{`${admin.revisionRemoved} ${comparison.removed.toLocaleString()}개`}</span>
            <span>{`${admin.revisionAdded} ${comparison.added.toLocaleString()}개`}</span>
          </p>
          <DiffTable rows={rowsFor(comparison.chunks)} />
        </>
      )}
    </>
  );
}

const releaseTone = (state: ReleaseState) => {
  if (state === "published") {
    return "grounded" as const;
  }
  if (state === "draft" || state === "reviewing") {
    return "needs-check" as const;
  }
  if (state === "stale" || state === "rejected") {
    return "ungrounded" as const;
  }
  return "neutral" as const;
};

function ReleaseCheck({ row }: { row: RenditionReleaseOverview }) {
  if (row.ungrounded > 0) {
    return <Badge tone="ungrounded">{admin.releaseUngrounded(row.ungrounded)}</Badge>;
  }
  if (row.needsCheck > 0) {
    return <Badge tone="needs-check">{admin.releaseNeedsCheck(row.needsCheck)}</Badge>;
  }
  if (row.sentences > 0) {
    return <Badge tone="grounded">{admin.releaseGrounded}</Badge>;
  }
  return "—";
}

function ReleaseTableRow({
  row,
  judgmentId,
  caseNo,
  at,
  preview,
}: {
  row: RenditionReleaseOverview;
  judgmentId: string;
  caseNo: string;
  at: (value: Date) => string;
  preview: ReturnType<typeof listSentences>;
}) {
  return (
    <tr>
      <th scope="row">{row.level}</th>
      <td>
        <Badge tone={releaseTone(row.state)}>{admin.releaseStates[row.state]}</Badge>
      </td>
      <td>
        {row.latest === undefined ? (
          admin.releaseNoRendition
        ) : (
          <div className={styles.releaseLatest}>
            <span>{at(row.latest.generatedAt)}</span>
            <span>{admin.releaseSentenceCount(row.sentences)}</span>
            <details>
              <summary>{admin.releasePreview}</summary>
              <ol className={styles.releasePreview}>
                {preview.map((sentence) => (
                  <li key={sentence.id}>{sentence.text}</li>
                ))}
              </ol>
            </details>
          </div>
        )}
      </td>
      <td>
        <ReleaseCheck row={row} />
      </td>
      <td>
        <ReleaseControls
          judgmentId={judgmentId}
          latestRenditionId={row.latest?.id ?? null}
          level={row.level}
          publishBlocked={row.ungrounded > 0}
          publishedRenditionId={row.publishedRenditionId}
        />
        {row.state === "published" ? (
          <Link
            className={styles.link}
            href={`/case/${encodeURIComponent(caseNo)}?level=${row.level}`}
          >
            {admin.releasePublicView}
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

function ReleaseTable({
  rows,
  judgmentId,
  caseNo,
  at,
  previews,
}: {
  rows: readonly RenditionReleaseOverview[];
  judgmentId: string;
  caseNo: string;
  at: (value: Date) => string;
  previews: ReadonlyMap<string, ReturnType<typeof listSentences>>;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{admin.releaseColumns.level}</th>
            <th scope="col">{admin.releaseColumns.state}</th>
            <th scope="col">{admin.releaseColumns.generatedAt}</th>
            <th scope="col">{admin.releaseColumns.checks}</th>
            <th scope="col">{admin.releaseColumns.action}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ReleaseTableRow
              at={at}
              caseNo={caseNo}
              judgmentId={judgmentId}
              key={row.level}
              preview={row.latest === undefined ? [] : (previews.get(row.latest.id) ?? [])}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReleaseHistory({
  releases,
  currentReleaseId,
  currentRevisionId,
  judgmentId,
  at,
}: {
  releases: ReturnType<typeof listContentReleases>;
  currentReleaseId: string | null;
  currentRevisionId: string | null;
  judgmentId: string;
  at: (value: Date) => string;
}) {
  if (releases.length === 0) {
    return <p className={styles.empty}>{admin.releaseHistoryEmpty}</p>;
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{admin.releaseHistoryColumns.at}</th>
            <th scope="col">{admin.releaseHistoryColumns.action}</th>
            <th scope="col">{admin.releaseHistoryColumns.levels}</th>
            <th scope="col">{admin.releaseHistoryColumns.id}</th>
            <th scope="col">{admin.releaseHistoryColumns.actor}</th>
            <th scope="col">{admin.releaseHistoryColumns.restore}</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((release, index) => {
            const older = releases[index + 1];
            return (
              <tr key={release.id}>
                <td>{at(release.createdAt)}</td>
                <td>
                  {admin.releaseActions[release.action]}
                  {release.id === currentReleaseId ? (
                    <span className={styles.currentMark}>{admin.releaseCurrent}</span>
                  ) : null}
                </td>
                <td>
                  {release.levels.length > 0 ? release.levels.join(", ") : admin.releaseNoLevels}
                </td>
                <td title={release.id}>{release.id.slice(0, RELEASE_ID_LENGTH)}</td>
                <td>{release.actorId === null ? "—" : admin.releaseActor}</td>
                <td>
                  <div className={styles.rowActions}>
                    {older === undefined ? null : (
                      <Link
                        className={styles.link}
                        href={`?releaseFrom=${older.id}&releaseTo=${release.id}`}
                      >
                        {admin.releaseCompare}
                      </Link>
                    )}
                    <RestoreReleaseControl
                      disabled={
                        release.id === currentReleaseId ||
                        release.sourceRevisionId !== currentRevisionId
                      }
                      disabledTitle={
                        release.id === currentReleaseId
                          ? admin.releaseRestoreCurrent
                          : admin.releaseRestoreStale
                      }
                      judgmentId={judgmentId}
                      releaseId={release.id}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function JudgmentRevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ judgmentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { judgmentId } = await params;
  const requested = await searchParams;
  const db = corpusDb();
  const judgment = findJudgmentById(db, judgmentId);
  if (judgment === undefined) {
    notFound();
  }

  const revisions: RevisionView[] = listJudgmentRevisionSummaries(db, judgmentId);
  const releaseRows = listRenditionReleaseOverview(db, judgmentId);
  const releases = listContentReleases(db, judgmentId);
  const previews = new Map(
    releaseRows.flatMap((row) =>
      row.latest === undefined ? [] : [[row.latest.id, listSentences(db, row.latest.id)] as const],
    ),
  );
  const requestedFrom = one(requested.from);
  const requestedTo = one(requested.to);
  const to = revisions.find(({ id }) => id === requestedTo) ?? revisions[0];
  const toIndex = to === undefined ? -1 : revisions.findIndex(({ id }) => id === to.id);
  const from =
    revisions.find(({ id }) => id === requestedFrom && id !== to?.id) ??
    revisions[toIndex + 1] ??
    revisions.find(({ id }) => id !== to?.id);
  const comparison =
    from === undefined || to === undefined
      ? undefined
      : diffParagraphs(
          paragraphsFor(listSpans(db, judgmentId, from.id)),
          paragraphsFor(listSpans(db, judgmentId, to.id)),
        );
  const requestedReleaseFrom = one(requested.releaseFrom);
  const requestedReleaseTo = one(requested.releaseTo);
  const releaseTo =
    releases.find(({ id }) => id === requestedReleaseTo) ??
    releases.find(({ id }) => id === judgment.currentContentReleaseId) ??
    releases[0];
  const releaseToIndex =
    releaseTo === undefined ? -1 : releases.findIndex(({ id }) => id === releaseTo.id);
  const releaseFrom =
    releases.find(({ id }) => id === requestedReleaseFrom && id !== releaseTo?.id) ??
    releases[releaseToIndex + 1] ??
    releases.find(({ id }) => id !== releaseTo?.id);
  const fromReleaseBundle =
    releaseFrom === undefined
      ? undefined
      : findContentReleaseBundle(db, judgmentId, releaseFrom.id);
  const toReleaseBundle =
    releaseTo === undefined ? undefined : findContentReleaseBundle(db, judgmentId, releaseTo.id);
  const timeZone = siteTimeZone(appDb());
  const at = (value: Date) => formatDateTime(value, timeZone);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.link} href="/admin/content">
          {admin.revisionBack}
        </Link>
        <h1 className={styles.title}>{admin.revisionTitle}</h1>
        <p className={styles.intro}>{admin.revisionIntro}</p>
        <dl className={styles.revisionMeta}>
          <div>
            <dt>{admin.judgmentColumns.caseNo}</dt>
            <dd>{judgment.caseNoDisplay}</dd>
          </div>
          <div>
            <dt>{admin.judgmentColumns.court}</dt>
            <dd>{judgment.court ?? "—"}</dd>
          </div>
        </dl>
      </header>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.releaseTitle}</h2>
        <p className={styles.sectionBody}>{admin.releaseIntro}</p>
        <ReleaseTable
          at={at}
          caseNo={judgment.caseNoCanonical}
          judgmentId={judgmentId}
          previews={previews}
          rows={releaseRows}
        />
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.releaseHistory}</h2>
        <ReleaseHistory
          at={at}
          currentReleaseId={judgment.currentContentReleaseId}
          currentRevisionId={judgment.currentRevisionId}
          judgmentId={judgmentId}
          releases={releases}
        />
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.releaseCompareTitle}</h2>
        <ReleaseComparison
          at={at}
          from={fromReleaseBundle}
          releases={releases}
          to={toReleaseBundle}
        />
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.judgmentHistory}</h2>
        {revisions.length === 0 ? (
          <p className={styles.empty}>{admin.revisionEmpty}</p>
        ) : (
          <RevisionTable
            at={at}
            currentRevisionId={judgment.currentRevisionId}
            judgmentId={judgmentId}
            revisions={revisions}
          />
        )}
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.revisionCompareTitle}</h2>
        <Comparison at={at} comparison={comparison} from={from} revisions={revisions} to={to} />
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.revisionTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
