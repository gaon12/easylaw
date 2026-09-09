import { stableId } from "./stable-id";

const GLOSS_DEFINITION_SOURCES = ["stdict", "legal_term"] as const;

type GlossDefinitionSource = (typeof GLOSS_DEFINITION_SOURCES)[number];

/** 생성 당시 실제로 사용한 사전 정의 한 행의 불변 사본. */
interface GlossEvidence {
  readonly definitionSource: GlossDefinitionSource;
  readonly definitionId: string;
  readonly term: string;
  readonly definition: string;
  readonly sourceLabel: string;
}

/** 정의 본문이나 출처가 바뀌었는지 비교하는 내용 지문. */
function glossEvidenceHash(evidence: GlossEvidence): string {
  return stableId(
    JSON.stringify([
      evidence.definitionSource,
      evidence.definitionId,
      evidence.term,
      evidence.definition,
      evidence.sourceLabel,
    ]),
  );
}

export { GLOSS_DEFINITION_SOURCES, glossEvidenceHash };
export type { GlossDefinitionSource, GlossEvidence };
