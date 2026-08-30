import { setup } from "@/lib/strings";
import styles from "./step-rail.module.css";
import { SETUP_ORDER, SETUP_STEP, type SetupStepName } from "./steps";

/**
 * 설치 진행 표시줄. `PAGES.md` §4의 `{component.step-indicator}`
 *
 * 설치 화면에는 메뉴가 없다 — 갈 곳이 없기 때문이다. 그 자리를 이것이 대신한다.
 * **몇 단계가 남았는지가 이 화면에서 가장 궁금한 정보**이고, 그걸 모르면 시작하기 전에
 * 얼마나 걸릴지 가늠할 수 없다.
 *
 * 상태를 색으로만 알리지 않는다(`DESIGN.md` §10). 끝난 단계·지금 단계·남은 단계가
 * 굵기와 표식으로도 갈리고, 스크린리더에는 숨은 글로 상태를 읽어 준다.
 */
/**
 * 끝난 단계 · 지금 단계 · 남은 단계. 셋을 하나의 표현식에 겹쳐 쓰면 읽기 어렵다.
 *
 * CSS 모듈의 클래스 이름은 타입상 없을 수도 있어서(`noUncheckedIndexedAccess`)
 * 부르는 쪽에서 빈 값을 걸러 낸다 — `section.tsx`와 같은 방식이다.
 */
function stateClass(index: number, currentIndex: number): string | undefined {
  if (index < currentIndex) {
    return styles.done;
  }
  return index === currentIndex ? styles.current : styles.upcoming;
}

function StepRail({ current }: { current: SetupStepName }) {
  const currentIndex = SETUP_ORDER.indexOf(current);

  return (
    <nav aria-label={setup.stepsLabel} className={styles.rail}>
      <ol className={styles.list}>
        {SETUP_ORDER.map((name, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <li
              className={[styles.item, stateClass(index, currentIndex)].filter(Boolean).join(" ")}
              key={name}
            >
              <span aria-hidden="true" className={styles.marker}>
                {SETUP_STEP[name]}
              </span>
              <span className={styles.name}>{setup.stepNames[name]}</span>
              {done ? <span className="sr-only">{setup.stepDone}</span> : null}
              {active ? <span className="sr-only">{setup.stepCurrent}</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { StepRail };
