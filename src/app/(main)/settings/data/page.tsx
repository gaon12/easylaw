import Link from "next/link";
import { SignInRequired } from "@/components/auth/sign-in-required";
import { Card } from "@/components/ui/card";
import { PaperFigure } from "@/components/ui/paper-figure";
import { StructuredList } from "@/components/ui/structured-list";
import { listUploadsForOwner, summarizeOwnerData } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { daysUntil, formatDate } from "@/lib/format";
import { account, doc as docStrings, settings, data as strings } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import { purgeExpiredUploads } from "@/server/upload";
import { DangerForm } from "./danger-form";
import styles from "./page.module.css";
import { RetentionForm } from "./retention-form";

/**
 * 지금 언제까지 보관되는지. `/cases`가 카드에 쓰는 것과 같은 문구를 쓴다.
 *
 * 시간대를 인자로 받는다. 설치할 때 고른 시간대로 세지 않으면 "1일 남았어요"가
 * 서버가 놓인 곳에 따라 달라진다.
 */
function retentionLabel(retentionUntil: Date | null, timeZone: string): string {
  if (retentionUntil === null) {
    return docStrings.retentionKeep;
  }
  const remaining = daysUntil(retentionUntil, new Date(), timeZone);
  return remaining <= 0
    ? docStrings.retentionToday
    : docStrings.retentionUntil(formatDate(retentionUntil, timeZone), remaining);
}

/** 문서 한 줄. 제목·올린 날·지금 기한과, 기한을 바꾸는 폼. */
function DocRow({
  doc,
  timeZone,
}: {
  doc: { id: string; title: string; uploadedAt: Date; retentionUntil: Date | null };
  timeZone: string;
}) {
  return (
    <Card as="li" className={styles.docRow} padding="tight">
      <div className={styles.docHead}>
        {/* 제목을 누르면 그 문서로 간다. 여기서 지우려면 어느 문서인지 확인해야 한다. */}
        <Link className={styles.docTitle} href={`/doc/${doc.id}`}>
          {doc.title}
        </Link>
        <span className={styles.docMeta}>{formatDate(doc.uploadedAt, timeZone)}</span>
      </div>
      <RetentionForm docId={doc.id} label={retentionLabel(doc.retentionUntil, timeZone)} />
    </Card>
  );
}

/**
 * 내 자료. `PAGES.md` §17
 *
 * **처리방침이 약속한 것을 실제로 하는 자리다.** 처리방침은 "계정 전체를 지우는 기능은
 * 아직 준비 중"이라고 스스로 적어 두었다 — 자기 자료를 거두어 갈 방법이 없는 서비스에
 * 판결문을 맡길 이유가 없다.
 *
 * **`/settings`와 나눠 둔다.** 그 화면은 "이 브라우저에만 저장돼요"라고 못박은 곳이고
 * 로그인 없이도 쓴다. 서버에 저장된 자료를 그 안에 섞으면 그 말이 거짓이 된다.
 * 계정 설정(`/settings/account`)과도 나눈다 — 이름을 바꾸는 일과 자료를 지우는 일이
 * 같은 화면에 있으면, 이름을 고치러 온 사람이 삭제 버튼 옆에서 그 일을 하게 된다.
 */
export default async function DataSettingsPage() {
  // 쿠키를 먼저 읽는다. 이게 있어야 요청 시점 렌더로 바뀌고, 빌드 중에 DB를 열지 않는다.
  const session = await currentSession();

  if (session?.email == null) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{strings.title}</h1>
        <SignInRequired title={strings.signInTitle}>{strings.signInBody}</SignInRequired>
      </div>
    );
  }

  const db = appDb();
  // 기한이 지난 문서를 먼저 치운다. 여기서 이미 사라졌어야 할 문서를 보여 주면 안 된다.
  purgeExpiredUploads(db);

  const zone = siteTimeZone();
  const summary = summarizeOwnerData(db, session.userId);
  const docs = listUploadsForOwner(db, session.userId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{strings.title}</h1>
        <p className={styles.intro}>{strings.intro}</p>
      </header>

      <section className={styles.block}>
        <h2 className={styles.sectionTitle}>{strings.summaryHeading}</h2>
        <Card>
          <StructuredList
            rows={[
              { label: strings.docsLabel, value: strings.countItems(summary.docs) },
              { label: strings.sentencesLabel, value: strings.countSentences(summary.sentences) },
              /* 가린 내용 자체는 저장하지 않는다. 셀 수 있는 것은 건수뿐이다. */
              { label: strings.masksLabel, value: strings.countItems(summary.masks) },
            ]}
          />
        </Card>
      </section>

      {docs.length === 0 ? (
        <div className={styles.empty}>
          <PaperFigure mood="empty" />
          <h2 className={styles.sectionTitle}>{strings.emptyTitle}</h2>
          <p className={styles.body}>{strings.emptyBody}</p>
        </div>
      ) : (
        <>
          <section className={styles.block}>
            <h2 className={styles.sectionTitle}>{strings.retentionHeading}</h2>
            <p className={styles.body}>{strings.retentionIntro}</p>
            <ul className={styles.docList}>
              {docs.map((doc) => (
                <DocRow doc={doc} key={doc.id} timeZone={zone} />
              ))}
            </ul>
          </section>

          <DangerForm
            action="docs"
            body={strings.deleteDocsBody}
            cta={strings.deleteDocsCta}
            heading={strings.deleteDocsHeading}
          />
        </>
      )}

      <DangerForm
        action="account"
        body={strings.deleteAccountBody}
        cta={strings.deleteAccountCta}
        heading={strings.deleteAccountHeading}
      />

      <nav className={styles.links}>
        <Link className={styles.link} href="/cases">
          {strings.docsLink}
        </Link>
        <Link className={styles.link} href="/privacy">
          {strings.privacyLink}
        </Link>
        <Link className={styles.link} href="/settings/account">
          {account.title}
        </Link>
        <Link className={styles.link} href="/settings">
          {settings.title}
        </Link>
      </nav>
    </div>
  );
}

/** 검색 엔진에 올리지 않는다. 개인 자료 화면이다(`PAGES.md` §1). */
export const metadata = {
  title: strings.title,
  robots: { index: false, follow: false },
};
