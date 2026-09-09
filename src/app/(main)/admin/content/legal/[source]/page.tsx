import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { appDb, legalDb } from "@/db/client";
import { listLegalDetailOverview } from "@/db/legal/detail-revisions";
import { formatDateTime } from "@/lib/format";
import { TARGETS } from "@/lib/law-api/targets";
import { isLegalSyncSource } from "@/server/legal-sync";
import { siteTimeZone } from "@/server/settings";
import styles from "../../../admin.module.css";

const ROW_LIMIT = 100;
const HASH_LENGTH = 12;
const copy = {
  back: "자료 관리",
  intro: "최근에 확인한 상세자료 100건입니다. 본문 해시가 달라질 때만 새 판이 생깁니다.",
  empty: "저장한 상세자료가 없습니다.",
  columns: ["자료", "자료 키", "현재 해시", "원본 크기", "확인 시각", "판"],
  noTitle: "제목 없음",
} as const;

export default async function LegalDetailListPage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  if (!isLegalSyncSource(source)) {
    notFound();
  }
  const rows = listLegalDetailOverview(legalDb(), source, ROW_LIMIT);
  const timeZone = siteTimeZone(appDb());
  const at = (value: Date) => formatDateTime(value, timeZone);
  const label = TARGETS[source].label;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p>
          <Link className={styles.link} href="/admin/content">
            {copy.back}
          </Link>
        </p>
        <h1 className={styles.title}>{`${label} 상세 원문판`}</h1>
        <p className={styles.intro}>{copy.intro}</p>
      </header>

      <Card as="section" className={styles.usage}>
        {rows.length === 0 ? (
          <p className={styles.empty}>{copy.empty}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {copy.columns.map((column) => (
                    <th scope="col" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title ?? copy.noTitle}</td>
                    <td className={styles.errorPath}>{row.detailKey}</td>
                    <td className={styles.errorCode} title={row.payloadHash}>
                      {row.payloadHash.slice(0, HASH_LENGTH)}
                    </td>
                    <td>{`${row.originalBytes.toLocaleString()} bytes`}</td>
                    <td>{at(row.fetchedAt)}</td>
                    <td>
                      <Link
                        className={styles.link}
                        href={`/admin/content/legal/${source}/${row.id}`}
                      >
                        {`${row.revisions.toLocaleString()}판 보기`}
                      </Link>
                    </td>
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

export const dynamic = "force-dynamic";

export const metadata = {
  title: "법령 상세 원문판 · 관리자",
  robots: { index: false, follow: false },
};
