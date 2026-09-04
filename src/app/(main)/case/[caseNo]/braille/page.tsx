import { notFound } from "next/navigation";
import { BrailleDocument } from "@/components/a11y/braille-document";
import { toLevel } from "@/components/viewer/levels";
import { corpusDb } from "@/db/client";
import {
  findJudgmentByCaseNo,
  findLatestRendition,
  findRendition,
  listSentences,
  listSpans,
} from "@/db/corpus/repository";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { braille as strings, viewer } from "@/lib/strings";
import { PIPELINE_VERSION } from "@/server/generate";

/**
 * 점자로 보기. `PAGES.md` §5 · `FEATURES.md` [F-11] 계열
 *
 * 화면에서 확인하는 길도 열어 두되, 핵심 목적은 **가져가게** 하는 것이다 —
 * 점자정보단말기로 복사하거나 점자 프린터로 찍을 수 있어야 한다.
 * 그래서 화면은 조용하고, 점자 덩어리를 통째로 고를 수 있게 두었다.
 *
 * 변환은 서버에서 한다(`server/braille.ts`). 5.8MB짜리 WebAssembly를 점자를 쓰지 않는
 * 사람에게까지 내려보낼 이유가 없다.
 *
 * 단계는 뷰어와 같은 `?level=`을 쓴다. `L0`이면 원문을, 아니면 그 단계의 설명을 바꾼다 —
 * 설명이 아직 없으면 만들라고 안내한다. 여기서 생성을 걸지 않는다: 점자로 보러 온 사람이
 * 자기도 모르게 하루 생성 몫을 쓰게 되면 안 된다.
 */
export default async function BraillePage(props: {
  params: Promise<{ caseNo: string }>;
  searchParams: Promise<{ level?: string | string[] }>;
}) {
  const [{ caseNo }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const canonical = toCanonicalCaseNumber(decodeURIComponent(caseNo));
  if (canonical === undefined) {
    notFound();
  }

  const db = corpusDb();
  const judgment = findJudgmentByCaseNo(db, canonical);
  if (judgment === undefined) {
    notFound();
  }

  const level = toLevel(searchParams.level);
  const viewerPath = `/case/${encodeURIComponent(canonical)}?level=${level}`;

  const lines =
    level === "L0"
      ? listSpans(db, judgment.id).map((span) => span.text)
      : (() => {
          const current = findRendition(db, judgment.id, level, PIPELINE_VERSION);
          const rendition = current ?? findLatestRendition(db, judgment.id, level);
          return rendition === undefined
            ? []
            : listSentences(db, rendition.id).map((sentence) => sentence.text);
        })();

  return (
    <BrailleDocument
      backHref={viewerPath}
      filename={`${judgment.caseNoCanonical}-${level}.txt`}
      lines={lines}
      meta={strings.meta(
        judgment.caseNoDisplay,
        level === "L0" ? strings.originalLabel : viewer.levels[level],
      )}
    />
  );
}

/**
 * 점자 페이지는 검색 결과에 올리지 않는다. 같은 내용이 뷰어에 있고, 점자 칸만 잔뜩 든
 * 페이지가 검색 결과에 뜨면 어느 쪽도 도움이 되지 않는다.
 */
export const metadata = { robots: { index: false, follow: true } };
