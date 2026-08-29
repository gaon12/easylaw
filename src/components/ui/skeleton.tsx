import styles from "./skeleton.module.css";

/**
 * 스켈레톤 로더. `DESIGN.md` §5
 *
 * KRDS는 콘텐츠 로딩에 스피너 대신 스켈레톤을 쓰라고 정한다. 곧 나타날 것의 **모양**을
 * 미리 보여 주면 화면이 얼마나 걸릴지, 무엇이 올지 짐작할 수 있기 때문이다.
 *
 * **반짝이는 애니메이션을 넣지 않았다.** 이 서비스의 1차 사용자에는 지적장애인과 아동이
 * 있고, 그들에게 계속 움직이는 화면은 기다림을 덜어 주는 것이 아니라 방해다.
 * `DESIGN.md` §5의 "바운스·스프링·패럴랙스 금지"와 같은 방향이기도 하다.
 * 조용한 회색 블록으로 충분하다.
 *
 * 스크린리더에는 읽히지 않게 한다 — 의미 없는 자리표시자를 읽어 주면 방해만 된다.
 * 기다리는 중이라는 사실은 부모 쪽에서 `aria-busy`로 알린다.
 */
function SkeletonLine({ width }: { width?: "full" | "long" | "medium" | "short" }) {
  return <span aria-hidden="true" className={`${styles.line} ${styles[width ?? "full"]}`} />;
}

/** 줄 길이를 조금씩 다르게 준다. 다 같은 길이면 글이 아니라 표처럼 보인다. */
function lineWidth(index: number, total: number): "full" | "long" | "short" {
  if (index === total - 1) {
    // 마지막 줄은 짧게 끊는다. 문단은 대개 그렇게 끝난다.
    return "short";
  }
  return index % 2 === 0 ? "full" : "long";
}

/** 문단 하나. */
function SkeletonParagraph({ lines = 3 }: { lines?: number }) {
  return (
    <span aria-hidden="true" className={styles.paragraph}>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={String(index)} width={lineWidth(index, lines)} />
      ))}
    </span>
  );
}

/** 카드 자리. 보더만 있는 빈 상자가 아니라 안쪽 줄까지 그려야 모양이 짐작된다. */
function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className={styles.card}>
      <SkeletonLine width="medium" />
      <SkeletonParagraph lines={lines} />
    </div>
  );
}

export { SkeletonCard, SkeletonLine, SkeletonParagraph };
