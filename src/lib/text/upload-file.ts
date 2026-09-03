import "server-only";
import { extractPdfText } from "./pdf";

/**
 * 올린 파일에서 글자를 꺼낸다. `PAGES.md` §4 · `CONVENTIONS.md` §7
 *
 * 액션이 아니라 여기 두는 이유는 **시험할 수 있게** 하기 위해서다. 매직바이트 판별과
 * 인코딩 폴백은 조용히 틀리기 쉬운 자리이고, 틀리면 사용자가 올린 판결문이 깨진 글자가 된다.
 */

type FileProblem =
  /** 열지 못했다. 깨졌거나 암호가 걸렸다. */
  | "file_unreadable"
  /** PDF는 열렸는데 글자가 없다 — 스캔본이다. "빈 파일"과 구분해서 알린다. */
  | "pdf_scanned"
  | "file_too_large";

/**
 * 파일 크기 상한.
 *
 * 판결문 PDF는 대개 몇 MB다. 실측한 연구보고서(464쪽)가 7.6MB였으니 그보다 넉넉히 잡는다.
 * 상한을 두는 이유는 저장 용량이 아니라 **시간**이다 — 아주 큰 PDF는 글자를 꺼내는 데
 * 오래 걸리고 그동안 서버가 그 요청에 묶인다.
 */
const MAX_FILE_MB = 20;
const KIB = 1024;
const MAX_FILE_BYTES = MAX_FILE_MB * KIB * KIB;

/**
 * PDF인가. 확장자가 아니라 **매직바이트**로 본다(§7 — 확장자는 사용자가 정한다).
 *
 * `%PDF` 네 글자로 시작한다. 이름이 `.txt`인 PDF도, `.pdf`인 글자 파일도 올라올 수 있고,
 * 확장자를 믿으면 그때마다 엉뚱한 방식으로 읽는다.
 */
const PDF_MAGIC = new TextEncoder().encode("%PDF");

function looksLikePdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * 글자 파일을 읽는다.
 *
 * UTF-8로 먼저 읽고, 아니면 EUC-KR로 다시 읽는다. **한글 판결문이 CP949로 저장된 경우가
 * 흔하다** — 관공서에서 받은 파일이 특히 그렇다. UTF-8만 시도하고 실패하면 사용자는
 * 멀쩡한 파일을 못 올린다.
 */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

type FileRead = { readonly text: string } | { readonly error: FileProblem };

/**
 * PDF면 `pdfjs`로 뽑고, 아니면 글자 파일로 읽는다.
 *
 * **PDF 변환을 남의 API에 맡기지 않는다.** 판결문에는 개인정보가 그대로 들어 있어서
 * (§3.3이 즉시 마스킹을 요구하는 이유다) 이 서버 밖으로 내보낼 수 없다.
 */
async function readUploadedFile(file: {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<FileRead> {
  if (file.size > MAX_FILE_BYTES) {
    return { error: "file_too_large" };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { error: "file_unreadable" };
  }

  if (!looksLikePdf(bytes)) {
    return { text: decodeText(bytes) };
  }

  const extracted = await extractPdfText(bytes);
  if (extracted.kind === "ok") {
    return { text: extracted.text };
  }
  /*
   * **스캔본과 깨진 파일을 구분한다.** 스캔본은 사용자가 잘못한 것이 없고, 지금 우리가
   * 못 하는 일이다(OCR). "읽을 수 없다"고만 하면 같은 파일을 다시 올린다.
   */
  return { error: extracted.kind === "no_text" ? "pdf_scanned" : "file_unreadable" };
}

export { looksLikePdf, MAX_FILE_BYTES, MAX_FILE_MB, readUploadedFile };
export type { FileProblem, FileRead };
