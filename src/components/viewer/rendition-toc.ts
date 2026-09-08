import type { TocEntry } from "@/components/ui/types";

interface HeadingSentence {
  readonly id: string;
  readonly role: "heading" | "body" | "gloss";
  readonly text: string;
}

/** 설명 제목은 원문 앵커와 충돌하지 않는 별도 주소를 쓴다. */
function renditionHeadingId(sentenceId: string): string {
  return `r-${sentenceId}`;
}

function renditionTocEntries(sentences: readonly HeadingSentence[]): TocEntry[] {
  return sentences
    .filter((sentence) => sentence.role === "heading")
    .map((sentence) => ({
      id: renditionHeadingId(sentence.id),
      label: sentence.text,
      depth: 1,
    }));
}

export { renditionHeadingId, renditionTocEntries };
