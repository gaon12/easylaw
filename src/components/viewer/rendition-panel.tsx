import { Badge } from "@/components/ui/badge";
import { viewer } from "@/lib/strings";
import { LevelBody } from "./level-body";
import type { ViewLevel } from "./levels";
import styles from "./rendition-panel.module.css";

interface Sentence {
  readonly id: string;
  readonly role: "heading" | "body";
  readonly text: string;
  readonly confidence: "grounded" | "needs_check" | "ungrounded";
  readonly checkReason: string | null;
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
  return (
    <span className={styles.mark}>
      <Badge tone={needsCheck ? "needs-check" : "ungrounded"}>
        {viewer.confidence[sentence.confidence]}
      </Badge>
      {sentence.checkReason === null ? null : (
        <span className={styles.reason}>{sentence.checkReason}</span>
      )}
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
    <LevelBody level={level}>
      {/*
        원본이 아니라는 고지를 본문 **위**에 둔다(P1). 아래에 두면 다 읽은 뒤에야 보인다.
      */}
      <p className={styles.notice}>{viewer.notOriginal}</p>
      {needsCheckCount > 0 ? (
        <p className={styles.summary}>{viewer.needsCheckSummary(needsCheckCount)}</p>
      ) : null}

      {sentences.map((sentence) =>
        sentence.role === "heading" ? (
          <h3 className={styles.heading} key={sentence.id}>
            {sentence.text}
          </h3>
        ) : (
          <p className={styles.sentence} key={sentence.id}>
            {sentence.text}
            <ConfidenceMark sentence={sentence} />
          </p>
        ),
      )}
    </LevelBody>
  );
}

export { RenditionPanel };
