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
 */
function OriginalPanel({ spans }: { spans: readonly Span[] }) {
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
              {span.text}
            </p>
          ))}
        </div>
      ))}
    </LevelBody>
  );
}

export { OriginalPanel };
