import Link from "next/link";
import { notFound } from "next/navigation";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appDb, legalDb } from "@/db/client";
import {
  findLegalDetailOverview,
  listLegalDetailRevisions,
  readLegalDetailRevisionJsonForDetail,
} from "@/db/legal/detail-revisions";
import { formatDateTime } from "@/lib/format";
import { TARGETS } from "@/lib/law-api/targets";
import { diffLegalPayload, type LegalDetailDiff } from "@/lib/legal-detail-diff";
import { isLegalSyncSource } from "@/server/legal-sync";
import { siteTimeZone } from "@/server/settings";
import styles from "../../../../admin.module.css";

const HASH_LENGTH = 12;
const VISIBLE_CHANGE_LIMIT = 1000;
const copy = {
  same: "같음",
  changed: "값 변경",
  added: "추가",
  removed: "삭제",
  tooManyTitle: "변경 항목이 많습니다",
  noChanges: "두 판의 필드 값이 같습니다.",
  diffColumns: ["JSON 경로", "이전 값", "새 값"],
  historyTitle: "원문판 이력",
  historyColumns: ["판", "받은 시각", "본문 해시", "원본 크기", "동작"],
  current: "현재판",
  comparePrevious: "이전판과 비교",
  comparisonTitle: "원문판 비교",
  noHistory: "비교할 과거판이 없습니다.",
  from: "이전판",
  to: "새판",
  compare: "비교하기",
  failedTitle: "원문판을 비교하지 못했습니다",
  failedDetail: "저장한 원문판을 풀거나 JSON으로 읽지 못했습니다.",
} as const;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function readPayload(source: string, detailId: string, revisionId: string): unknown | undefined {
  return readLegalDetailRevisionJsonForDetail(legalDb(), source, detailId, revisionId);
}

function DiffResult({ comparison }: { comparison: LegalDetailDiff }) {
  const visible = comparison.changes.slice(0, VISIBLE_CHANGE_LIMIT);
  return (
    <>
      <p className={styles.diffSummary} aria-live="polite">
        <span>{`${copy.same} ${comparison.unchanged.toLocaleString()}개`}</span>
        <span>{`${copy.changed} ${comparison.changed.toLocaleString()}개`}</span>
        <span>{`${copy.added} ${comparison.added.toLocaleString()}개`}</span>
        <span>{`${copy.removed} ${comparison.removed.toLocaleString()}개`}</span>
      </p>
      {comparison.changes.length > VISIBLE_CHANGE_LIMIT ? (
        <Alert tone="warning" title={copy.tooManyTitle}>
          {`전체 ${comparison.changes.length.toLocaleString()}개 중 앞의 ${VISIBLE_CHANGE_LIMIT.toLocaleString()}개를 표시합니다.`}
        </Alert>
      ) : null}
      {visible.length === 0 ? (
        <p className={styles.empty}>{copy.noChanges}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={`${styles.table} ${styles.legalDiffTable}`}>
            <thead>
              <tr>
                {copy.diffColumns.map((column) => (
                  <th scope="col" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((change) => (
                <tr key={change.path}>
                  <th className={styles.legalDiffPath} scope="row">
                    {change.path}
                  </th>
                  <td className={change.kind === "added" ? undefined : styles.diffRemoved}>
                    {change.before ?? "—"}
                  </td>
                  <td className={change.kind === "removed" ? undefined : styles.diffAdded}>
                    {change.after ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default async function LegalDetailRevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string; detailId: string }>;
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const { source, detailId } = await params;
  if (!isLegalSyncSource(source)) {
    notFound();
  }
  const db = legalDb();
  const detail = findLegalDetailOverview(db, source, detailId);
  if (detail === undefined) {
    notFound();
  }
  const revisions = listLegalDetailRevisions(db, source, detail.detailKey);
  const query = await searchParams;
  const fromId = one(query.from);
  const toId = one(query.to);
  const from = revisions.find((revision) => revision.id === fromId);
  const to = revisions.find((revision) => revision.id === toId);
  let comparison: LegalDetailDiff | undefined;
  let comparisonError: string | undefined;
  if (from !== undefined && to !== undefined && from.id !== to.id) {
    try {
      const before = readPayload(source, detailId, from.id);
      const after = readPayload(source, detailId, to.id);
      if (before !== undefined && after !== undefined) {
        comparison = diffLegalPayload(before, after);
      }
    } catch {
      comparisonError = copy.failedDetail;
    }
  }
  const timeZone = siteTimeZone(appDb());
  const at = (value: Date) => formatDateTime(value, timeZone);
  const label = TARGETS[source].label;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p>
          <Link className={styles.link} href={`/admin/content/legal/${source}`}>
            {`${label} 상세 원문판`}
          </Link>
        </p>
        <h1 className={styles.title}>{detail.title ?? `${label} ${detail.detailKey}`}</h1>
        <p
          className={styles.intro}
        >{`자료 키 ${detail.detailKey} · 현재 해시 ${detail.payloadHash.slice(0, HASH_LENGTH)}`}</p>
      </header>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{copy.historyTitle}</h2>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {copy.historyColumns.map((column) => (
                  <th scope="col" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision, index) => {
                const older = revisions[index + 1];
                return (
                  <tr key={revision.id}>
                    <td>
                      {revisions.length - index}
                      {revision.isCurrent ? (
                        <span className={styles.currentMark}>{copy.current}</span>
                      ) : null}
                    </td>
                    <td>{at(revision.fetchedAt)}</td>
                    <td className={styles.errorCode} title={revision.payloadHash}>
                      {revision.payloadHash.slice(0, HASH_LENGTH)}
                    </td>
                    <td>{`${revision.originalBytes.toLocaleString()} bytes`}</td>
                    <td>
                      {older === undefined ? (
                        "—"
                      ) : (
                        <Link className={styles.link} href={`?from=${older.id}&to=${revision.id}`}>
                          {copy.comparePrevious}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{copy.comparisonTitle}</h2>
        {revisions.length < 2 ? (
          <p className={styles.empty}>{copy.noHistory}</p>
        ) : (
          <form className={styles.compareForm} method="get">
            {(
              [
                { name: "from", label: copy.from, selected: from?.id ?? revisions[1]?.id },
                { name: "to", label: copy.to, selected: to?.id ?? revisions[0]?.id },
              ] as const
            ).map((field) => (
              <label className={styles.field} htmlFor={field.name} key={field.name}>
                <span className={styles.label}>{field.label}</span>
                <NativeSelect
                  className={styles.select}
                  defaultValue={field.selected}
                  id={field.name}
                  name={field.name}
                >
                  {revisions.map((revision) => (
                    <option key={revision.id} value={revision.id}>
                      {`${at(revision.fetchedAt)} · ${revision.payloadHash.slice(0, HASH_LENGTH)}`}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
            <Button type="submit" variant="secondary">
              {copy.compare}
            </Button>
          </form>
        )}
        {comparisonError === undefined ? null : (
          <Alert tone="danger" title={copy.failedTitle}>
            {comparisonError}
          </Alert>
        )}
        {comparison === undefined ? null : <DiffResult comparison={comparison} />}
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: "법령 원문판 비교 · 관리자",
  robots: { index: false, follow: false },
};
