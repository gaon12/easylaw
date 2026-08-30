import styles from "./structured-list.module.css";
import type { StructuredRow } from "./types";

/**
 * 라벨/값 목록. `DESIGN.md` §6 — `structured-list`
 *
 * 규격: 라벨/값 2열, 행마다 1px `gray-20` 디바이더.
 *
 * 판결 한눈에 보기, 라이선스 목록, 설치 완료 요약이 모두 같은 모양이다. 화면마다 따로
 * 짜면 열 너비도 디바이더도 조금씩 달라지고, 그 어긋남이 "다른 사람이 만든 화면"처럼 보인다.
 *
 * `<dl>`을 쓰는 이유는 이것이 정의 목록이기 때문이다 — 스크린리더가 라벨과 값을 짝으로 읽는다.
 */

function StructuredList({ rows }: { rows: readonly StructuredRow[] }) {
  return (
    <dl className={styles.list}>
      {rows.map((row) => (
        <div className={styles.row} key={row.label}>
          <dt className={styles.label}>{row.label}</dt>
          <dd className={styles.value}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { StructuredList };
