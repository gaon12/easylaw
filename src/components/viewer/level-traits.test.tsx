import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { viewer } from "@/lib/strings";
import { LevelTraits } from "./level-traits";
import { LEVEL_ORDER } from "./levels";

describe("읽기 단계 표지", () => {
  it.each(LEVEL_ORDER)("%s 단계의 실제 읽기 방식을 목록으로 보여 준다", (level) => {
    const html = renderToStaticMarkup(<LevelTraits level={level} />);

    expect(html).toContain(`aria-label="${viewer.levelTraitsLabel}"`);
    for (const trait of viewer.levelTraits[level]) {
      expect(html).toContain(trait);
    }
  });
});
