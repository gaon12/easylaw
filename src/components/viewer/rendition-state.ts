/**
 * 설명 칸이 무엇을 보여 줄지. 화면(page)이 계산해서 컴포넌트에 넘긴다.
 *
 * 타입만 따로 두는 이유는 규칙 하나다 — 컴포넌트 파일은 컴포넌트만 내보낸다
 * (Fast Refresh). 그리고 이 판단은 화면마다 다르다: 공개 판례에는 요청자 상한이,
 * 올린 문서에는 소유자 확인이 붙는다.
 */

import type { viewer } from "@/lib/strings";

/** 파이프라인의 단계 이름. 화면에 보이는 말은 `viewer.progressStages`가 정한다. */
type Stage = keyof typeof viewer.progressStages;

type PlaceholderState =
  /** 생성기가 설정되지 않았다. */
  | { readonly kind: "off" }
  /** 오늘 몫을 다 썼다([F-42]). */
  | { readonly kind: "limited" }
  /** 지금 만들고 있다. 내가 눌렀든 남이 눌렀든 화면이 하는 말은 같다(§5.3). */
  | { readonly kind: "running"; readonly stage: Stage | null }
  | { readonly kind: "failed"; readonly reason: string | null }
  /** 만들 수 있다. */
  | { readonly kind: "ready" };

/** 화면에 그릴 문장 하나. 저장소 행에서 필요한 것만 추린 모양이다. */
interface Sentence {
  readonly id: string;
  readonly role: "heading" | "body";
  readonly text: string;
  readonly confidence: "grounded" | "needs_check" | "ungrounded";
  readonly checkReason: string | null;
  /** 이 설명 문장이 나온 원문 span. 올린 문서와 공개 판례가 같은 모양을 쓴다. */
  readonly sourceSpanIds?: readonly string[];
}

export type { PlaceholderState, Sentence, Stage };
