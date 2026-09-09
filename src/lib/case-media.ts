import type { ViewLevel } from "@/components/viewer/levels";

type ExplanationLevel = Exclude<ViewLevel, "L0">;

interface CaseMediaPlacement {
  readonly id: string;
  readonly caseNo: string;
  readonly level: ExplanationLevel;
  readonly assetId: string;
  readonly afterHeading: string;
  /** 같은 개념을 다른 법령·판결문에서도 다시 찾기 위한 레시피 키. */
  readonly recipeKey: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly thumbhash: string;
  readonly alt: string;
  readonly caption: string;
}

interface VisualRecipe {
  readonly id: string;
  readonly key: string;
  readonly intent: string;
  readonly version: number;
}

interface MediaAsset {
  readonly id: string;
  readonly recipeId: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly thumbhash: string;
}

interface PlacementSpec {
  readonly id: string;
  readonly caseNo: string;
  readonly level: ExplanationLevel;
  readonly afterHeading: string;
  readonly assetId: string;
  readonly alt: string;
  readonly caption: string;
}

interface VisualRecipeSummary extends VisualRecipe {
  readonly assetCount: number;
  readonly placementCount: number;
  readonly previewSrc: string | null;
  readonly previewWidth: number | null;
  readonly previewHeight: number | null;
}

/** 파일과 의미를 분리한다. 같은 행위는 다른 문서에서도 recipe key로 다시 찾는다. */
const RECIPES: readonly VisualRecipe[] = [
  {
    id: "126b0457-d90c-4d68-bc24-31d9ee2d1b35",
    key: "REHAB_SCHEDULED_PAYMENT_001",
    intent: "처분대금을 승인된 지급 일정에 따라 여러 채권자에게 배분한다",
    version: 1,
  },
  {
    id: "0a17a172-553a-4fba-a959-5906c6b11ddd",
    key: "PAYMENT_RULE_DISPUTE_001",
    intent: "지급 우선순위와 지급 시기라는 두 해석이 다툼의 대상이다",
    version: 1,
  },
  {
    id: "323531c9-c6cf-42fb-9536-2a9af47e5d52",
    key: "PLAN_AND_DATE_REVIEW_001",
    intent: "인가된 계획과 지급 시기를 함께 확인한다",
    version: 1,
  },
  {
    id: "7a9d240f-cbc5-4039-83e3-88633af2f534",
    key: "REMAND_FOR_REVIEW_001",
    intent: "상급심이 사건 기록을 하급심의 재심리로 돌려보낸다",
    version: 1,
  },
] as const;

const ASSETS = [
  {
    id: "7ccf6907-2388-4dde-b5ad-d4fd2a04f63d",
    recipeId: "126b0457-d90c-4d68-bc24-31d9ee2d1b35",
    src: "/media/cases/2023da287663/payment-plan-001-1200.webp",
    width: 1200,
    height: 900,
    thumbhash: "Z8eBBIA1VfywlV2c+j+SmkpfiIh4CJaHCA==",
  },
  {
    id: "3fe15dc2-9f87-42e5-8df9-3b3ec2af0a3b",
    recipeId: "0a17a172-553a-4fba-a959-5906c6b11ddd",
    src: "/media/cases/2023da287663/payment-dispute-001-1200.webp",
    width: 1200,
    height: 900,
    thumbhash: "9+cJDYJ3Z6d2iHaPeaiId3t6f5b3",
  },
  {
    id: "7f707513-e9d8-4d30-90bf-ae64e62e6bcb",
    recipeId: "323531c9-c6cf-42fb-9536-2a9af47e5d52",
    src: "/media/cases/2023da287663/plan-review-001-1200.webp",
    width: 1200,
    height: 900,
    thumbhash: "9fcJFYJ6rZR2mGhvaIdoeaeJj7n2",
  },
  {
    id: "709304ef-66ed-43a4-b728-b992b730609b",
    recipeId: "7a9d240f-cbc5-4039-83e3-88633af2f534",
    src: "/media/cases/2023da287663/remand-review-001-1200.webp",
    width: 1200,
    height: 900,
    thumbhash: "9PcFDYK653oMynfdWJVsKeoaj5ny",
  },
] as const satisfies readonly MediaAsset[];

const VISUALS = {
  facts: {
    assetId: ASSETS[0].id,
    alt: "공장 매각대금을 회생계획의 지급 일정에 따라 두 채권자에게 나누는 모습",
  },
  dispute: {
    assetId: ASSETS[1].id,
    alt: "담보권 순위와 회생계획의 지급 시기라는 두 기준을 비교하는 모습",
  },
  plan: {
    assetId: ASSETS[2].id,
    alt: "관리자가 인가된 회생계획과 지급 일정을 함께 확인하는 모습",
  },
  remand: {
    assetId: ASSETS[3].id,
    alt: "상급심의 판단 뒤 사건 기록이 다시 심리할 법원으로 전달되는 모습",
  },
} as const;

type VisualKey = keyof typeof VISUALS;
type PlacementCopy = Pick<PlacementSpec, "id" | "afterHeading" | "caption"> & {
  readonly visual: VisualKey;
};

function placementsFor(level: ExplanationLevel, copies: readonly PlacementCopy[]): PlacementSpec[] {
  return copies.map((copy) => ({
    id: copy.id,
    caseNo: "2023다287663",
    level,
    afterHeading: copy.afterHeading,
    assetId: VISUALS[copy.visual].assetId,
    alt: VISUALS[copy.visual].alt,
    caption: copy.caption,
  }));
}

const PLACEMENTS: readonly PlacementSpec[] = [
  ...placementsFor("L1", [
    {
      id: "a4c13296-a859-4a4e-af72-2c17f17e00e1",
      afterHeading: "사실관계",
      visual: "facts",
      caption: "관리인은 처분대금에서 비용을 뺀 뒤 첫해 지급분을 두 채권자에게 변제했다.",
    },
    {
      id: "4f46f6a0-4dc4-4752-8364-e218df64ac36",
      afterHeading: "쟁점과 당사자 주장",
      visual: "dispute",
      caption: "전체 담보권 순위와 회생계획상 지급 시기 가운데 어느 기준을 따를지가 쟁점이었다.",
    },
    {
      id: "cb38e11a-3a1c-4eeb-b85d-70e9379d0e40",
      afterHeading: "법원의 판단",
      visual: "plan",
      caption: "대법원은 인가된 계획의 문언과 지급 시기를 함께 살폈다.",
    },
    {
      id: "a208b7e2-ded8-4848-a352-a15cf9d0a4f7",
      afterHeading: "결론과 의미",
      visual: "remand",
      caption: "대법원은 원심판결을 파기하고 사건을 다시 심리하도록 돌려보냈다.",
    },
  ]),
  ...placementsFor("L2", [
    {
      id: "c34468cd-7c8f-4f8e-ac7e-cffdf7a90dfb",
      afterHeading: "무슨 일이 있었나요",
      visual: "facts",
      caption: "관리인은 남은 매각대금으로 첫해에 지급할 돈을 나누어 지급했습니다.",
    },
    {
      id: "f655e64c-d1b0-4a5c-bc06-c7c9d0290d82",
      afterHeading: "서로 무엇을 주장했나요",
      visual: "dispute",
      caption: "두 채권자는 돈을 나누는 기준을 서로 다르게 보았습니다.",
    },
    {
      id: "40242d90-72ee-42f2-a992-1c2a43c1a5d5",
      afterHeading: "법원은 왜 이렇게 판단했나요",
      visual: "plan",
      caption: "대법원은 인가된 계획과 첫해 지급 시기를 함께 확인했습니다.",
    },
    {
      id: "66026a40-3ae3-49d3-8c01-e36426117003",
      afterHeading: "다음 절차",
      visual: "remand",
      caption: "서울고등법원이 이 사건을 다시 심리합니다.",
    },
  ]),
  ...placementsFor("L3", [
    {
      id: "19635111-ff92-4234-9f35-99b258cbd40e",
      afterHeading: "무슨 일이 있었나요",
      visual: "facts",
      caption: "회사는 건물과 공장을 판 돈으로 그해 줄 돈을 주었어요.",
    },
    {
      id: "191e97a3-34e9-4eaf-a40c-b1d97577dd01",
      afterHeading: "사람들은 무엇을 말했나요",
      visual: "dispute",
      caption: "한쪽은 담보권 순서를, 다른 쪽은 계획에 적힌 시기를 보았어요.",
    },
    {
      id: "85e9532b-a9b6-4059-af82-b41d0dcfe7cd",
      afterHeading: "법원은 무엇을 살펴봤나요",
      visual: "plan",
      caption: "대법원은 계획에 적힌 내용과 돈을 주는 때를 살펴봤어요.",
    },
    {
      id: "4a7b5983-cef9-47a6-b462-a576565726f2",
      afterHeading: "다음에는 어떻게 되나요",
      visual: "remand",
      caption: "서울고등법원이 이 사건을 다시 살펴봐요.",
    },
  ]),
  ...placementsFor("L4", [
    {
      id: "e284ea48-6500-4ca0-ae2f-a8f57760351a",
      afterHeading: "무슨 일이 있었나요",
      visual: "facts",
      caption: "건물을 판 돈을 계획에 따라 나누어 줘요.",
    },
    {
      id: "ac85e60c-83fe-446e-b8ab-9e5d5978a65d",
      afterHeading: "법원은 어떻게 정했나요",
      visual: "dispute",
      caption: "돈을 나누는 기준을 두고 판단이 달랐어요.",
    },
    {
      id: "aa9b73c4-e1fe-4bb2-9cbe-cecf79260bfc",
      afterHeading: "왜 그런가요",
      visual: "plan",
      caption: "법원은 계획과 돈을 주는 때를 함께 봤어요.",
    },
    {
      id: "25cb53de-abed-4360-b0b7-0edbd4808e8d",
      afterHeading: "그래서 어떻게 되나요",
      visual: "remand",
      caption: "서울고등법원이 사건을 다시 살펴봐요.",
    },
  ]),
];

/**
 * 사건과 읽기 단계에 맞는 설명 그림을 찾는다.
 *
 * 파일명이 아니라 recipeKey가 의미를 나타낸다. 이후 다른 사건이 같은 개념을 쓰면 새 그림을
 * 만들지 않고 같은 레시피 자산을 가리킬 수 있다.
 */
function findCaseMedia(caseNoCanonical: string, level: ExplanationLevel): CaseMediaPlacement[] {
  const assetById = new Map<string, MediaAsset>(ASSETS.map((asset) => [asset.id, asset]));
  const recipeById = new Map<string, VisualRecipe>(RECIPES.map((recipe) => [recipe.id, recipe]));

  return PLACEMENTS.filter((candidate) => candidate.caseNo === caseNoCanonical && candidate.level === level).flatMap((candidate) => {
    const asset = assetById.get(candidate.assetId);
    const recipe = asset === undefined ? undefined : recipeById.get(asset.recipeId);
    if (asset === undefined || recipe === undefined) {
      return [];
    }
    /* 자산의 id가 배치 id를 덮지 않게 배치를 마지막에 합친다. 둘은 신고·재사용에서 다른 축이다. */
    return [{ ...asset, ...candidate, recipeKey: recipe.key }];
  });
}

/** 신고처럼 배치 UUID에서 시작하는 요청은 사건·레벨까지 코드 레지스트리에서 다시 찾는다. */
function findCaseMediaPlacement(placementId: string): CaseMediaPlacement | undefined {
  const placement = PLACEMENTS.find(({ id }) => id === placementId);
  if (placement === undefined) {
    return;
  }
  return findCaseMedia(placement.caseNo, placement.level).find(({ id }) => id === placementId);
}

function listVisualRecipes(): VisualRecipeSummary[] {
  return RECIPES.map((recipe) => {
    const assets = ASSETS.filter((asset) => asset.recipeId === recipe.id);
    const assetIds = new Set<string>(assets.map((asset) => asset.id));
    const preview = assets[0];
    return {
      ...recipe,
      assetCount: assets.length,
      placementCount: PLACEMENTS.filter((item) => assetIds.has(item.assetId)).length,
      previewSrc: preview?.src ?? null,
      previewWidth: preview?.width ?? null,
      previewHeight: preview?.height ?? null,
    };
  });
}

export { findCaseMedia, findCaseMediaPlacement, listVisualRecipes };
export type { CaseMediaPlacement, MediaAsset, VisualRecipe, VisualRecipeSummary };
