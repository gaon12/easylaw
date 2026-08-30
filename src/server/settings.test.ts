import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestAppDb } from "@/db/testing";
import {
  DEFAULT_DAILY_GENERATION_LIMIT,
  DEFAULT_LLM_MODEL,
  generationDailyLimit,
  isSetupComplete,
  lawApiKey,
  listSettings,
  llmConfig,
  markSetupComplete,
  readSetting,
  writeSetting,
  writeSettings,
} from "./settings";

let db: AppDb;

beforeEach(() => {
  ({ db } = createTestAppDb());
});

describe("설정 읽고 쓰기", () => {
  it("쓴 값을 읽는다", () => {
    writeSetting(db, "law_api_oc", "my-key");
    expect(readSetting(db, "law_api_oc")).toBe("my-key");
  });

  it("같은 키를 다시 쓰면 덮어쓴다", () => {
    writeSetting(db, "law_api_oc", "first");
    writeSetting(db, "law_api_oc", "second");
    expect(readSetting(db, "law_api_oc")).toBe("second");
  });

  it("빈 값을 쓰면 지운다", () => {
    // 화면에서 칸을 비우는 것이 곧 해제여야 한다. 빈 값을 저장해 두면
    // "설정됨"으로 보이면서 동작하지 않는 상태가 된다.
    writeSetting(db, "law_api_oc", "my-key");
    writeSetting(db, "law_api_oc", "   ");
    expect(readSetting(db, "law_api_oc")).toBeUndefined();
  });

  it("앞뒤 공백을 턴다 — 붙여 넣은 키에는 줄바꿈이 딸려 온다", () => {
    writeSetting(db, "law_api_oc", "  my-key\n");
    expect(readSetting(db, "law_api_oc")).toBe("my-key");
  });

  it("여러 항목을 한 번에 쓴다", () => {
    writeSettings(db, { llm_base_url: "https://example.com", llm_model: "some-model" });
    expect(readSetting(db, "llm_base_url")).toBe("https://example.com");
    expect(readSetting(db, "llm_model")).toBe("some-model");
  });
});

describe("법제처 · LLM 설정", () => {
  it("키가 없으면 조회 기능이 꺼진 것으로 본다", () => {
    expect(lawApiKey(db)).toBeUndefined();
  });

  it("LLM은 주소와 키가 모두 있어야 켜진다", () => {
    expect(llmConfig(db)).toBeUndefined();

    writeSetting(db, "llm_base_url", "https://example.com");
    // 주소만 있으면 아직 못 쓴다. 반쯤 설정된 상태로 호출하면 런타임에서 죽는다.
    expect(llmConfig(db)).toBeUndefined();

    writeSetting(db, "llm_api_key", "sk-test");
    expect(llmConfig(db)).toEqual({
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      model: DEFAULT_LLM_MODEL,
    });
  });

  it("생성 상한은 잘못된 값이면 기본값으로 돌아간다", () => {
    expect(generationDailyLimit(db)).toBe(DEFAULT_DAILY_GENERATION_LIMIT);

    writeSetting(db, "generation_daily_limit", "50");
    expect(generationDailyLimit(db)).toBe(50);

    // 설정 표는 사람이 고칠 수 있다. 이상한 값에 서비스가 멈추면 안 된다.
    writeSetting(db, "generation_daily_limit", "동그라미");
    expect(generationDailyLimit(db)).toBe(DEFAULT_DAILY_GENERATION_LIMIT);

    writeSetting(db, "generation_daily_limit", "-3");
    expect(generationDailyLimit(db)).toBe(DEFAULT_DAILY_GENERATION_LIMIT);
  });
});

describe("listSettings", () => {
  it("비밀 항목의 값을 돌려주지 않는다", () => {
    // 화면에 값을 띄우는 순간 어깨너머로도, 스크린샷으로도 샌다.
    writeSetting(db, "law_api_oc", "secret-key");
    writeSetting(db, "llm_model", "some-model");

    const views = listSettings(db);
    const lawApi = views.find((view) => view.key === "law_api_oc");
    const model = views.find((view) => view.key === "llm_model");

    expect(lawApi).toEqual({ key: "law_api_oc", secret: true, configured: true, value: undefined });
    expect(model?.value).toBe("some-model");
  });

  it("설정하지 않은 항목도 목록에 나온다", () => {
    // 무엇을 설정할 수 있는지 보이지 않으면 설정할 수 없다.
    const views = listSettings(db);
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((view) => view.configured === false)).toBe(true);
  });
});

describe("설치 완료 표시", () => {
  it("표시하기 전에는 완료가 아니다", () => {
    expect(isSetupComplete(db)).toBe(false);
    markSetupComplete(db, "user-1");
    expect(isSetupComplete(db)).toBe(true);
  });
});
