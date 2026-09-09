interface LegalField {
  readonly path: string;
  readonly value: string;
}

type LegalFieldChangeKind = "added" | "removed" | "changed";

interface LegalFieldChange {
  readonly path: string;
  readonly kind: LegalFieldChangeKind;
  readonly before?: string;
  readonly after?: string;
}

interface LegalDetailDiff {
  readonly changes: readonly LegalFieldChange[];
  readonly unchanged: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

const PATH_PART = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

function childPath(parent: string, key: string): string {
  return PATH_PART.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function scalar(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value) ?? String(value);
}

function collectFields(value: unknown, path: string, fields: LegalField[]): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      fields.push({ path, value: "[]" });
      return;
    }
    for (const [index, item] of value.entries()) {
      collectFields(item, `${path}[${index}]`, fields);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right, "ko"),
    );
    if (entries.length === 0) {
      fields.push({ path, value: "{}" });
      return;
    }
    for (const [key, item] of entries) {
      collectFields(item, childPath(path, key), fields);
    }
    return;
  }
  fields.push({ path, value: scalar(value) });
}

function flattenLegalPayload(value: unknown): readonly LegalField[] {
  const fields: LegalField[] = [];
  collectFields(value, "$", fields);
  return fields;
}

/** 법제처 JSON을 경로별 값으로 비교해 배열·중첩 구조의 정확한 변경 위치를 남긴다. */
function diffLegalPayload(before: unknown, after: unknown): LegalDetailDiff {
  const beforeFields = new Map(
    flattenLegalPayload(before).map((field) => [field.path, field.value]),
  );
  const afterFields = new Map(flattenLegalPayload(after).map((field) => [field.path, field.value]));
  const paths = [...new Set([...beforeFields.keys(), ...afterFields.keys()])].sort((left, right) =>
    left.localeCompare(right, "ko", { numeric: true }),
  );
  const changes: LegalFieldChange[] = [];
  let unchanged = 0;
  for (const path of paths) {
    const oldValue = beforeFields.get(path);
    const newValue = afterFields.get(path);
    if (oldValue === newValue) {
      unchanged += 1;
    } else if (oldValue === undefined) {
      changes.push({ path, kind: "added", after: newValue });
    } else if (newValue === undefined) {
      changes.push({ path, kind: "removed", before: oldValue });
    } else {
      changes.push({ path, kind: "changed", before: oldValue, after: newValue });
    }
  }
  const count = (kind: LegalFieldChangeKind): number =>
    changes.reduce((total, change) => total + (change.kind === kind ? 1 : 0), 0);
  return {
    changes,
    unchanged,
    added: count("added"),
    removed: count("removed"),
    changed: count("changed"),
  };
}

export { diffLegalPayload, flattenLegalPayload };
export type { LegalDetailDiff, LegalField, LegalFieldChange, LegalFieldChangeKind };
