import { Badge } from "@/components/ui/badge";
import { viewer } from "@/lib/strings";
import { LevelBody } from "./level-body";
import type { ViewLevel } from "./levels";
import styles from "./rendition-panel.module.css";
import { SpeechReader } from "./speech-reader";

interface Sentence {
  readonly id: string;
  readonly orderIdx?: number;
  readonly role: "heading" | "body";
  readonly text: string;
  readonly confidence: "grounded" | "needs_check" | "ungrounded";
  readonly checkReason: string | null;
  /** 이 설명이 나온 원문 span. 첫 span으로 이동하되, 근거가 없으면 액션을 내지 않는다. */
  readonly sourceSpanIds?: readonly string[];
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

function RenditionPanel({
  level,
  sentences,
  needsCheckCount,
}: {
  level: ViewLevel;
  sentences: readonly Sentence[];
  needsCheckCount: number;
}) {
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

        {sentences.map((sentence, index) =>
          sentence.role === "heading" ? (
            <h3 className={styles.heading} data-speech-index={index} key={sentence.id}>
              {sentence.text}
            </h3>
          ) : (
            <div className={styles.sentenceRow} key={sentence.id}>
              {sentence.sourceSpanIds?.[0] === undefined ? (
                <p className={styles.sentence} data-speech-index={index}>
                  {sentence.text}
                  <ConfidenceMark sentence={sentence} />
                </p>
              ) : (
                <a className={styles.sentenceLink} href={`#${sentence.sourceSpanIds[0]}`}>
                  <span className={styles.sentenceText} data-speech-index={index}>
                    {sentence.text}
                  </span>
                  <span className={styles.evidenceAction}>{viewer.evidence}</span>
                  <ConfidenceMark sentence={sentence} />
                </a>
              )}
            </div>
          ),
        )}
      </LevelBody>
    </SpeechReader>
  );
}

export { RenditionPanel };
