import type { Citation } from "@/lib/law-citation/detect";
import { CitedText } from "./cited-text";
import { LevelBody } from "./level-body";
import styles from "./viewer.module.css";

interface Span {
  id: string;
  paraIdx: number;
  text: string;
}

/**
 * 원문 패널. `PAGES.md` §5.2 ④
 *
 * 문장을 하나씩 별도 요소로 그린다. 근거 하이라이트가 문장 단위로 붙기 때문이다 —
 * 문단을 통째로 그리면 나중에 하이라이트를 붙일 자리가 없다.
 *
 * 법령 인용은 **문장 안에서** 링크가 된다(`CitedText`). 인용을 찾는 일은 서버에서 미리
 * 해 두고 여기서는 좌표대로 자르기만 한다 — 문장마다 사전을 다시 뒤지면 화면 하나에
 * 그 일이 수십 번 붙는다.
 */
function OriginalPanel({
  spans,
  citations,
  decidedAt,
}: {
  spans: readonly Span[];
  /** span id → 그 문장에서 찾은 인용. 없으면 링크 없이 글자만 그린다. */
  citations?: ReadonlyMap<string, readonly Citation[]>;
  decidedAt?: Date | null;
}) {
  const paragraphs = new Map<number, Span[]>();
  for (const span of spans) {
    const bucket = paragraphs.get(span.paraIdx) ?? [];
    bucket.push(span);
    paragraphs.set(span.paraIdx, bucket);
  }

  return (
    // 원문은 L0 규격이다 — 76ch, 17px / 1.55(`DESIGN.md` §7).
    <LevelBody level="L0">
      {[...paragraphs.entries()].map(([paraIdx, sentences]) => (
        <div className={styles.paragraph} key={paraIdx}>
          {sentences.map((span) => (
            <p className={styles.sentence} key={span.id}>
              <CitedText
                citations={citations?.get(span.id) ?? []}
                decidedAt={decidedAt ?? null}
                text={span.text}
              />
            </p>
          ))}
        </div>
      ))}
    </LevelBody>
  );
}

export { OriginalPanel };
