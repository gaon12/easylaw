/**
 * biome-ignore-all lint/correctness/noNodejsModules: 픽스처 PDF를 파일에서 읽는다.
 * 테스트는 Node에서만 돌고, PDF를 문자열로 소스에 박아 둘 수는 없다.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf";

/**
 * 실제 PDF로 한 번 확인한다. 손으로 만든 픽스처는 우리가 만든 모양만 통과시킨다 —
 * 실제 문서는 글꼴이 서브셋이고 CID로 인코딩돼 한글이 깨지기 쉽다.
 *
 * `.dev/`는 저장소에 올라가지 않으므로 **CI에는 이 파일이 없다.** 없으면 건너뛴다 —
 * 없는 파일 때문에 CI가 빨개지면 그 신호를 아무도 안 보게 된다.
 */
const DIR = ".dev/이지리드_연구보고서";

/**
 * 464쪽짜리 PDF를 파싱하는 데 vitest 기본값(5초)은 모자란다. 실측에서 5초 언저리라
 * 기계가 바쁘면 그때그때 실패한다 — 우리 코드가 아니라 문서 크기 때문이다.
 * 넉넉히 잡는다. 여기서 재는 것은 속도가 아니라 한글이 깨지지 않는지다.
 */
const REAL_PDF_TIMEOUT_MS = 60_000;

describe.skipIf(!existsSync(DIR))("실제 PDF", () => {
  /** 파일 크기 순. 가장 큰 것이 글자가 든 본 보고서다. */
  function pdfs(): string[] {
    return readdirSync(DIR)
      .filter((f) => f.endsWith(".pdf"))
      .sort((a, b) => statSync(join(DIR, b)).size - statSync(join(DIR, a)).size);
  }

  it(
    "글자가 든 문서에서 한글 본문을 꺼낸다",
    async () => {
      const name = pdfs()[0];
      if (name === undefined) {
        return;
      }
      const result = await extractPdfText(new Uint8Array(readFileSync(join(DIR, name))));

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") {
        return;
      }
      expect(result.pages).toBeGreaterThan(100);
      // 한글이 물음표나 빈칸으로 깨지지 않았는가. 서브셋·CID 글꼴에서 흔히 깨진다.
      expect(result.text).toMatch(/[가-힣]{4,}/u);
      expect(result.text.length).toBeGreaterThan(50_000);
    },
    REAL_PDF_TIMEOUT_MS,
  );

  it(
    "거의 다 그림인 문서를 '읽었다'고 하지 않는다",
    async () => {
      /*
       * 18쪽짜리 요약본은 슬라이드라 글자가 140자밖에 안 나온다 — 전체 하한(40자)은 넘지만
       * 쪽당 8자다. 그런 문서를 통과시키면 사용자는 판결문 대신 부스러기를 받는다.
       */
      const name = pdfs().at(-1);
      if (name === undefined) {
        return;
      }
      const result = await extractPdfText(new Uint8Array(readFileSync(join(DIR, name))));

      expect(result.kind).toBe("no_text");
    },
    REAL_PDF_TIMEOUT_MS,
  );
});
