import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PaperFigure } from "@/components/ui/paper-figure";
import { LevelTabs } from "@/components/viewer/level-tabs";
import { toLevel } from "@/components/viewer/levels";
import { OriginalPanel } from "@/components/viewer/original-panel";
import { SummaryCard } from "@/components/viewer/summary-card";
import { corpusDb } from "@/db/client";
import { findJudgmentByCaseNo, listSpans } from "@/db/corpus/repository";
import { viewer } from "@/lib/strings";
import { findCitations } from "@/server/citations";
import { ensureJudgmentText, lookupCase } from "@/server/lookup";
import { llmConfig, siteTimeZone } from "@/server/settings";
import styles from "./page.module.css";

/**
 * 설명이 아직 없을 때. 생성기가 꺼져 있으면 그 사실을 숨기지 않는다.
 *
 * 지금은 이 상태가 사용자가 가장 자주 보는 화면이라(LLM이 아직 연결되지 않았다)
 * 안내 상자 하나로 끝내지 않고 자리를 갖춘 빈 상태로 그린다. 옆 칸에는 원문이 있으니
 * "아무것도 없는 화면"은 아니라는 것도 함께 보여야 한다.
 */
function RenditionPlaceholder() {
  const ready = llmConfig() !== undefined;
  return (
    <div className={styles.empty}>
      <PaperFigure mood="empty" />
      <h3 className={styles.emptyTitle}>
        {ready ? viewer.generateHint : viewer.generatorOffTitle}
      </h3>
      <p className={styles.emptyBody}>{ready ? viewer.generateBody : viewer.generatorOffBody}</p>
    </div>
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
    // 조회는 됐지만 공개본이 없거나 API가 막힌 경우. 자세한 안내는 검색 화면이 맡는다.
    return (
      <div className={styles.page}>
        <Alert
          actions={
            <ButtonLink href={`/search?q=${encodeURIComponent(decoded)}`}>
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

  const { summary } = result;
  const textResult = await ensureJudgmentText(summary.caseNoCanonical);

  const db = corpusDb();
  const row = findJudgmentByCaseNo(db, summary.caseNoCanonical);
  const spans = row === undefined ? [] : listSpans(db, row.id);

  /*
   * 인용 찾기를 **여기서 한 번에** 한다. 문장마다 컴포넌트 안에서 찾으면 사전 조회가
   * 문장 수만큼 붙는다. 결과는 span id로 묶어 넘긴다.
   */
  const citations = new Map(spans.map((span) => [span.id, findCitations(span.text)]));

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
        timeZone={siteTimeZone()}
      />

      <div className={styles.levels}>
        <LevelTabs caseNoCanonical={summary.caseNoCanonical} current={level} />
        {/* 고른 단계가 어떤 말로 쓰는지 한 줄로 알린다. 탭 이름만으로는 알 수 없다. */}
        <p className={styles.levelNote}>{viewer.levelNotes[level]}</p>
      </div>

      <div className={styles.panels}>
        {level === "L0" ? null : (
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{viewer.renditionPanel}</h2>
            <RenditionPlaceholder />
          </section>
        )}

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{viewer.originalPanel}</h2>
          {textResult.ok ? (
            <OriginalPanel citations={citations} decidedAt={summary.decidedAt} spans={spans} />
          ) : (
            <p className={styles.notice}>{textResult.reason}</p>
          )}
        </section>
      </div>
    </div>
  );
}
