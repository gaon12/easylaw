// biome-ignore-all lint/suspicious/noBitwiseOperators: 안정 식별자 혼합 함수는 의도적으로 32비트 연산을 쓴다.
/**
 * 캐시와 메타데이터에 쓸 짧고 안정적인 식별자.
 *
 * 암호나 서명에 쓰는 함수가 아니다. 설정 문자열을 DB에 그대로 남기지 않으면서 같은 값인지
 * 비교하는 용도다. 네 개의 32비트 상태를 섞어 단순한 한 칸 해시보다 충돌 여지를 줄인다.
 */
function stableId(value: string): string {
  let first = 1_779_033_703;
  let second = 3_144_134_277;
  let third = 1_013_904_242;
  let fourth = 2_773_480_762;

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 혼합 함수가 정한 상수다.
    first = second ^ Math.imul(first ^ code, 597_399_067);
    // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 혼합 함수가 정한 상수다.
    second = third ^ Math.imul(second ^ code, 2_869_860_233);
    // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 혼합 함수가 정한 상수다.
    third = fourth ^ Math.imul(third ^ code, 951_274_213);
    // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 혼합 함수가 정한 상수다.
    fourth = first ^ Math.imul(fourth ^ code, 2_716_044_179);
  }

  // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 마지막 혼합 단계가 정한 상수다.
  first = Math.imul(third ^ (first >>> 18), 597_399_067);
  // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 마지막 혼합 단계가 정한 상수다.
  second = Math.imul(fourth ^ (second >>> 22), 2_869_860_233);
  // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 마지막 혼합 단계가 정한 상수다.
  third = Math.imul(first ^ (third >>> 17), 951_274_213);
  // biome-ignore lint/style/noMagicNumbers: 이 값들은 cyrb128 마지막 혼합 단계가 정한 상수다.
  fourth = Math.imul(second ^ (fourth >>> 19), 2_716_044_179);

  // biome-ignore lint/style/noMagicNumbers: 32비트 부호를 없애고 8자리 16진수 네 칸으로 고정한다.
  const hex = (part: number) => (part >>> 0).toString(16).padStart(8, "0");
  return `${hex(first)}${hex(second)}${hex(third)}${hex(fourth)}`;
}

export { stableId };
