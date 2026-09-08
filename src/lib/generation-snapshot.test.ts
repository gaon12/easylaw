import { describe, expect, it } from "vitest";
import type { LlmClient } from "@/lib/llm/client";
import { createGenerationSnapshot, generationSnapshotId } from "./generation-snapshot";

function fakeClient(providerId: string, model: string, modelRevision = "1"): LlmClient {
  return {
    providerId,
    model,
    modelRevision,
    complete: () => Promise.reject(new Error("쓰지 않는다")),
    completeJson: () => Promise.reject(new Error("쓰지 않는다")),
  };
}

describe("generation snapshot", () => {
  it("같은 실행 설정은 같은 식별자가 된다", () => {
    const first = createGenerationSnapshot(fakeClient("provider-a", "model-a"));
    const second = createGenerationSnapshot(fakeClient("provider-a", "model-a"));

    expect(generationSnapshotId(first)).toBe(generationSnapshotId(second));
    expect(first).toMatchObject({
      providerId: "provider-a",
      generationModel: "model-a",
      verificationModel: "model-a",
      modelRevision: "1",
    });
  });

  it("모델 이름이 같아도 운영 판을 올리면 캐시 식별자가 달라진다", () => {
    const first = createGenerationSnapshot(fakeClient("provider-a", "stable-alias", "1"));
    const replaced = createGenerationSnapshot(fakeClient("provider-a", "stable-alias", "2"));

    expect(generationSnapshotId(replaced)).not.toBe(generationSnapshotId(first));
    expect(replaced).toMatchObject({ schemaVersion: "generation-snapshot-v2", modelRevision: "2" });
  });

  it("공급자나 모델이 바뀌면 캐시 식별자도 바뀐다", () => {
    const base = createGenerationSnapshot(fakeClient("provider-a", "model-a"));
    const anotherProvider = createGenerationSnapshot(fakeClient("provider-b", "model-a"));
    const anotherModel = createGenerationSnapshot(fakeClient("provider-a", "model-b"));

    expect(generationSnapshotId(anotherProvider)).not.toBe(generationSnapshotId(base));
    expect(generationSnapshotId(anotherModel)).not.toBe(generationSnapshotId(base));
  });
});
