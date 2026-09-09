"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/shadcn/ui/button";
import { errorFingerprint, publicErrorCode } from "@/lib/error-code";
import { errors } from "@/lib/strings";
import styles from "./status.module.css";

function ErrorTrace({ error }: { error: Error & { digest?: string } }) {
  const fingerprint = useMemo(() => errorFingerprint(error), [error]);
  const code = useMemo(() => publicErrorCode(fingerprint), [fingerprint]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/error-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        digest: error.digest,
        name: error.name,
        message: error.message,
        stack: error.stack,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.trace}>
      <div>
        <span className={styles.traceLabel}>{errors.errorCodeLabel}</span>
        <code className={styles.codeValue}>{code}</code>
      </div>
      <Button
        className={styles.copyCode}
        onClick={copyCode}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? errors.errorCodeCopied : errors.errorCodeCopy}
      </Button>
      <p className={styles.codeHint}>{errors.errorCodeHint}</p>
    </div>
  );
}

export { ErrorTrace };
