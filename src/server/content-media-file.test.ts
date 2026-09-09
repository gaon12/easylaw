import { describe, expect, it } from "vitest";
import { readContentMediaFile } from "./content-media-file";

describe("비공개 콘텐츠 이미지 파일", () => {
  it("assets/media 아래에 등록된 WebP를 읽는다", async () => {
    const file = await readContentMediaFile(
      "cases/2023da287663/generated/payment-plan-002-1200.webp",
    );

    expect(file).toBeInstanceOf(ArrayBuffer);
    expect(file?.byteLength).toBeGreaterThan(1000);
  });

  it("저장소 루트 밖으로 나가는 경로는 읽지 않는다", async () => {
    await expect(
      readContentMediaFile("../characters/easylaw-guides-v1.webp"),
    ).resolves.toBeUndefined();
  });
});
