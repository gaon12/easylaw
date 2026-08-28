import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Infobox } from "@/components/ui/infobox";
import { LevelTabs } from "@/components/viewer/level-tabs";
import { toLevel } from "@/components/viewer/levels";
import { OriginalPanel } from "@/components/viewer/original-panel";
import { SummaryCard } from "@/components/viewer/summary-card";
import { corpusDb } from "@/db/client";
import { findJudgmentByCaseNo, listSpans } from "@/db/corpus/repository";
import { hasLlm } from "@/lib/env";
import { viewer } from "@/lib/strings";
import { ensureJudgmentText, lookupCase } from "@/server/lookup";
import styles from "./page.module.css";

/** 설명이 아직 없을 때 보여 줄 안내. 생성기가 꺼져 있으면 그 사실을 숨기지 않는다. */
function RenditionPlaceholder() {
  const ready = hasLlm();
  return (
    <Infobox
      title={ready ? viewer.generateHint : viewer.generatorOffTitle}
      tone={ready ? "info" : "warning"}
    >
      {ready ? viewer.generateCta : viewer.generatorOffBody}
    </Infobox>
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
        <Infobox
          actions={
            <ButtonLink href={`/search?q=${encodeURIComponent(decoded)}`}>
              {viewer.seeSearchResult}
            </ButtonLink>
          }
          title={viewer.notAvailableTitle}
          tone="warning"
        >
          {viewer.notAvailableBody}
        </Infobox>
      </div>
    );
  }

  const { summary } = result;
  const textResult = await ensureJudgmentText(summary.caseNoCanonical);

  const db = corpusDb();
  const row = findJudgmentByCaseNo(db, summary.caseNoCanonical);
  const spans = row === undefined ? [] : listSpans(db, row.id);

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
      />

      <LevelTabs caseNoCanonical={summary.caseNoCanonical} current={level} />

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
            <OriginalPanel spans={spans} />
          ) : (
            <p className={styles.notice}>{textResult.reason}</p>
          )}
        </section>
      </div>
    </div>
  );
}
