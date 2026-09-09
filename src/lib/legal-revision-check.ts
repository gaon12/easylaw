import { diffLegalPayload } from "./legal-detail-diff";

type LegalRevisionCheckState = "passed" | "needs_review" | "failed";
type LegalRevisionIssue = "empty_payload" | "large_field_removal" | "root_shape_changed";

interface LegalRevisionAssessment {
  state: LegalRevisionCheckState;
  unchanged: number;
  changed: number;
  added: number;
  removed: number;
  issues: LegalRevisionIssue[];
}

const LARGE_REMOVAL_MINIMUM = 10;
const LARGE_REMOVAL_RATIO = 0.5;

function rootKind(value: unknown): "array" | "object" | "invalid" {
  if (Array.isArray(value)) {
    return "array";
  }
  return value !== null && typeof value === "object" ? "object" : "invalid";
}

function hasRootContent(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== null && typeof value === "object" && Object.keys(value).length > 0;
}

function checkState(issues: readonly LegalRevisionIssue[]): LegalRevisionCheckState {
  if (issues.includes("empty_payload")) {
    return "failed";
  }
  return issues.length === 0 ? "passed" : "needs_review";
}

/** 새 법령 상세 응답이 구조적으로 온전한지 기준판과 비교한다. 법률 의미 판단은 하지 않는다. */
function assessLegalRevision(before: unknown | undefined, after: unknown): LegalRevisionAssessment {
  const afterKind = rootKind(after);
  const comparison = diffLegalPayload(before ?? {}, after);
  const issues: LegalRevisionIssue[] = [];
  const afterFieldCount = comparison.unchanged + comparison.changed + comparison.added;

  if (afterKind === "invalid" || afterFieldCount === 0 || !hasRootContent(after)) {
    issues.push("empty_payload");
  }
  if (before !== undefined && rootKind(before) !== afterKind) {
    issues.push("root_shape_changed");
  }
  const previousFieldCount = comparison.unchanged + comparison.changed + comparison.removed;
  if (
    comparison.removed >= LARGE_REMOVAL_MINIMUM &&
    comparison.removed / previousFieldCount > LARGE_REMOVAL_RATIO
  ) {
    issues.push("large_field_removal");
  }

  return {
    state: checkState(issues),
    unchanged: comparison.unchanged,
    changed: comparison.changed,
    added: comparison.added,
    removed: comparison.removed,
    issues,
  };
}

export { assessLegalRevision };
export type { LegalRevisionAssessment, LegalRevisionCheckState, LegalRevisionIssue };
