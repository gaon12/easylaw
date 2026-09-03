import "server-only";

/**
 * PDF에서 글자를 꺼낸다. `PAGES.md` §4
 *
 * **법원이 실제로 보내는 형식이 PDF다.** 그런데 지금까지 `.txt`만 받았고, 화면은 "PDF는
 * 아직 준비 중"이라고 적어 두었다. 판결문을 받은 사람 대부분은 그것을 `.txt`로 만들 방법이
 * 없다 — 제품이 약속한 일과 실제로 받는 것 사이의 가장 큰 틈이었다.
 *
 * ## 밖으로 나가지 않는다
 *
 * `pdfjs-dist`로 **이 서버에서** 뽑는다. 판결문에는 개인정보가 그대로 들어 있어서
 * (그래서 §3.3이 즉시 마스킹을 요구한다) 변환을 남의 API에 맡길 수 없다.
 * 글꼴을 자체 호스팅하고 아바타를 직접 그리는 것과 같은 이유다.
 *
 * ## 스캔본은 못 읽는다. 그것을 분명히 말한다
 *
 * 종이를 스캔한 PDF는 글자가 아니라 **그림**이다. pdfjs는 거기서 아무것도 꺼내지 못하고,
 * 읽으려면 OCR이 필요하다 — 별개의 문제다. 이때 "빈 파일"이라고 하면 사용자는 무엇이
 * 잘못됐는지 모른 채 같은 파일을 다시 올린다. **스캔본이라고 말해 준다.**
 */

/**
 * 스캔본 판정.
 *
 * 처음에는 **전체 글자 수**만 봤는데, 실제 문서로 재 보니 그것으로는 부족했다 —
 * 18쪽짜리 요약본(거의 다 그림인 슬라이드)에서 140자가 나왔다. 전체 하한(40자)은 넘지만
 * **쪽당 8자**다. 그런 문서를 "읽었다"고 넘기면 사용자는 판결문 대신 부스러기를 받는다.
 *
 * 그래서 **쪽당 밀도**를 함께 본다. 글자가 든 판결문 PDF는 실측에서 쪽당 200자를 넘겼다
 * (464쪽 109,043자 = 쪽당 235자). 여기서는 넉넉히 잡아 그 4분의 1을 하한으로 둔다 —
 * 표지와 목차가 섞여 평균을 끌어내리는 것까지 감안한 값이다.
 */
const MIN_TEXT_LENGTH = 40;
const MIN_CHARS_PER_PAGE = 50;

type PdfResult =
  | { readonly kind: "ok"; readonly text: string; readonly pages: number }
  /** 글자가 없다 — 스캔본일 가능성이 높다. OCR이 필요하고 우리는 아직 못 한다. */
  | { readonly kind: "no_text"; readonly pages: number }
  /** PDF로 열 수 없다. 깨졌거나 암호가 걸렸다. */
  | { readonly kind: "unreadable"; readonly reason: string };

/**
 * 한 페이지의 글자를 이어 붙인다.
 *
 * pdfjs는 글자를 **화면에 그리는 조각 단위**로 준다. 조각 사이에 줄바꿈 정보가 따로 없어서,
 * `hasEOL`을 보고 줄을 나눈다 — 이것을 무시하고 전부 이어 붙이면 판결문 한 장이 한 문장이
 * 되고, 그러면 문장 분할(`segment.ts`)이 손쓸 도리가 없어진다.
 */
interface TextItem {
  readonly str?: string;
  /** 이 조각에서 줄이 끝나는가. pdfjs가 정한 이름이라 그대로 쓴다. */
  // biome-ignore lint/style/useNamingConvention: pdfjs의 필드명이다. 바꾸면 읽히지 않는다.
  readonly hasEOL?: boolean;
}

function joinItems(items: readonly TextItem[]): string {
  let out = "";
  for (const item of items) {
    out += item.str ?? "";
    if (item.hasEOL === true) {
      out += "\n";
    }
  }
  return out;
}

/**
 * pdfjs의 로딩 작업. **문서가 아니라 이쪽에 `destroy()`가 있다** —
 * 문서(`PDFDocumentProxy`)만 들고 있으면 정리할 방법이 없다.
 */
type PdfTask = ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument>;

/**
 * PDF를 연다. 못 열면 이유를 그대로 전한다.
 *
 * `legacy` 빌드를 쓴다 — 기본 빌드는 브라우저 전용 API를 기대하고 Node에서 죽는다.
 */
async function openPdf(bytes: Uint8Array): Promise<PdfTask | { error: string }> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    /*
     * **글꼴을 그리지 않는다**(`disableFontFace`). 우리는 글자만 꺼내고 화면에 그리지
     * 않으므로 글꼴 처리가 통째로 필요 없다. 남이 준 파일의 글꼴을 해석하는 경로를
     * 열어 둘 이유가 없고, 그만큼 빨라진다.
     *
     * 로그도 끈다(`verbosity: 0`). pdfjs는 깨진 PDF를 만나면 경고를 쏟는데, 그 경고에
     * 판결문 조각이 섞여 나갈 수 있다 — 로그에 판결문을 남기지 않는다(§7).
     */
    const task = getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    // 여기서 기다려야 "열 수 없는 PDF"가 이 try 안에서 잡힌다.
    await task.promise;
    return task;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "PDF를 열지 못했습니다." };
  }
}

/** PDF 바이트에서 글자를 꺼낸다. */
async function extractPdfText(bytes: Uint8Array): Promise<PdfResult> {
  const task = await openPdf(bytes);
  if ("error" in task) {
    return { kind: "unreadable", reason: task.error };
  }

  try {
    const opened = await task.promise;
    const parts: string[] = [];
    for (let page = 1; page <= opened.numPages; page += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: 페이지를 순서대로 이어 붙여야 한다. 병렬로 받으면 순서가 섞이고, 한 문서를 위해 페이지 수만큼 동시에 메모리를 잡는다.
      const content = await (await opened.getPage(page)).getTextContent();
      parts.push(joinItems(content.items as TextItem[]));
    }

    // 페이지 사이를 빈 줄로 나눈다. 문단 경계로 읽히도록(`segment.ts`가 빈 줄을 본다).
    const text = parts.join("\n\n").trim();

    /*
     * 전체 글자 수와 **쪽당 밀도**를 함께 본다. 총량만 보면 18쪽에 140자인 슬라이드가
     * 하한(40자)을 넘어 통과한다 — 쪽당 8자짜리 문서를 "읽었다"고 하면 사용자는
     * 판결문 대신 부스러기를 받는다.
     */
    const perPage = text.length / Math.max(1, opened.numPages);
    if (text.length < MIN_TEXT_LENGTH || perPage < MIN_CHARS_PER_PAGE) {
      return { kind: "no_text", pages: opened.numPages };
    }
    return { kind: "ok", text, pages: opened.numPages };
  } catch (error) {
    return {
      kind: "unreadable",
      reason: error instanceof Error ? error.message : "PDF를 읽지 못했습니다.",
    };
  } finally {
    // 열어 둔 것을 닫지 않으면 프로세스가 도는 동안 메모리가 쌓인다.
    await task.destroy();
  }
}

export { extractPdfText, MIN_CHARS_PER_PAGE, MIN_TEXT_LENGTH };
export type { PdfResult };
