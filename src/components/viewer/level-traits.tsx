import { viewer } from "@/lib/strings";
import styles from "./level-traits.module.css";
import type { ViewLevel } from "./levels";

/** 단계 이름만으로는 드러나지 않는 읽기 방식을 짧게 훑어보게 한다. */
function LevelTraits({ level }: { level: ViewLevel }) {
  return (
    <ul aria-label={viewer.levelTraitsLabel} className={styles.list}>
      {viewer.levelTraits[level].map((trait) => (
        <li className={styles.item} key={trait}>
          {trait}
        </li>
      ))}
    </ul>
  );
}

export { LevelTraits };
