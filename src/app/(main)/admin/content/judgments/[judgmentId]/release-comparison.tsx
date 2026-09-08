import type { ReactNode } from "react";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { findContentReleaseBundle, listContentReleases } from "@/db/corpus/repository";
import { admin } from "@/lib/strings";
import { diffParagraphs, type Paragraph } from "@/lib/text/revision-diff";
import styles from "../../../admin.module.css";

type ReleaseList = ReturnType<typeof listContentReleases>;
type ReleaseBundle = NonNullable<ReturnType<typeof findContentReleaseBundle>>;
type Level = ReleaseBundle["renditions"][number]["level"];

const LEVELS: readonly Level[] = ["L1", "L2", "L3", "L4"];

function labelFor(release: ReleaseList[number], at: (value: Date) => string): string {
  const levels = release.levels.length > 0 ? release.levels.join(", ") : admin.releaseNoLevels;
  return `${at(release.createdAt)} · ${levels}`;
}

function paragraphs(item: ReleaseBundle["renditions"][number] | undefined): Paragraph[] {
  return (item?.sentences ?? []).map((sentence) => ({
    index: sentence.orderIdx,
    text: sentence.text,
  }));
}

function diffClass(kind: "same" | "added" | "removed"): string | undefined {
  if (kind === "added") {
    return styles.diffAdded;
  }
  if (kind === "removed") {
    return styles.diffRemoved;
  }
}

function SentenceDiff({ before, after }: { before: Paragraph[]; after: Paragraph[] }) {
  const diff = diffParagraphs(before, after);
  return (
    <div className={styles.releaseSentenceDiff}>
      {diff.chunks.map((chunk, chunkIndex) => (
        <div className={diffClass(chunk.kind)} key={`${chunk.kind}-${chunkIndex}`}>
          <strong>{admin.releaseDiffKinds[chunk.kind]}</strong>
          <ol>
            {chunk.paragraphs.map((sentence) => (
              <li key={`${sentence.index}-${sentence.text}`}>{sentence.text}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function LevelDiff({
  level,
  before,
  after,
}: {
  level: Level;
  before: ReleaseBundle;
  after: ReleaseBundle;
}) {
  const oldItem = before.renditions.find((item) => item.level === level);
  const newItem = after.renditions.find((item) => item.level === level);
  if (oldItem?.renditionId === newItem?.renditionId) {
    return null;
  }
  let kind: "added" | "removed" | "changed" = "changed";
  if (oldItem === undefined) {
    kind = "added";
  } else if (newItem === undefined) {
    kind = "removed";
  }
  return (
    <section className={styles.releaseLevelDiff}>
      <h3>
        {level}{" "}
        <Badge tone={kind === "changed" ? "needs-check" : "neutral"}>
          {admin.releaseLevelDiff[kind]}
        </Badge>
      </h3>
      <SentenceDiff after={paragraphs(newItem)} before={paragraphs(oldItem)} />
    </section>
  );
}

function ReleaseComparison({
  releases,
  from,
  to,
  at,
}: {
  releases: ReleaseList;
  from?: ReleaseBundle;
  to?: ReleaseBundle;
  at: (value: Date) => string;
}) {
  if (releases.length < 2) {
    return <p className={styles.empty}>{admin.releaseNoDiff}</p>;
  }
  const changedLevels =
    from === undefined || to === undefined
      ? []
      : LEVELS.filter(
          (level) =>
            from.renditions.find((item) => item.level === level)?.renditionId !==
            to.renditions.find((item) => item.level === level)?.renditionId,
        );
  let result: ReactNode = null;
  if (from !== undefined && to !== undefined) {
    result =
      changedLevels.length === 0 ? (
        <p className={styles.empty}>{admin.releaseDiffSame}</p>
      ) : (
        <div className={styles.releaseDiffList}>
          {changedLevels.map((level) => (
            <LevelDiff after={to} before={from} key={level} level={level} />
          ))}
        </div>
      );
  }
  return (
    <>
      <form className={styles.compareForm} method="get">
        {(
          [
            { name: "releaseFrom", label: admin.releaseFrom, selected: from?.id },
            { name: "releaseTo", label: admin.releaseTo, selected: to?.id },
          ] as const
        ).map((field) => (
          <label className={styles.field} htmlFor={field.name} key={field.name}>
            <span className={styles.label}>{field.label}</span>
            <NativeSelect
              className={styles.select}
              defaultValue={field.selected}
              id={field.name}
              name={field.name}
            >
              {releases.map((release) => (
                <option key={release.id} value={release.id}>
                  {labelFor(release, at)}
                </option>
              ))}
            </NativeSelect>
          </label>
        ))}
        <Button type="submit" variant="secondary">
          {admin.releaseCompareAction}
        </Button>
      </form>
      {result}
    </>
  );
}

export { ReleaseComparison };
