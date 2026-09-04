import type { Citation } from "@/lib/law-citation/detect";
import { wiki } from "@/lib/strings";
import { detectHeadings } from "@/lib/text/headings";
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
 *
 * `【주 문】` 같은 표제 문장에는 **앵커를 건다**(`DESIGN.md` §11.5). 목차가 그 자리로
 * 데려가고, 주소로 남에게 "이 구간"을 보낼 수 있다.
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
  /*
   * 표제에는 **주소로 쓸 수 있는 앵커**를 건다(`headings.ts`의 `sectionAnchor`).
   * 문장 id(UUID)를 주소에 쓰면 사람이 읽을 수 없고, 판결문을 다시 받아 오면 바뀐다.
   */
  const anchors = new Map(detectHeadings(spans).map((heading) => [heading.spanId, heading]));

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
          {sentences.map((span) => {
            const heading = anchors.get(span.id);
            if (heading === undefined) {
              return (
                <p className={styles.sentence} id={span.id} key={span.id}>
                  <CitedText
                    citations={citations?.get(span.id) ?? []}
                    decidedAt={decidedAt ?? null}
                    text={span.text}
                  />
                </p>
              );
            }

            /*
             * 구간 제목. 위키처럼 **번호 + 제목**이고, 그 줄 오른쪽 끝에 구간 링크가 붙는다.
             * 번호는 목차의 번호와 같은 것이라(`s-3` → 3) 목차에서 본 항목을 본문에서
             * 그대로 찾을 수 있다.
             */
            return (
              <p className={styles.sentenceHeading} id={heading.id} key={span.id}>
                <span className={styles.headingNumber}>
                  {wiki.sectionNumber(heading.id.replace("s-", ""))}
                </span>
                <span className={styles.headingText}>{span.text}</span>
                <a
                  aria-label={wiki.sectionLinkLabel(heading.label)}
                  className={styles.sectionLink}
                  href={`#${heading.id}`}
                >
                  {wiki.sectionLinkMark}
                </a>
              </p>
            );
          })}
        </div>
      ))}
    </LevelBody>
  );
}

export { OriginalPanel };
