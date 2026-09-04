"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { braille } from "@/lib/strings";
import styles from "./braille-document.module.css";

type CopyState = "idle" | "copied" | "failed";

function copyStatusText(state: CopyState): string {
  if (state === "copied") {
    return braille.copied;
  }
  return state === "failed" ? braille.copyFailed : "";
}

/** 서버에서 만든 점자 유니코드를 보조기기나 파일로 가져가는 두 통로. */
function BrailleActions({ text, filename }: { text: string; filename: string }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const download = (): void => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = url;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className={styles.actions}>
      <Button onClick={copy} size="m" type="button">
        {copyState === "copied" ? braille.copied : braille.copy}
      </Button>
      <Button onClick={download} size="m" type="button" variant="secondary">
        {braille.download}
      </Button>
      <span aria-live="polite" className={copyState === "failed" ? styles.status : "sr-only"}>
        {copyStatusText(copyState)}
      </span>
    </div>
  );
}

export { BrailleActions };
