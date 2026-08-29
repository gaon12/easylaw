import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { PaperFigure } from "@/components/ui/paper-figure";
import { listUploadsForOwner } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { daysUntil, formatDate } from "@/lib/format";
import { cases, doc } from "@/lib/strings";
import { currentOwnerId } from "@/server/owner";
import { purgeExpiredUploads } from "@/server/upload";
import styles from "./page.module.css";

/** 카드에 붙는 보관 안내. 목록에서도 언제 사라지는지 보여야 한다(`PAGES.md` §15). */
function retentionLabel(retentionUntil: Date | null): string {
  if (retentionUntil === null) {
    return doc.retentionKeep;
  }
  const remaining = daysUntil(retentionUntil);
  return remaining <= 0
    ? doc.retentionToday
    : doc.retentionUntil(formatDate(retentionUntil), remaining);
}

/**
 * 내 문서함. `PAGES.md` §15
 *
 * 로그인이 없으므로 목록은 **이 브라우저**의 것이다. 그 사실을 화면에서 먼저 말한다 —
 * 다른 기기에서 열었을 때 목록이 비어 있는 이유를 사용자가 알 수 있어야 한다.
 */
export default async function CasesPage() {
  /*
   * 쿠키를 먼저 읽는다. 순서가 뒤바뀌면 안 되는 이유가 있다 — `cookies()`를 만나야
   * 이 라우트가 요청 시점 렌더로 바뀐다. DB를 먼저 건드리면 빌드 중 사전 렌더 단계에서
   * 데이터베이스를 열려다 실패한다.
   */
  const ownerId = await currentOwnerId();

  // 기한이 지난 문서를 치운다. 목록을 그리기 전에 해야 지워진 문서가 잠깐 보이지 않는다.
  purgeExpiredUploads(appDb());

  const rows = ownerId === undefined ? [] : listUploadsForOwner(appDb(), ownerId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{cases.title}</h1>
        <p className={styles.intro}>{cases.intro}</p>
      </header>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          {/* 빈 화면은 초대다. 그림 하나가 "고장난 게 아니라 아직 비어 있다"를 말해 준다. */}
          <PaperFigure mood="empty" />
          <h2 className={styles.emptyTitle}>{cases.emptyTitle}</h2>
          <p className={styles.intro}>{cases.emptyBody}</p>
          <ButtonLink href="/upload" size="m">
            {cases.uploadCta}
          </ButtonLink>
        </div>
      ) : (
        <>
          <p className={styles.count}>{cases.count(rows.length)}</p>
          <ul className={styles.list}>
            {rows.map((row) => (
              <li className={styles.card} key={row.id}>
                <Link className={styles.cardLink} href={`/doc/${row.id}`}>
                  {row.title}
                </Link>
                <p className={styles.cardMeta}>
                  {doc.uploadedAt(formatDate(row.uploadedAt))}
                  {doc.metaSeparator}
                  {doc.charCount(row.charCount)}
                </p>
                <p className={styles.cardRetention}>{retentionLabel(row.retentionUntil)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export const metadata = { title: cases.title, robots: { index: false, follow: false } };
