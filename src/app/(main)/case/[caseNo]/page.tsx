import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { LevelTabs } from "@/components/viewer/level-tabs";
import { toLevel, type ViewLevel } from "@/components/viewer/levels";
import { OriginalPanel } from "@/components/viewer/original-panel";
import { RenditionSection } from "@/components/viewer/rendition-section";
import type { PlaceholderState } from "@/components/viewer/rendition-state";
import { SummaryCard } from "@/components/viewer/summary-card";
import { TableOfContents } from "@/components/wiki/toc";
import { corpusDb } from "@/db/client";
import {
  findGenerationProgress,
  findJudgmentByCaseNo,
  findLatestRendition,
  findRendition,
  listSentences,
  listSpans,
} from "@/db/corpus/repository";
import { formatDate } from "@/lib/format";
import type { Citation } from "@/lib/law-citation/detect";
import { braille as brailleStrings, viewer } from "@/lib/strings";
import { detectHeadings } from "@/lib/text/headings";
import { findCitations } from "@/server/citations";
import { generationBudget, PIPELINE_VERSION, REQUEST_LIMIT_REASON } from "@/server/generate";
import { ensureJudgmentText, lookupCase } from "@/server/lookup";
import { llmConfig, siteTimeZone } from "@/server/settings";
import { requestGeneration } from "./actions";
import styles from "./page.module.css";

/**
 * 만들기 버튼 자리가 무엇을 말해야 하나.
 *
 * 다섯 가지가 다르다 — 생성기가 꺼진 것, 오늘 몫이 없는 것, 지금 만들고 있는 것,
 * 실패한 것, 아직 아무도 안 만든 것. 뭉뚱그리면 **눌러도 되는지**를 알 수 없다.
 *
 * 그리는 일은 `components/viewer/rendition-section.tsx`가 한다(올린 판결문과 같은 것을
 * 쓴다). 여기서는 **무엇을 그릴지만** 정한다 — 공개 판례에만 있는 규칙이 여기 붙는다.
 */
function placeholderState(
  judgmentId: string | null,
  level: Exclude<ViewLevel, "L0">,
): PlaceholderState {
  if (llmConfig() === undefined) {
    return { kind: "off" };
  }
  // 코퍼스에 판결문이 없으면 걸릴 작업도 없다. 이 경우 만들기 버튼이 액션에서 막힌다.
  if (judgmentId === null) {
    return { kind: "ready" };
  }

  /*
   * 만들고 있는 작업이 먼저다. 오늘 몫이 없어도 이미 돌고 있는 것은 끝난다 —
   * 그 사람에게 "몫이 없어요"라고 말하면 눈앞에서 만들어지는 것과 어긋난다.
   */
  const progress = findGenerationProgress(corpusDb(), {
    judgmentId,
    level,
    promptVersion: PIPELINE_VERSION,
  });
  if (progress?.status === "running" || progress?.status === "queued") {
    return { kind: "running", stage: progress.stage };
  }

  // 상한은 만들려는 사람에게만 의미가 있다. 생성기가 꺼져 있으면 세어 볼 것도 없다.
  if (generationBudget().remaining <= 0) {
    return { kind: "limited" };
  }
  if (progress?.status === "failed") {
    if (progress.error === REQUEST_LIMIT_REASON) {
      return { kind: "limited" };
    }
    return { kind: "failed", reason: progress.error };
  }
  return { kind: "ready" };
}

/**
 * 원문 칸.
 *
 * 목차는 여기 있지 않다 — 문서 앞으로 올렸다(위키식). 2단 대조에서 원문 칸 안에 두면
 * 설명을 읽는 사람에게는 목차가 없는 것과 같다.
 */
function OriginalSection({
  spans,
  citations,
  decidedAt,
  reason,
}: {
  spans: readonly { id: string; paraIdx: number; text: string }[];
  citations: ReadonlyMap<string, readonly Citation[]>;
  decidedAt: Date | null;
  /** 원문을 못 가져왔으면 그 이유. 가져왔으면 null. */
  reason: string | null;
}) {
  if (reason !== null) {
    return <p className={styles.notice}>{reason}</p>;
  }

  return <OriginalPanel citations={citations} decidedAt={decidedAt} spans={spans} />;
}

/**
 * 화면 하나에 필요한 것을 한 번에 읽는다.
 *
 * 인용 찾기를 **여기서 한 번에** 한다. 문장마다 컴포넌트 안에서 찾으면 사전 조회가
 * 문장 수만큼 붙는다(§10.2 N+1 금지).
 */
function loadJudgment(caseNoCanonical: string, level: ViewLevel) {
  const db = corpusDb();
  const row = findJudgmentByCaseNo(db, caseNoCanonical);
  const spans = row === undefined ? [] : listSpans(db, row.id);

  /*
   * 현재 파이프라인 버전을 먼저 찾는다. 아직 새 버전을 만들지 않았다면 가장 최근 과거
   * 설명을 버리지 않고 보여 주되 `outdatedAt`으로 구분한다([F-44]).
   */
  const currentRendition =
    row === undefined || level === "L0"
      ? undefined
      : findRendition(db, row.id, level, PIPELINE_VERSION);
  const rendition =
    currentRendition ??
    (row === undefined || level === "L0" ? undefined : findLatestRendition(db, row.id, level));

  return {
    row,
    spans,
    citations: new Map(spans.map((span) => [span.id, findCitations(span.text)])),
    sentences: rendition === undefined ? [] : listSentences(db, rendition.id),
    outdatedAt:
      currentRendition === undefined && rendition !== undefined ? rendition.generatedAt : null,
    /*
     * 원문의 `【주 문】` 같은 표제가 목차의 뼈대다(`DESIGN.md` §11.5).
     * 판결문은 짧아도 수십 문장이고, 읽는 사람이 찾는 것은 대개 한 구간이다.
     */
    headings: detectHeadings(spans),
  };
}

/** 조회는 됐지만 공개본이 없거나 API가 막힌 경우. 자세한 안내는 검색 화면이 맡는다. */
function NotAvailable({ query }: { query: string }) {
  return (
    <div className={styles.page}>
      <Alert
        actions={
          <ButtonLink href={`/search?q=${encodeURIComponent(query)}`}>
            {viewer.seeSearchResult}
          </ButtonLink>
        }
        title={viewer.notAvailableTitle}
        tone="warning"
      >
        {viewer.notAvailableBody}
      </Alert>
    </div>
  );
}

/**
 * 단계 스위처와 그 아래 한 줄. 어느 단계인지, 그 단계가 어떤 말로 쓰는지, 그리고
 * 점자로 가는 길.
 */
function ViewerNav({ basePath, level }: { basePath: string; level: ViewLevel }) {
  return (
    <div className={styles.levels}>
      <LevelTabs basePath={basePath} current={level} />
      {/* 고른 단계가 어떤 말로 쓰는지 한 줄로 알린다. 탭 이름만으로는 알 수 없다. */}
      <p className={styles.levelNote}>
        {viewer.levelNotes[level]}
        {/*
          점자는 **지금 보고 있는 단계 그대로** 넘어간다. 단계마다 문장이 다르므로
          "무엇을 점자로 바꿀 것인가"를 다시 묻지 않는다.
        */}
        <Link className={styles.brailleLink} href={`${basePath}/braille?level=${level}`}>
          {brailleStrings.cta}
        </Link>
      </p>
    </div>
  );
}

/**
 * 문서 목차. **문서 앞에 둔다**(`DESIGN.md` §11.5 · 위키식).
 *
 * 원문 칸 안에 있을 때는 2단 대조에서 오른쪽 칸에 갇혀, 왼쪽(설명)을 읽는 사람에게는
 * 없는 것과 같았다. 구간 앵커는 원문 쪽에 걸리지만 목차는 문서 전체의 길잡이다.
 *
 * 표제가 둘 이상일 때만 낸다 — 하나뿐이면 목차가 아니라 소음이다.
 */
function DocumentToc({ headings }: { headings: readonly { id: string; label: string }[] }) {
  if (headings.length <= 1) {
    return null;
  }

  return (
    <TableOfContents
      entries={headings.map((heading) => ({
        id: heading.id,
        label: heading.label,
        depth: 1 as const,
      }))}
      label={viewer.originalToc}
    />
  );
}

/**
 * 공개 판례 뷰어. `PAGES.md` §5
 *
 * 원문(L0)은 언제나 바로 보여 준다. 설명은 캐시가 있으면 즉시, 없으면 사용자가 요청할 때
 * 만든다(`PRODUCT.md` §5.1) — 아무도 안 볼 판례를 미리 만들지 않는다.
 */
export default async function CasePage(props: {
  params: Promise<{ caseNo: string }>;
  searchParams: Promise<{ level?: string | string[] }>;
}) {
  const [{ caseNo }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const decoded = decodeURIComponent(caseNo);
  const level = toLevel(searchParams.level);

  const result = await lookupCase(decoded);
  if (result.kind === "invalid") {
    notFound();
  }

  if (result.kind !== "found") {
    return <NotAvailable query={decoded} />;
  }

  const { summary } = result;
  const basePath = `/case/${encodeURIComponent(summary.caseNoCanonical)}`;
  const timeZone = siteTimeZone();
  const textResult = await ensureJudgmentText(summary.caseNoCanonical);
  const { row, spans, citations, sentences, headings, outdatedAt } = loadJudgment(
    summary.caseNoCanonical,
    level,
  );

  return (
    <div className={styles.page}>
      <SummaryCard
        caseName={summary.caseName}
        caseNoDisplay={summary.caseNoDisplay}
        caseType={summary.caseType}
        court={summary.court}
        decidedAt={summary.decidedAt}
        outcome={row?.outcome ?? "unknown"}
        sourceUrl={row?.sourceUrl ?? null}
        timeZone={timeZone}
      />

      <ViewerNav basePath={basePath} level={level} />

      <DocumentToc headings={headings} />

      <div className={styles.panels}>
        {level === "L0" ? null : (
          <RenditionSection
            action={requestGeneration}
            basePath={basePath}
            fields={{ caseNo: summary.caseNoCanonical }}
            level={level}
            outdatedAt={outdatedAt === null ? null : formatDate(outdatedAt, timeZone)}
            progressPath={`/api/generation/case/${encodeURIComponent(summary.caseNoCanonical)}/${level}`}
            sentences={sentences}
            state={placeholderState(row?.id ?? null, level)}
          />
        )}

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{viewer.originalPanel}</h2>
          <OriginalSection
            citations={citations}
            decidedAt={summary.decidedAt}
            reason={textResult.ok ? null : textResult.reason}
            spans={spans}
          />
        </section>
      </div>
    </div>
  );
}
