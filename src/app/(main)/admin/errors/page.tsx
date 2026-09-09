import Link from "next/link";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listErrorEvents } from "@/db/app/error-events";
import { appDb } from "@/db/client";
import { formatDateTime } from "@/lib/format";
import { admin } from "@/lib/strings";
import { requireAdministrator } from "@/server/admin-access";
import { siteTimeZone } from "@/server/settings";
import styles from "../admin.module.css";

const ERROR_ROWS = 100;

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await requireAdministrator();
  const requestedCode = (await searchParams).code?.trim();
  const code = requestedCode === "" ? undefined : requestedCode;
  const db = appDb();
  const rows = listErrorEvents(db, { publicCode: code, limit: ERROR_ROWS });
  const timeZone = siteTimeZone(db);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.errorsTitle}</h1>
        <p className={styles.intro}>{admin.errorsIntro}</p>
      </header>

      <form className={styles.errorSearch} method="get">
        <span className={styles.errorSearchLabel}>{admin.errorsSearchLabel}</span>
        <Input
          aria-label={admin.errorsSearchLabel}
          className={styles.errorSearchInput}
          defaultValue={code}
          name="code"
          placeholder={admin.errorsSearchPlaceholder}
          spellCheck={false}
        />
        <Button size="s" type="submit">
          {admin.errorsSearch}
        </Button>
        {code === undefined ? null : (
          <Link className={styles.link} href="/admin/errors">
            {admin.errorsReset}
          </Link>
        )}
      </form>

      <Card as="section" className={styles.usage}>
        {rows.length === 0 ? (
          <p className={styles.empty}>
            {code === undefined ? admin.errorsEmpty : admin.errorsNoMatch}
          </p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{admin.errorColumns.at}</th>
                  <th scope="col">{admin.errorColumns.code}</th>
                  <th scope="col">{admin.errorColumns.source}</th>
                  <th scope="col">{admin.errorColumns.path}</th>
                  <th scope="col">{admin.errorColumns.cause}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt, timeZone)}</td>
                    <td>
                      <code className={styles.errorCode}>{row.publicCode}</code>
                    </td>
                    <td>{admin.errorSources[row.source]}</td>
                    <td>
                      <span className={styles.errorPath}>
                        {[row.method, row.requestPath ?? row.routePath].filter(Boolean).join(" ") ||
                          "—"}
                      </span>
                    </td>
                    <td>
                      <strong>{row.name}</strong>
                      <p className={styles.errorMessage}>{row.message}</p>
                      {row.stack === null ? null : (
                        <details>
                          <summary>{admin.errorStack}</summary>
                          <pre className={styles.errorStack}>{row.stack}</pre>
                        </details>
                      )}
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
  title: `${admin.errorsTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
