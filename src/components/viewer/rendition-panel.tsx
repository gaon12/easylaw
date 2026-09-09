import { Badge } from "@/components/ui/badge";
import type { CaseMediaPlacement } from "@/lib/case-media";
import { viewer } from "@/lib/strings";
import { ExplanationMedia } from "./explanation-media";
import { LevelBody } from "./level-body";
import type { ViewLevel } from "./levels";
import styles from "./rendition-panel.module.css";
import { renditionHeadingId } from "./rendition-toc";
import { SentenceReport } from "./sentence-report";
import { SpeechReader } from "./speech-reader";

interface Sentence {
  readonly id: string;
  readonly orderIdx?: number;
  readonly role: "heading" | "body" | "gloss";
  readonly text: string;
  readonly confidence: "grounded" | "needs_check" | "ungrounded";
  readonly checkReason: string | null;
  /** 낱말 뜻의 출처. 그 밖에는 null이다. */
  readonly source?: string | null;
  /** 이 설명이 나온 원문 span. 첫 span으로 이동하되, 근거가 없으면 액션을 내지 않는다. */
  readonly sourceSpanIds?: readonly string[];
}

interface IndexedSentence extends Sentence {
  readonly speechIndex: number;
}

interface ExplanationBlock {
  readonly id: string;
  readonly heading: IndexedSentence | null;
  readonly content: readonly IndexedSentence[];
}

/** 제목부터 다음 제목 직전까지를 하나의 이지리드 설명 블록으로 묶는다. */
function groupExplanationBlocks(sentences: readonly Sentence[]): ExplanationBlock[] {
  const blocks: { id: string; heading: IndexedSentence | null; content: IndexedSentence[] }[] = [];
  let current: (typeof blocks)[number] | undefined;

  sentences.forEach((sentence, speechIndex) => {
    const indexed = { ...sentence, speechIndex };
    if (sentence.role === "heading") {
      current = { id: sentence.id, heading: indexed, content: [] };
      blocks.push(current);
      return;
    }
    if (current === undefined) {
      current = { id: `intro-${sentence.id}`, heading: null, content: [] };
      blocks.push(current);
    }
    current.content.push(indexed);
  });

  return blocks;
}

/**
 * 생성된 설명. `PAGES.md` §5.2 · `DESIGN.md` §3.4
 *
 * **신뢰도를 문장 단위로 보여 준다.** 문서 전체에 배지 하나를 붙이면 어느 문장이 확인이
 * 필요한지 알 수 없고, 그러면 배지가 있으나 마나 하다.
 *
 * `needs_check`만 표시한다. `grounded`는 기본이라 배지를 붙일 이유가 없고,
 * `ungrounded`는 여기까지 오지 않는다 — 생성 단계가 막고 다시 만든다(`server/generate.ts`).
 * 그래도 혹시 들어오면 표시한다. 조용히 정상처럼 그리지 않는다.
 */
function ConfidenceMark({ sentence }: { sentence: Sentence }) {
  if (sentence.confidence === "grounded") {
    return null;
  }

  const needsCheck = sentence.confidence === "needs_check";
  const reason = sentence.checkReason ?? (needsCheck ? viewer.needsCheckHint : null);
  return (
    <span className={styles.mark}>
      <Badge tone={needsCheck ? "needs-check" : "ungrounded"}>
        {viewer.confidence[sentence.confidence]}
      </Badge>
      {reason === null ? null : <span className={styles.reason}>{reason}</span>}
    </span>
  );
}

/**
 * 낱말 뜻. **판결문이 아니라 사전에서 온 문장이다.**
 *
 * 그래서 신뢰도 배지를 붙이지 않는다 — 붙이면 "확인 필요"가 되는데, 확인할 원문이 애초에
 * 없다. 대신 **출처를 밝힌다.** 밝히지 않으면 모델이 지어낸 문장과 구분되지 않는다.
 */
function GlossRow({ sentence, index }: { sentence: Sentence; index: number }) {
  return (
    <p className={styles.gloss} data-speech-index={index}>
      <span className={styles.glossLabel}>{viewer.glossLabel}</span>
      <span className={styles.glossText}>{sentence.text}</span>
      {sentence.source === null || sentence.source === undefined ? null : (
        <span className={styles.glossSource}>{viewer.glossSource(sentence.source)}</span>
      )}
    </p>
  );
}

function RenditionPanel({
  level,
  sentences,
  needsCheckCount,
  media,
  reportable = false,
}: {
  level: ViewLevel;
  sentences: readonly Sentence[];
  needsCheckCount: number;
  media?: readonly CaseMediaPlacement[];
  reportable?: boolean;
}) {
  const mediaByHeading = new Map(media?.map((item) => [item.afterHeading, item]) ?? []);
  const blocks = groupExplanationBlocks(sentences);

  return (
    <SpeechReader texts={sentences.map((sentence) => sentence.text)}>
      <LevelBody level={level}>
        {/*
          원본이 아니라는 고지를 본문 **위**에 둔다(P1). 아래에 두면 다 읽은 뒤에야 보인다.
        */}
        <p className={styles.notice}>{viewer.notOriginal}</p>
        {needsCheckCount > 0 ? (
          <p className={styles.summary}>{viewer.needsCheckSummary(needsCheckCount)}</p>
        ) : null}
        <div className={styles.blocks}>
          {blocks.map((block) => {
            const blockMedia =
              block.heading === null ? undefined : mediaByHeading.get(block.heading.text);
            return (
              <section className={styles.block} key={block.id}>
                <div className={styles.blockContent}>
                  {block.heading === null ? null : (
                    <h3
                      className={styles.heading}
                      data-speech-index={block.heading.speechIndex}
                      id={renditionHeadingId(block.heading.id)}
                    >
                      {block.heading.text}
                    </h3>
                  )}
                  {blockMedia === undefined ? null : (
                    <ExplanationMedia media={blockMedia} reportable={reportable} />
                  )}
                  <div className={styles.blockText}>
                    {block.content.map((sentence) => {
                      if (sentence.role === "gloss") {
                        return (
                          <GlossRow
                            index={sentence.speechIndex}
                            key={sentence.id}
                            sentence={sentence}
                          />
                        );
                      }
                      return (
                        <div className={styles.sentenceRow} key={sentence.id}>
                          {sentence.sourceSpanIds?.[0] === undefined ? (
                            <p className={styles.sentence} data-speech-index={sentence.speechIndex}>
                              {sentence.text}
                              <ConfidenceMark sentence={sentence} />
                            </p>
                          ) : (
                            <a
                              className={styles.sentenceLink}
                              href={`#${sentence.sourceSpanIds[0]}`}
                            >
                              <span
                                className={styles.sentenceText}
                                data-speech-index={sentence.speechIndex}
                              >
                                {sentence.text}
                              </span>
                              <span className={styles.evidenceAction}>{viewer.evidence}</span>
                              <ConfidenceMark sentence={sentence} />
                            </a>
                          )}
                          {reportable ? <SentenceReport sentenceId={sentence.id} /> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </LevelBody>
    </SpeechReader>
  );
}

export { RenditionPanel };
