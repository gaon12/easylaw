import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Infobox } from "@/components/ui/infobox";
import { OriginalPanel } from "@/components/viewer/original-panel";
import { findUploadForOwner, listMaskCounts, listUploadSpans } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { daysUntil, formatDate } from "@/lib/format";
import { doc, upload, viewer } from "@/lib/strings";
import { currentOwnerId } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import { purgeExpiredUploads } from "@/server/upload";
import { deleteDoc } from "./actions";
import styles from "./page.module.css";

/** 보관 기한 안내. 기한이 없으면 없다고 말한다 — 빈칸은 안내가 아니다. */
function retentionNotice(retentionUntil: Date | null, timeZone: string): string {
  if (retentionUntil === null) {
    return doc.retentionKeep;
  }
  const remaining = daysUntil(retentionUntil, new Date(), timeZone);
  return remaining <= 0
    ? doc.retentionToday
    : doc.retentionUntil(formatDate(retentionUntil, timeZone), remaining);
}

/**
 * 내 문서 뷰어. `PAGES.md` §5 · `PRODUCT.md` §6.1
 *
 * `/case/[caseNo]`와 달리 **비공개**다. 주소를 알아도 주인이 아니면 열리지 않고,
 * 검색 엔진에도 올리지 않는다. 없는 문서와 남의 문서를 구분하지 않는다 —
 * "그 문서는 있지만 당신 것이 아니다"라는 응답 자체가 정보다.
 */
export default async function DocPage(props: {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ again?: string | string[] }>;
}) {
  const [{ docId }, searchParams] = await Promise.all([props.params, props.searchParams]);

  // 쿠키를 먼저 읽는다. 이게 있어야 요청 시점 렌더로 바뀌고, 빌드 중에 DB를 열지 않는다.
  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    notFound();
  }

  // 기한이 지난 문서를 치운다. 약속한 날짜가 지났는데 열리면 약속을 어긴 것이다.
  purgeExpiredUploads(appDb());

  const db = appDb();
  const row = findUploadForOwner(db, docId, ownerId);
  if (row === undefined) {
    notFound();
  }

  const spans = listUploadSpans(db, docId);
  const masks = listMaskCounts(db, docId);
  const timeZone = siteTimeZone();
  const isAgain = searchParams.again !== undefined;

  return (
    <div className={styles.page}>
      {isAgain ? <Infobox title={upload.duplicateNotice}>{doc.maskHint}</Infobox> : null}

      <header className={styles.header}>
        <h1 className={styles.title}>{row.title}</h1>
        <p className={styles.meta}>
          {doc.uploadedAt(formatDate(row.uploadedAt, timeZone))}
          {doc.metaSeparator}
          {doc.charCount(row.charCount)}
        </p>
        <p className={styles.retention}>{retentionNotice(row.retentionUntil, timeZone)}</p>
      </header>

      <section className={styles.masks}>
        <h2 className={styles.sectionTitle}>{doc.maskTitle}</h2>
        {masks.length === 0 ? (
          <p className={styles.hint}>{doc.maskEmpty}</p>
        ) : (
          <>
            <ul className={styles.maskList}>
              {masks.map((mask) => (
                <li className={styles.maskItem} key={mask.kind}>
                  {doc.maskCount(doc.maskKinds[mask.kind], mask.count)}
                </li>
              ))}
            </ul>
            <p className={styles.hint}>{doc.maskHint}</p>
          </>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{viewer.originalPanel}</h2>
        <OriginalPanel spans={spans} />
      </section>

      <section className={styles.danger}>
        <h2 className={styles.sectionTitle}>{doc.deleteTitle}</h2>
        <p className={styles.hint}>{doc.deleteBody}</p>
        <form action={deleteDoc}>
          <input name="docId" type="hidden" value={docId} />
          <Button size="m" type="submit" variant="tertiary">
            {doc.deleteSubmit}
          </Button>
        </form>
      </section>
    </div>
  );
}

/** 검색 엔진에 올리지 않는다. 개인 문서다(`PAGES.md` §1). */
export const metadata = { robots: { index: false, follow: false } };
