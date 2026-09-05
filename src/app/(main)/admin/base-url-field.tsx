"use client";

import { useId, useState } from "react";
import { baseUrlAdvice, checkBaseUrl } from "@/lib/llm/base-url";
import { setup } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * AI API 주소 칸. `CONVENTIONS.md` §7
 *
 * **여기서 막는다.** 한때 잘못 넣은 주소를 우리가 조용히 고쳐서 불렀는데, 그러면 저장된
 * 값과 실제로 부르는 주소가 달라진다 — 사람은 자기가 무엇을 넣었는지 모른 채로 쓰게 되고
 * 다음에도 같은 값을 넣는다. 지금은 **넣는 자리에서** 무엇을 어떻게 고칠지 말하고,
 * 고치기 전에는 저장 버튼이 잠긴다 — 칸이 `data-invalid`를 달면 폼이 `:has()`로 스스로
 * 잠근다. 그것으로 끝은 아니다: 서버 액션은 폼을 거치지 않고도 불리므로 저장 자리에서도
 * 같은 함수로 한 번 더 막는다(`setup-actions.ts`).
 *
 * 다른 칸과 달리 클라이언트 컴포넌트인 이유는 그것뿐이다 — 글자를 치는 동안 봐야 한다.
 */
function BaseUrlField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string | undefined;
}) {
  const [current, setCurrent] = useState(value ?? "");
  const hintId = useId();
  const problem = checkBaseUrl(current);

  return (
    <div className={styles.field} data-invalid={problem === undefined ? undefined : "true"}>
      <label className={styles.label} htmlFor={name}>
        {label}
      </label>
      <input
        aria-describedby={hintId}
        aria-invalid={problem !== undefined}
        autoComplete="off"
        className={styles.input}
        id={name}
        name={name}
        onChange={(event) => setCurrent(event.target.value)}
        placeholder={setup.llmBaseUrlPlaceholder}
        spellCheck={false}
        type="text"
        value={current}
      />
      {/* 문제가 있으면 안내 대신 고칠 방법을 적는다. 둘을 같이 두면 어느 쪽을 읽어야 할지 모른다. */}
      <span className={problem === undefined ? styles.hint : styles.fieldError} id={hintId}>
        {problem === undefined ? setup.llmBaseUrlHint : baseUrlAdvice(problem, current)}
      </span>
    </div>
  );
}

export { BaseUrlField };
