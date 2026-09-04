import { LevelBody } from "@/components/viewer/level-body";
import { LevelTraits } from "@/components/viewer/level-traits";
import { LEVEL_ORDER } from "@/components/viewer/levels";
import { demo, viewer } from "@/lib/strings";
import styles from "./level-demo.module.css";

/**
 * 히어로의 레벨 데모. `PAGES.md` §2
 *
 * 이 제품이 무엇인지 **설명하는 대신 보여 준다.** 같은 판결을 다섯 가지 말로 옮긴 것이
 * 서비스의 전부이므로, 그것을 첫 화면에서 직접 만져 보게 하는 편이 어떤 문장보다 빠르다.
 *
 * **자바스크립트를 쓰지 않는다.** 라디오 버튼과 `:has()` 선택자로만 단계를 바꾼다.
 * 이 서비스의 다른 화면(검색·업로드)이 모두 스크립트 없이 동작하는데 첫 화면만
 * 스크립트를 요구하면 앞뒤가 맞지 않는다.
 *
 * 라디오이므로 키보드 화살표로 단계가 넘어가고, 스크린리더는 라디오 그룹으로 읽는다.
 */
function LevelDemo() {
  return (
    <div className={styles.demo}>
      <div className={styles.head}>
        <p className={styles.title}>{demo.title}</p>
        <p className={styles.hint}>{demo.hint}</p>
      </div>

      <fieldset className={styles.tabs}>
        <legend className="sr-only">{demo.groupLabel}</legend>
        {LEVEL_ORDER.map((level, index) => (
          <label className={`${styles.tab} ${styles[`t${index}`]}`} key={level}>
            {/*
              라벨이 입력을 감싸므로 id가 필요 없다. 서버 컴포넌트에서는 useId를 쓸 수 없고,
              고정 id를 쓰면 이 컴포넌트를 한 화면에 두 번 놓을 수 없다.
            */}
            <input
              className="sr-only"
              defaultChecked={index === 0}
              name="el-demo-level"
              type="radio"
            />
            <span className={styles.tabText}>{viewer.levels[level]}</span>
          </label>
        ))}
      </fieldset>

      <div className={styles.panels}>
        {LEVEL_ORDER.map((level, index) => (
          <div className={`${styles.panel} ${styles[`p${index}`]}`} key={level}>
            <p className={styles.note}>{viewer.levelNotes[level]}</p>
            <LevelTraits level={level} />
            {/*
              레벨별 본문 규격을 데모에서도 그대로 쓴다(`DESIGN.md` §7).
              첫 화면에서 보여 주는 모양과 실제 뷰어의 모양이 다르면 데모가 거짓말이 된다.
            */}
            <div className={styles.body}>
              <LevelBody level={level}>
                {demo.bodies[level].map((line) => (
                  <p className={styles.line} key={line}>
                    {line}
                  </p>
                ))}
              </LevelBody>
            </div>
          </div>
        ))}
      </div>

      <p className={styles.caption}>{demo.caption}</p>
    </div>
  );
}

export { LevelDemo };
