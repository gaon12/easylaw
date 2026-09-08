import type { LlmClient } from "@/lib/llm/client";
import { ENTAIL_PROMPT_VERSION } from "@/lib/pipeline/entail";
import { PROMPT_VERSION as EXTRACT_PROMPT_VERSION } from "@/lib/pipeline/extract-prompt";
import { RENDER_PROMPT_VERSION } from "@/lib/pipeline/render-prompt";
import { RENDITION_RULES_VERSION } from "@/lib/rendition/lint";
import { stableId } from "@/lib/stable-id";

/**
 * 한 번의 설명 생성에 실제로 적용한 설정. API 키와 원문은 절대 넣지 않는다.
 *
 * 모델 이름만 남기면 같은 이름을 내놓는 서로 다른 호환 서버를 구분할 수 없다. 반대로
 * base URL을 그대로 남기면 내부 주소가 운영 화면이나 백업에 드러날 수 있다. 그래서
 * 클라이언트가 만든 비가역 provider 식별자와 사람이 판단할 수 있는 버전만 저장한다.
 */
interface GenerationSnapshot {
  readonly schemaVersion: "generation-snapshot-v1";
  readonly providerId: string;
  readonly generationModel: string;
  readonly verificationModel: string;
  readonly extractPromptVersion: string;
  readonly renderPromptVersion: string;
  readonly entailPromptVersion: string;
  readonly rulesVersion: string;
  readonly readerPerspective: "neutral-reader-v1";
  readonly safetyPolicyVersion: "grounded-output-v1";
}

function createGenerationSnapshot(client: LlmClient): GenerationSnapshot {
  return {
    schemaVersion: "generation-snapshot-v1",
    providerId: client.providerId,
    generationModel: client.model,
    verificationModel: client.model,
    extractPromptVersion: EXTRACT_PROMPT_VERSION,
    renderPromptVersion: RENDER_PROMPT_VERSION,
    entailPromptVersion: ENTAIL_PROMPT_VERSION,
    rulesVersion: RENDITION_RULES_VERSION,
    readerPerspective: "neutral-reader-v1",
    safetyPolicyVersion: "grounded-output-v1",
  };
}

/** 객체의 고정된 필드 순서까지 이 파일이 소유하므로 JSON 문자열을 그대로 해시해도 안정적이다. */
function generationSnapshotId(snapshot: GenerationSnapshot): string {
  return stableId(JSON.stringify(snapshot));
}

export { createGenerationSnapshot, generationSnapshotId };
export type { GenerationSnapshot };
