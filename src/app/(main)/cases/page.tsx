import Link from "next/link";
import { SignInRequired } from "@/components/auth/sign-in-required";
import { ButtonLink } from "@/components/ui/button";
import { PaperFigure } from "@/components/ui/paper-figure";
import { listUploadsForOwner } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { daysUntil, formatDate } from "@/lib/format";
import { cases, doc } from "@/lib/strings";
import { currentOwnerId } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import { purgeExpiredUploads } from "@/server/upload";
import styles from "./page.module.css";

/**
 * 카드에 붙는 보관 안내. 목록에서도 언제 사라지는지 보여야 한다(`PAGES.md` §15).
 *
 * 시간대를 인자로 받는다. 설치할 때 고른 시간대로 세지 않으면 "1일 남았어요"가
 * 서버가 놓인 곳에 따라 달라진다.
 */
function retentionLabel(retentionUntil: Date | null, timeZone: string): string {
  if (retentionUntil === null) {
    return doc.retentionKeep;
  }
  const remaining = daysUntil(retentionUntil, new Date(), timeZone);
  return remaining <= 0
    ? doc.retentionToday
    : doc.retentionUntil(formatDate(retentionUntil, timeZone), remaining);
}

function Header() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{cases.title}</h1>
      <p className={styles.intro}>{cases.intro}</p>
    </header>
  );
}

/**
 * 내 문서함. `PAGES.md` §15
 *
 * 문서는 계정에 매인다. 로그인하지 않았으면 목록 대신 로그인 안내를 보여 준다 —
 * 빈 목록을 보여 주면 "문서가 사라졌다"고 읽힌다.
 *
 * 세 가지 상태를 각각 따로 돌려준다. 한 곳에서 조건을 겹쳐 쓰면 읽기 어려워지고,
 * "로그인 안 함"과 "문서 없음"은 실제로 다른 화면이다.
 */
export default async function CasesPage() {
  // 쿠키를 먼저 읽는다. 이게 있어야 요청 시점 렌더로 바뀌고, 빌드 중에 DB를 열지 않는다.
  const ownerId = await currentOwnerId();

  if (ownerId === undefined) {
    return (
      <div className={styles.page}>
        <Header />
        <SignInRequired title={cases.signInTitle}>{cases.signInBody}</SignInRequired>
      </div>
    );
  }

  // 기한이 지난 문서를 치운다. 목록을 그리기 전에 해야 지워질 문서가 잠깐 보이지 않는다.
  purgeExpiredUploads(appDb());
  const rows = listUploadsForOwner(appDb(), ownerId);
  const timeZone = siteTimeZone();

  if (rows.length === 0) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.empty}>
          {/* 빈 화면은 초대다. 그림 하나가 "고장난 게 아니라 아직 비어 있다"를 말해 준다. */}
          <PaperFigure mood="empty" />
          <h2 className={styles.emptyTitle}>{cases.emptyTitle}</h2>
          <p className={styles.intro}>{cases.emptyBody}</p>
          <ButtonLink href="/upload" size="m">
            {cases.uploadCta}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />
      <p className={styles.count}>{cases.count(rows.length)}</p>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li className={styles.card} key={row.id}>
            <Link className={styles.cardLink} href={`/doc/${row.id}`}>
              {row.title}
            </Link>
            <p className={styles.cardMeta}>
              {doc.uploadedAt(formatDate(row.uploadedAt, timeZone))}
              {doc.metaSeparator}
              {doc.charCount(row.charCount)}
            </p>
            <p className={styles.cardRetention}>{retentionLabel(row.retentionUntil, timeZone)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const metadata = { title: cases.title, robots: { index: false, follow: false } };
