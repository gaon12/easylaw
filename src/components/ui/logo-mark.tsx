import type { SVGProps } from "react";

/**
 * 원문과 쉬운 설명을 연결하는 펼친 문서형 EasyLaw 배지.
 *
 * navbar에서도 파비콘·앱 아이콘과 같은 짙은 청색 배경을 보여 줘, 작은 크기에서도
 * 서비스 표식이 흰 바탕에 흩어지지 않게 한다.
 */
function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="64" height="64" rx="15" fill="#173F75" />
      <path d="M10 19 29.5 29.3V48L10 37.7V19Z" fill="#66A3FF" />
      <path d="m54 15-19.5 13V48L54 35V15Z" fill="#45D0C8" />
      <path d="M29.5 29.3 34.5 28V48L29.5 48V29.3Z" fill="#fff" fillOpacity=".92" />
    </svg>
  );
}

export { LogoMark };
