"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { admin } from "@/lib/strings";
import type { AudioStatusRow } from "@/server/audio";
import styles from "./admin.module.css";

/**
 * 어느 설명에 음성이 있고 어디가 비었나. `PAGES.md` §17 · [F-11]
 *
 * **이 자리가 없으면 운영자는 알 방법이 없다.** 화면마다 들어가 눌러 봐야 하고, 그러면
 * 결국 아무도 확인하지 않는다. 목록과 **그 자리에서 만드는 버튼**을 함께 둔다.
 *
 * 만드는 일은 이용자 화면과 **같은 통로**를 쓴다(`/api/audio/make/…`). 관리자용 통로를
 * 따로 두면 두 길이 갈라지고, 언젠가 한쪽에만 고친 규칙이 남는다 — 하루 상한이 그런
 * 규칙이다.
 *
 * **올린 문서는 여기 없다.** 관리자라도 누가 무엇을 올렸는지 늘어놓고 볼 이유가 없다.
 */

type Progress = Record<string, "making" | "done" | "failed">;

/** 실패는 `make` 안에서 이미 상태로 남긴다. 여기서 다시 던지지 않는다. */
function ignoreRejection(): void {
  /* 비어 있는 것이 뜻이다. */
}

function AudioStatus({ rows }: { rows: readonly AudioStatusRow[] }) {
  const [progress, setProgress] = useState<Progress>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function make(row: AudioStatusRow): Promise<void> {
    setProgress((before) => ({ ...before, [row.renditionId]: "making" }));
    try {
      const response = await fetch(
        `/api/audio/make/case/${encodeURIComponent(row.caseNo)}/${row.level}`,
        { method: "POST" },
      );
      const body = (await response.json()) as { ready?: string[] };
      setCounts((before) => ({ ...before, [row.renditionId]: body.ready?.length ?? 0 }));
      setProgress((before) => ({
        ...before,
        [row.renditionId]: response.ok ? "done" : "failed",
      }));
    } catch {
      setProgress((before) => ({ ...before, [row.renditionId]: "failed" }));
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <p className={styles.empty}>{admin.audioEmpty}</p>
      </Card>
    );
  }

  return (
    <Card className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{admin.audioColumns.caseNo}</th>
            <th scope="col">{admin.audioColumns.level}</th>
            <th scope="col">{admin.audioColumns.audio}</th>
            {/* 버튼 칸. 제목을 화면에는 숨기되 낭독기에는 남긴다. */}
            <th className="sr-only" scope="col">
              {admin.audioMake}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const made = counts[row.renditionId] ?? row.withAudio;
            const complete = made >= row.sentences;
            const state = progress[row.renditionId];

            return (
              <tr key={row.renditionId}>
                <td>{row.caseNo}</td>
                <td>{row.level}</td>
                <td>
                  {/* 색이 아니라 **숫자와 글자**가 상태를 말한다(DESIGN.md §10). */}
                  {admin.audioCount(made, row.sentences)}
                  {complete ? ` · ${admin.audioReady}` : ` · ${admin.audioMissing}`}
                </td>
                <td>
                  {complete && state === undefined ? null : (
                    <Button
                      disabled={state === "making"}
                      onClick={() => {
                        make(row).catch(ignoreRejection);
                      }}
                      size="s"
                      variant="secondary"
                    >
                      {state === "making" ? admin.audioMaking : admin.audioMake}
                    </Button>
                  )}
                  {state === "failed" ? (
                    <span className={styles.hint}>{admin.audioFailed}</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export { AudioStatus };
