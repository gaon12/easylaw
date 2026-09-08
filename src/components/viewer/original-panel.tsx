import { Icon } from "@/components/ui/icon";
import type { Citation } from "@/lib/law-citation/detect";
import { wiki } from "@/lib/strings";
import { detectHeadings, type HeadingSpan, parseFieldLabel } from "@/lib/text/headings";
import { CitedText } from "./cited-text";
import { LevelBody } from "./level-body";
import type { ViewLevel } from "./levels";
import styles from "./viewer.module.css";

interface Span {
  id: string;
  paraIdx: number;
  text: string;
}

/** 문장 하나를 그리는 데 필요한 것. 세 갈래(제목·이름표·평문)가 똑같이 받는다. */
interface RowProps {
  span: Span;
  citations: readonly Citation[];
  decidedAt: Date | null;
  level: ViewLevel;
  outlineDepth: HeadingSpan["depth"];
}

const HEADING_TAG = { 1: "h3", 2: "h4", 3: "h5", 4: "h6", 5: "h6" } as const;
const ROOT_HEADING_DEPTH = 1;
const MINOR_HEADING_DEPTH = 3;

/** 제목 접두사를 떼어 낸 뒤에도 인용 좌표가 본문 글자와 맞도록 옮긴다. */
function citationsAfter(citations: readonly Citation[], offset: number): Citation[] {
  return citations
    .filter((citation) => citation.start >= offset)
    .map((citation) => ({
      ...citation,
      start: citation.start - offset,
      end: citation.end - offset,
    }));
}

/** 접두사 뒤의 첫 글자 위치. 사이의 공백은 본문이 아니다. */
function bodyStartAfter(text: string, prefixLength: number): number {
  const rest = text.slice(prefixLength);
  return prefixLength + rest.length - rest.trimStart().length;
}

/** 그냥 문장. */
function Sentence({ span, citations, decidedAt, level, outlineDepth }: RowProps) {
  return (
    <p
      className={`${styles.sentence} ${styles.outlineRow}`}
      data-outline-depth={outlineDepth}
      id={span.id}
    >
      <span className={styles.sentenceContent}>
        <CitedText citations={citations} decidedAt={decidedAt} level={level} text={span.text} />
      </span>
    </p>
  );
}

/**
 * `【원고, 피상고인】 ○○○유동화전문 유한회사 (…)` — **이름과 값**으로 적힌 줄.
 *
 * 평문으로 두면 낫표가 문장 한가운데 글자로 남아, 무엇이 이름이고 무엇이 값인지 화면에서
 * 구분되지 않는다. 목차에는 올리지 않는다 — 이것은 구간이 아니라 사건 정보다.
 */
function Field({
  span,
  citations,
  decidedAt,
  level,
  label,
  contentStart,
  outlineDepth,
}: RowProps & { label: string; contentStart: number }) {
  const start = bodyStartAfter(span.text, contentStart);

  return (
    <dl
      className={`${styles.field} ${styles.outlineRow}`}
      data-outline-depth={outlineDepth}
      id={span.id}
    >
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>
        <CitedText
          citations={citationsAfter(citations, start)}
          decidedAt={decidedAt}
          level={level}
          text={span.text.slice(start)}
        />
      </dd>
    </dl>
  );
}

/**
 * `【주 문】` 같은 구간 표제. 주소로 쓸 수 있는 앵커가 붙는다.
 *
 * 표제와 같은 줄에 본문이 붙기도 한다(`【이 유】  1. …`). 화면에는 목차와 같은 정리된
 * 제목을 보여 주고 나머지는 평문으로 내려야 첫 문장 전체가 굵은 제목이 되지 않는다.
 * 원문 데이터와 점자용 텍스트는 바꾸지 않는다.
 */
function Heading({
  span,
  citations,
  decidedAt,
  level,
  heading,
  outlineDepth,
}: RowProps & { heading: HeadingSpan }) {
  const start = bodyStartAfter(span.text, heading.contentStart);
  const remainder = span.text.slice(start);
  const HeadingTag = HEADING_TAG[heading.depth];
  const className = [
    styles.sentenceHeading,
    styles.outlineRow,
    heading.depth > ROOT_HEADING_DEPTH ? styles.subheading : "",
    heading.depth > MINOR_HEADING_DEPTH ? styles.minorHeading : "",
  ].join(" ");

  return (
    <>
      <HeadingTag
        className={className}
        data-depth={heading.depth}
        data-outline-depth={outlineDepth}
        id={heading.id}
      >
        {heading.depth === ROOT_HEADING_DEPTH ? (
          <span className={styles.headingNumber}>
            {wiki.sectionNumber(heading.id.replace("s-", ""))}
          </span>
        ) : null}
        <span className={styles.headingText} id={remainder.length === 0 ? span.id : undefined}>
          {heading.label}
        </span>
        {/*
          구간 주소. 예전에는 `§` 글자를 썼는데, 글꼴마다 모양이 다르고 낭독기가 제각각
          읽으며 무엇보다 **판결문 본문의 기호와 구분되지 않았다**.
        */}
        <a
          aria-label={wiki.sectionLinkLabel(heading.label)}
          className={styles.sectionLink}
          href={`#${heading.id}`}
        >
          <Icon name="link" size={16} />
        </a>
      </HeadingTag>
      {remainder.length === 0 ? null : (
        <p
          className={`${styles.sentence} ${styles.outlineRow}`}
          data-outline-depth={outlineDepth}
          id={span.id}
        >
          <span className={styles.sentenceContent}>
            <CitedText
              citations={citationsAfter(citations, start)}
              decidedAt={decidedAt}
              level={level}
              text={remainder}
            />
          </span>
        </p>
      )}
    </>
  );
}

/**
 * 원문 패널. `PAGES.md` §5.2 ④
 *
 * 문장을 하나씩 별도 요소로 그린다. 근거 하이라이트가 문장 단위로 붙기 때문이다 —
 * 문단을 통째로 그리면 나중에 하이라이트를 붙일 자리가 없다.
 *
 * 문장은 **세 갈래**로 갈린다.
 *
 * | 갈래 | 예 | 그리는 법 |
 * |---|---|---|
 * | 구간 표제 | `【주 문】` | 앵커가 붙은 제목. 목차에 오른다 |
 * | 이름표 | `【원고, 피상고인】 ○○○…` | 이름과 값을 나눈 줄. 목차에 오르지 않는다 |
 * | 평문 | 나머지 전부 | 문장 하나 |
 *
 * 법령 인용은 **문장 안에서** 링크가 된다(`CitedText`). 인용을 찾는 일은 서버에서 미리
 * 해 두고 여기서는 좌표대로 자르기만 한다 — 문장마다 사전을 다시 뒤지면 화면 하나에
 * 그 일이 수십 번 붙는다.
 */
function OriginalPanel({
  spans,
  citations,
  decidedAt,
  level,
}: {
  spans: readonly Span[];
  /** span id → 그 문장에서 찾은 인용. 없으면 링크 없이 글자만 그린다. */
  citations?: ReadonlyMap<string, readonly Citation[]>;
  decidedAt?: Date | null;
  level: ViewLevel;
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

  /* 같은 원문 문단 안에 여러 표제가 들어올 수 있으므로 문장별로 현재 깊이를 기록한다. */
  let activeDepth: HeadingSpan["depth"] = 1;
  const outlineDepths = new Map<string, HeadingSpan["depth"]>();
  for (const span of spans) {
    const heading = anchors.get(span.id);
    if (heading !== undefined) {
      activeDepth = heading.depth;
    }
    outlineDepths.set(span.id, activeDepth);
  }

  return (
    // 원문은 L0 규격이다 — 76ch, 17px / 1.55(`DESIGN.md` §7).
    <LevelBody level="L0">
      {[...paragraphs.entries()].map(([paraIdx, sentences]) => (
        <div className={styles.paragraph} key={paraIdx}>
          {sentences.map((span) => {
            const row = {
              span,
              citations: citations?.get(span.id) ?? [],
              decidedAt: decidedAt ?? null,
              level,
              outlineDepth: outlineDepths.get(span.id) ?? 1,
            };

            const heading = anchors.get(span.id);
            if (heading !== undefined) {
              return <Heading heading={heading} key={span.id} {...row} />;
            }

            const field = parseFieldLabel(span.text);
            if (field !== undefined) {
              return (
                <Field
                  contentStart={field.contentStart}
                  key={span.id}
                  label={field.label}
                  {...row}
                />
              );
            }

            return <Sentence key={span.id} {...row} />;
          })}
        </div>
      ))}
    </LevelBody>
  );
}

export { OriginalPanel };
