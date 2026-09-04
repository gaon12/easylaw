import styles from "./icon.module.css";
import type { IconName } from "./types";

/**
 * 상태 아이콘. `DESIGN.md` §5 · §11
 *
 * 규격은 24×24 그리드, 스트로크 1.5~2px, 둥근 캡, `currentColor` 상속.
 * **이모지나 유니코드 글리프를 아이콘 대용으로 쓰지 않는다**(§11) — 글꼴마다 모양이
 * 달라지고, 스크린리더가 엉뚱한 이름으로 읽는다.
 *
 * 의미는 언제나 옆의 글자가 전한다(§3.4 "색만으로 상태를 구분하지 않는다").
 * 그래서 아이콘은 `aria-hidden`으로 접근성 트리에서 뺀다.
 */

const PATHS: Readonly<Record<IconName, string>> = {
  // 체크. 근거 있음 · 통과.
  check: "M5 12.5 10 17.5 19 7",
  // 느낌표. 확인 필요 · 경고.
  alert: "M12 6v8M12 18h.01",
  // 가위표. 근거 없음 · 실패.
  cross: "M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5",
  // 아이(i). 안내.
  info: "M12 11v7M12 6h.01",
  // 올리기. 위로 향한 화살표와 받침.
  upload: "M12 16V4M7 9l5-5 5 5M4 19h16",
  // 문서함.
  folder: "M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z",
  // 찾기. 돋보기.
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35",
  // 책. 안내 문서.
  book: "M5 4h9a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5ZM5 4v13M19 7v13",
  // 설정. 글자 크기·화면 표시.
  settings: "M4 7h16M4 12h16M4 17h10",
  // 방패. 개인정보.
  shield: "M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7Z",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.icon}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export { Icon };
