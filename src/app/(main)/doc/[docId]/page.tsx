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
  findUploadJobProgress,
  findUploadRendition,
  listUploadSentences,
} from "@/db/app/generation";
import { findUploadForOwner, listMaskCounts, listUploadSpans } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { daysUntil, formatDate } from "@/lib/format";
import { braille as brailleStrings, doc, upload, viewer } from "@/lib/strings";
import { compactHeadingLabel, detectHeadings } from "@/lib/text/headings";
import type { MaskKind } from "@/lib/text/mask";
import { findCitations } from "@/server/citations";
import { generationBudget, PIPELINE_VERSION } from "@/server/generate";
import { currentOwnerId } from "@/server/owner";
import { llmConfig, siteTimeZone } from "@/server/settings";
import { purgeExpiredUploads } from "@/server/upload";
import { deleteDoc, requestDocGeneration } from "./actions";
import styles from "./page.module.css";

const MAX_TOC_DEPTH = 3;

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

/** 현행 검사를 통과한 설명만 읽는다. 과거 생성본은 감사 기록으로만 남긴다. */
function loadRendition(docId: string, level: ViewLevel) {
  if (level === "L0") {
    return { sentences: [], outdatedAt: null };
  }
  const db = appDb();
  const rendition = findUploadRendition(db, docId, level, PIPELINE_VERSION);
  return {
    sentences: rendition === undefined ? [] : listUploadSentences(db, rendition.id),
    outdatedAt: null,
  };
}

async function loadDocData(docId: string) {
  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    notFound();
  }
  purgeExpiredUploads(appDb());
  const db = appDb();
  const row = findUploadForOwner(db, docId, ownerId);
  if (row === undefined) {
    notFound();
  }
  return {
    row,
    spans: listUploadSpans(db, docId),
    masks: listMaskCounts(db, docId),
  };
}

function DocHeader({
  row,
  timeZone,
}: {
  row: NonNullable<ReturnType<typeof findUploadForOwner>>;
  timeZone: string;
}) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{row.title}</h1>
      <p className={styles.meta}>
        {doc.uploadedAt(formatDate(row.uploadedAt, timeZone))}
        {doc.metaSeparator}
        {doc.charCount(row.charCount)}
      </p>
      <p className={styles.retention}>{retentionNotice(row.retentionUntil, timeZone)}</p>
    </header>
  );
}

function DocLevelContent({
  basePath,
  docId,
  level,
  rendition,
  timeZone,
}: {
  basePath: string;
  docId: string;
  level: ViewLevel;
  rendition: ReturnType<typeof loadRendition>;
  timeZone: string;
}) {
  return (
    <>
      <div className={styles.levels}>
        <LevelTabs basePath={basePath} current={level} />
        <p className={styles.levelNote}>
          {viewer.levelNotes[level]}
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
    </>
  );
}

function DocOriginal({
  citations,
  headings,
  level,
  spans,
}: {
  citations: Map<string, ReturnType<typeof findCitations>>;
  headings: ReturnType<typeof detectHeadings>;
  level: ViewLevel;
  spans: ReturnType<typeof listUploadSpans>;
}) {
  return (
    <section className={styles.panel} data-viewer-pane={true}>
      <h2 className={styles.sectionTitle}>{viewer.originalPanel}</h2>
      {headings.length > 1 ? (
        <TableOfContents
          entries={headings
            .filter((heading) => heading.depth <= MAX_TOC_DEPTH)
            .map((heading) => ({
              id: heading.id,
              label: compactHeadingLabel(heading),
              depth: heading.depth,
            }))}
          label={viewer.originalToc}
        />
      ) : null}
      <OriginalPanel citations={citations} level={level} spans={spans} />
    </section>
  );
}

function DeleteDocPanel({ docId }: { docId: string }) {
  return (
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
  );
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
  const { masks, row, spans } = await loadDocData(docId);
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
      <DocHeader row={row} timeZone={timeZone} />
      <MaskSummary masks={masks} />
      <DocLevelContent
        basePath={basePath}
        docId={docId}
        level={level}
        rendition={rendition}
        timeZone={timeZone}
      />
      <DocOriginal citations={citations} headings={headings} level={level} spans={spans} />
      <DeleteDocPanel docId={docId} />
    </div>
  );
}

/** 검색 엔진에 올리지 않는다. 개인 문서다(`PAGES.md` §1). */
export const metadata = { robots: { index: false, follow: false } };
