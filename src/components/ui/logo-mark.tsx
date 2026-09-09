import type { SVGProps } from "react";

/** 펼친 문서와 서로 마주 보는 두 설명 면을 함께 나타내는 EasyLaw 표식. */
function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M4 13 22.5 22.8V40L4 30.2V13Z" fill="#2563B8" />
      <path d="m44 9-18.5 12.3V40L44 27.7V9Z" fill="#22A9A8" />
      <path d="M22.5 22.8 25.5 21.3V40L22.5 40V22.8Z" fill="#163E76" />
    </svg>
  );
}

export { LogoMark };
