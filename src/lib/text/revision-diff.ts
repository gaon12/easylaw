interface Paragraph {
  readonly index: number;
  readonly text: string;
}

type DiffKind = "same" | "removed" | "added";

interface DiffChunk {
  readonly kind: DiffKind;
  readonly paragraphs: readonly Paragraph[];
}

interface DiffResult {
  readonly chunks: readonly DiffChunk[];
  readonly unchanged: number;
  readonly removed: number;
  readonly added: number;
}

/** 같은 종류의 인접 결과를 합쳐 화면이 불필요하게 잘게 끊기지 않게 한다. */
function append(chunks: DiffChunk[], kind: DiffKind, paragraphs: readonly Paragraph[]): void {
  if (paragraphs.length === 0) {
    return;
  }
  const previous = chunks.at(-1);
  if (previous?.kind === kind) {
    chunks[chunks.length - 1] = {
      kind,
      paragraphs: [...previous.paragraphs, ...paragraphs],
    };
    return;
  }
  chunks.push({ kind, paragraphs: [...paragraphs] });
}

interface Anchor {
  readonly before: number;
  readonly after: number;
}

function positionsByText(paragraphs: readonly Paragraph[]): Map<string, number[]> {
  const positionsByText = new Map<string, number[]>();
  for (const [index, paragraph] of paragraphs.entries()) {
    const values = positionsByText.get(paragraph.text) ?? [];
    values.push(index);
    positionsByText.set(paragraph.text, values);
  }
  return positionsByText;
}

function uniqueCandidates(before: readonly Paragraph[], after: readonly Paragraph[]): Anchor[] {
  const afterPositions = positionsByText(after);
  return [...positionsByText(before)]
    .flatMap(([text, positions]) => {
      const other = afterPositions.get(text);
      const beforeIndex = positions.length === 1 ? positions[0] : undefined;
      const afterIndex = other?.length === 1 ? other[0] : undefined;
      return beforeIndex === undefined || afterIndex === undefined
        ? []
        : [{ before: beforeIndex, after: afterIndex }];
    })
    .sort((left, right) => left.before - right.before);
}

function insertionPoint(
  candidates: readonly Anchor[],
  tails: readonly number[],
  after: number,
): number {
  let low = 0;
  let high = tails.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const tail = candidates[tails[middle] ?? -1];
    if (tail !== undefined && tail.after < after) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function restoreSequence(
  candidates: readonly Anchor[],
  previous: readonly number[],
  last: number,
): readonly Anchor[] {
  const result: { before: number; after: number }[] = [];
  let cursor = last;
  while (cursor >= 0) {
    const candidate = candidates[cursor];
    if (candidate === undefined) {
      break;
    }
    result.push(candidate);
    cursor = previous[cursor] ?? -1;
  }
  return result.reverse();
}

/** 후보 가운데 양쪽 문서에서 순서가 유지되는 최장 증가 부분수열을 고른다. */
function longestOrdered(candidates: readonly Anchor[]): readonly Anchor[] {
  if (candidates.length < 2) {
    return candidates;
  }

  // patience sorting으로 `after` 위치의 최장 증가 부분수열을 O(n log n)에 찾는다.
  const tails: number[] = [];
  const previous = new Array<number>(candidates.length).fill(-1);
  for (const [index, candidate] of candidates.entries()) {
    const place = insertionPoint(candidates, tails, candidate.after);
    previous[index] = place > 0 ? (tails[place - 1] ?? -1) : -1;
    tails[place] = index;
  }
  return restoreSequence(candidates, previous, tails.at(-1) ?? -1);
}

/**
 * 새 문서에서 순서가 유지되는 anchor만 고른다.
 *
 * 양쪽 구간에 한 번씩만 나오는 문단은 안전한 기준점이다. 그 기준점의 새 문서 위치에
 * 최장 증가 부분수열을 적용하면, 이동한 문단을 억지로 "같음"으로 표시하지 않는다.
 */
function orderedAnchors(
  before: readonly Paragraph[],
  after: readonly Paragraph[],
): readonly Anchor[] {
  return longestOrdered(uniqueCandidates(before, after));
}

/** 공통 앞뒤와 고유 anchor를 재귀적으로 찾아 큰 문서를 제곱 크기 표 없이 비교한다. */
function compareInto(
  before: readonly Paragraph[],
  after: readonly Paragraph[],
  chunks: DiffChunk[],
): void {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix]?.text === after[prefix]?.text
  ) {
    prefix += 1;
  }
  append(chunks, "same", before.slice(0, prefix));

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > prefix &&
    afterEnd > prefix &&
    before[beforeEnd - 1]?.text === after[afterEnd - 1]?.text
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const beforeMiddle = before.slice(prefix, beforeEnd);
  const afterMiddle = after.slice(prefix, afterEnd);
  const anchors = orderedAnchors(beforeMiddle, afterMiddle);
  if (anchors.length === 0) {
    append(chunks, "removed", beforeMiddle);
    append(chunks, "added", afterMiddle);
  } else {
    let beforeCursor = 0;
    let afterCursor = 0;
    for (const anchor of anchors) {
      compareInto(
        beforeMiddle.slice(beforeCursor, anchor.before),
        afterMiddle.slice(afterCursor, anchor.after),
        chunks,
      );
      const anchored = beforeMiddle[anchor.before];
      if (anchored !== undefined) {
        append(chunks, "same", [anchored]);
      }
      beforeCursor = anchor.before + 1;
      afterCursor = anchor.after + 1;
    }
    compareInto(beforeMiddle.slice(beforeCursor), afterMiddle.slice(afterCursor), chunks);
  }

  append(chunks, "same", before.slice(beforeEnd));
}

function diffParagraphs(before: readonly Paragraph[], after: readonly Paragraph[]): DiffResult {
  const chunks: DiffChunk[] = [];
  compareInto(before, after, chunks);
  const count = (kind: DiffKind): number =>
    chunks.reduce((total, chunk) => total + (chunk.kind === kind ? chunk.paragraphs.length : 0), 0);
  return {
    chunks,
    unchanged: count("same"),
    removed: count("removed"),
    added: count("added"),
  };
}

export { diffParagraphs };
export type { DiffChunk, DiffKind, DiffResult, Paragraph };
