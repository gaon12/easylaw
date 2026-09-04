"use client";

import { useId, useState } from "react";
import { admin } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 비밀 항목 입력 칸. `CONVENTIONS.md` §10.5
 *
 * **저장된 값을 채워 넣고, 가린 채로 보여 준다.** 예전에는 값을 아예 돌려주지 않고
 * "설정됨/설정 안 됨"만 알렸는데, 그러면 지금 무엇이 들어 있는지 확인할 방법이 없어서
 * 오타를 눈으로 잡을 수 없었다. 키를 넣었는데 통하지 않을 때 가장 먼저 하고 싶은 일이
 * "내가 넣은 게 이게 맞나" 확인하는 것이다.
 *
 * **감수하는 것**: 값이 화면 소스에 실린다. 그래서 `/admin`은 관리자만 열 수 있고
 * `noindex`이며, 칸은 기본이 `password`라 어깨너머로는 보이지 않는다. 보려면 한 번 더
 * 눌러야 한다 — 스크린샷이나 화면 공유에 무심코 찍히는 일을 막는 최소한의 턱이다.
 *
 * 값을 채워 두면 규칙도 단순해진다. 예전에는 빈 칸이 "그대로 두기"였고 지우려면 공백을
 * 넣어야 했다. 이제 **칸에 보이는 것이 곧 저장될 값**이고, 비우면 지워진다.
 */
function SecretField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string | undefined;
}) {
  const [shown, setShown] = useState(false);
  const hintId = useId();

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={name}>
        {label}
      </label>
      <div className={styles.secretRow}>
        <input
          aria-describedby={hintId}
          autoComplete="off"
          className={styles.input}
          defaultValue={value ?? ""}
          id={name}
          name={name}
          spellCheck={false}
          type={shown ? "text" : "password"}
        />
        {/*
          `aria-pressed`로 눌린 상태를 알린다. 글자만 바뀌면 스크린리더 사용자는 이것이
          토글인지 이동인지 알 수 없다.
        */}
        <button
          aria-pressed={shown}
          className={styles.reveal}
          onClick={() => setShown((previous) => !previous)}
          type="button"
        >
          {shown ? admin.secretHide : admin.secretShow}
        </button>
      </div>
      <span className={styles.hint} id={hintId}>
        {admin.secretHint}
      </span>
    </div>
  );
}

export { SecretField };
