import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Infobox } from "@/components/ui/infobox";
import { LevelTabs } from "@/components/viewer/level-tabs";
import { toLevel, type ViewLevel } from "@/components/viewer/levels";
import { OriginalPanel } from "@/components/viewer/original-panel";
import { RenditionSection } from "@/components/viewer/rendition-section";
import type { PlaceholderState } from "@/components/viewer/rendition-state";
import { TableOfContents } from "@/components/wiki/toc";
import {
  findLatestUploadRendition,
  findUploadJobProgress,
  findUploadRendition,
  listUploadSentences,
} from "@/db/app/generation";
import { findUploadForOwner, listMaskCounts, listUploadSpans } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { daysUntil, formatDate } from "@/lib/format";
import { braille as brailleStrings, doc, upload, viewer } from "@/lib/strings";
import { detectHeadings } from "@/lib/text/headings";
import type { MaskKind } from "@/lib/text/mask";
import { findCitations } from "@/server/citations";
import { generationBudget, PIPELINE_VERSION } from "@/server/generate";
import { currentOwnerId } from "@/server/owner";
import { llmConfig, siteTimeZone } from "@/server/settings";
import { purgeExpiredUploads } from "@/server/upload";
import { deleteDoc, requestDocGeneration } from "./actions";
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

/** 무엇을 몇 건 가렸는지. 가린 내용은 저장하지 않으므로 종류와 건수만 말한다. */
function MaskSummary({ masks }: { masks: readonly { kind: MaskKind; count: number }[] }) {
  return (
    <Card as="section" padding="tight">
      <h2 className={styles.sectionTitle}>{doc.maskTitle}</h2>
      {masks.length === 0 ? (
        <p className={styles.hint}>{doc.maskEmpty}</p>
      ) : (
        <>
          <ul className={styles.maskList}>
            {masks.map((mask) => (
              <li key={mask.kind}>
                {/* 무엇을 몇 개 가렸는지는 상태다 — 배지로 말한다(`DESIGN.md` §6). */}
                <Badge tone="grounded">{doc.maskCount(doc.maskKinds[mask.kind], mask.count)}</Badge>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>{doc.maskHint}</p>
        </>
      )}
    </Card>
  );
}

/**
 * 설명 칸이 무엇을 말해야 하나. 공개 판례 화면과 같은 판단을 한다.
 *
 * **올린 문서의 설명본은 나만의 것이다**(`PAGES.md` §5). 남이 만들어 둔 것을 물려받지
 * 않으므로 캐시가 있어도 이 사람 것뿐이다.
 */
function placeholderState(docId: string, level: Exclude<ViewLevel, "L0">): PlaceholderState {
  if (llmConfig() === undefined) {
    return { kind: "off" };
  }

  const progress = findUploadJobProgress(appDb(), {
    uploadId: docId,
    level,
    promptVersion: PIPELINE_VERSION,
  });
  if (progress?.status === "running" || progress?.status === "queued") {
    return { kind: "running", stage: progress.stage };
  }
  if (generationBudget().remaining <= 0) {
    return { kind: "limited" };
  }
  if (progress?.status === "failed") {
    return { kind: "failed", reason: progress.error };
  }
  return { kind: "ready" };
}

/** 현재 설명이 없으면 같은 레벨의 가장 최근 과거 설명을 읽고 그 생성 시각을 함께 알린다. */
function loadRendition(docId: string, level: ViewLevel) {
  if (level === "L0") {
    return { sentences: [], outdatedAt: null };
  }
  const db = appDb();
  const currentRendition = findUploadRendition(db, docId, level, PIPELINE_VERSION);
  const rendition = currentRendition ?? findLatestUploadRendition(db, docId, level);
  return {
    sentences: rendition === undefined ? [] : listUploadSentences(db, rendition.id),
    outdatedAt:
      currentRendition === undefined && rendition !== undefined ? rendition.generatedAt : null,
  };
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
  searchParams: Promise<{ again?: string | string[]; level?: string | string[] }>;
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

  /*
   * **올린 문서도 공개 판례와 같은 뷰어를 받는다.** 오히려 이쪽이 더 필요하다 —
   * 자기 사건 판결문을 읽는 사람이 「민사소송법 제420조」가 무슨 말인지 가장 알고 싶다.
   *
   * 인용 찾기를 여기서 한 번에 한다. 문장마다 하면 사전 조회가 문장 수만큼 붙는다(§10.2).
   */
  const citations = new Map(spans.map((span) => [span.id, findCitations(span.text)]));
  const headings = detectHeadings(spans);
  const timeZone = siteTimeZone();
  const isAgain = searchParams.again !== undefined;
  const level = toLevel(searchParams.level);
  const basePath = `/doc/${encodeURIComponent(docId)}`;
  const rendition = loadRendition(docId, level);

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

      <MaskSummary masks={masks} />

      <div className={styles.levels}>
        <LevelTabs basePath={basePath} current={level} />
        {/* 고른 단계가 어떤 말로 쓰는지 한 줄로 알린다. 탭 이름만으로는 알 수 없다. */}
        <p className={styles.levelNote}>
          {viewer.levelNotes[level]}
          {/* 점자 화면에서도 지금 보고 있는 설명 단계를 그대로 유지한다. */}
          <Link className={styles.brailleLink} href={`${basePath}/braille?level=${level}`}>
            {brailleStrings.cta}
          </Link>
        </p>
      </div>

      {level === "L0" ? null : (
        <RenditionSection
          action={requestDocGeneration}
          basePath={basePath}
          fields={{ docId }}
          level={level}
          outdatedAt={
            rendition.outdatedAt === null ? null : formatDate(rendition.outdatedAt, timeZone)
          }
          progressPath={`/api/generation/doc/${encodeURIComponent(docId)}/${level}`}
          sentences={rendition.sentences}
          state={placeholderState(docId, level)}
        />
      )}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{viewer.originalPanel}</h2>
        {/* 표제가 둘 이상일 때만 목차를 낸다 — 하나뿐이면 목차가 아니라 소음이다. */}
        {headings.length > 1 ? (
          <TableOfContents
            entries={headings.map((heading) => ({
              id: heading.id,
              label: heading.label,
              depth: 1 as const,
            }))}
            label={viewer.originalToc}
          />
        ) : null}
        {/*
          `decidedAt`을 주지 않는다. **올린 문서에는 선고일이 없다** — 법령 링크는 날짜 없이
          가고, 법령 화면이 "선고일을 알 수 없어 오늘 시행 중인 법을 보여 준다"고 말한다.
          모르는 날짜를 지어내 "판결 당시의 법"이라고 하는 것보다 낫다.
        */}
        <OriginalPanel citations={citations} level={level} spans={spans} />
      </section>

      <Card as="section" className={styles.danger} padding="tight">
        <h2 className={styles.sectionTitle}>{doc.deleteTitle}</h2>
        <p className={styles.hint}>{doc.deleteBody}</p>
        <form action={deleteDoc}>
          <input name="docId" type="hidden" value={docId} />
          <Button size="m" type="submit" variant="tertiary">
            {doc.deleteSubmit}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** 검색 엔진에 올리지 않는다. 개인 문서다(`PAGES.md` §1). */
export const metadata = { robots: { index: false, follow: false } };
