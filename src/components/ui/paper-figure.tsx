import styles from "./paper-figure.module.css";

type PaperMood =
  /** 길을 잃었다. 404 화면. */
  | "lost"
  /** 어딘가 다쳤다. 오류 화면. */
  | "hurt"
  /** 아직 아무것도 없다. 빈 목록. */
  | "empty";

/**
 * 종이 캐릭터. `DESIGN.md` §9
 *
 * 오류 화면이 차갑지 않았으면 해서 그림을 하나 뒀다. 소재는 **판결문 그 자체** —
 * 모서리가 접힌 종이 한 장이다. 이 서비스가 하루 종일 다루는 것이고, 딴 데서 빌려 온
 * 마스코트보다 화면에 붙는다.
 *
 * 규칙은 그대로 지킨다. **이모지를 쓰지 않는다**(§9 금지 항목) — 그림은 SVG로 그린다.
 * 색은 토큰만 쓰므로 선명한 화면 모드에서도 같이 반전된다. 움직이지 않는다 —
 * 오류 화면에서 뭔가 튀는 것은 귀여운 게 아니라 방해다.
 *
 * 의미는 옆의 글이 전한다. 그림은 `aria-hidden`으로 접근성 트리에서 뺀다.
 */
/** 표정. 종이 몸통은 그대로 두고 얼굴만 갈아 끼운다. */
function Face({ mood }: { mood: PaperMood }) {
  if (mood === "lost") {
    // 옆을 두리번거린다.
    return (
      <>
        <circle className={styles.eye} cx="49" cy="62" r="4.5" />
        <circle className={styles.eye} cx="75" cy="62" r="4.5" />
        <path
          className={styles.mouth}
          d="M53 78c3-3 11-3 14 0"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </>
    );
  }

  if (mood === "hurt") {
    // 눈을 질끈 감았다. 이마에는 반창고.
    return (
      <>
        <path
          className={styles.mouth}
          d="M44 60c3-4 9-4 12 0M68 60c3-4 9-4 12 0"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          className={styles.mouth}
          d="M52 80c4 3 12 3 16 0"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <rect
          className={styles.plaster}
          height="10"
          rx="4"
          transform="rotate(-20 34 40)"
          width="30"
          x="34"
          y="36"
        />
      </>
    );
  }

  // 기다리고 있다. 눈을 감고 조용히.
  return (
    <>
      <path
        className={styles.mouth}
        d="M44 62c3-4 9-4 12 0M68 62c3-4 9-4 12 0"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path className={styles.mouth} d="M54 80h12" strokeLinecap="round" strokeWidth="3" />
    </>
  );
}

function PaperFigure({ mood }: { mood: PaperMood }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.figure}
      fill="none"
      focusable="false"
      viewBox="0 0 120 132"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 종이. 오른쪽 위 모서리가 접혀 있다. */}
      <path
        className={styles.sheet}
        d="M18 14a6 6 0 0 1 6-6h50l28 28v82a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V14Z"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        className={styles.fold}
        d="M74 8v22a6 6 0 0 0 6 6h22"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />

      {/* 본문 줄. 판결문이라는 것을 알려 주는 최소한의 표시다. */}
      <path className={styles.rule} d="M34 96h52M34 108h32" strokeLinecap="round" strokeWidth="3" />

      <Face mood={mood} />
    </svg>
  );
}

export { PaperFigure };
