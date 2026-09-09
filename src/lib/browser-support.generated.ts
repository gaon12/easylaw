/* biome-ignore-all lint/style/noMagicNumbers: Browserslist가 만든 브라우저 메이저 버전이다. */
/**
 * 이 파일은 `.browserslistrc`에서 생성됩니다.
 * 직접 고치지 말고 `npm run browser-support:generate`를 실행하세요.
 */
export const browserSupportMajors = {
  chrome: [151, 150],
  firefox: [154, 153, 140],
  safari: [26, 18, 17],
  iosSafari: [26, 18, 17],
} as const;
