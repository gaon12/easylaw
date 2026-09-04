import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isSetupComplete } from "@/server/settings";
import { SetupShell } from "./setup-shell";

/**
 * 설치 마법사 관문. `PAGES.md` §17
 *
 * **설치가 끝나면 이 화면은 영영 닫힌다.** 여기서 관리자를 만들고 서비스 설정을 바꿀 수
 * 있으므로, 열려 있는 채로 두면 누구든 들어와 관리자가 될 수 있다.
 *
 * 닫혔다는 안내를 따로 보여 주지 않고 404를 돌려준다. "여기 설치 마법사가 있었다"는
 * 사실 자체가 공격자에게는 정보이고, 이미 설치를 마친 운영자는 이 주소로 올 이유가 없다.
 *
 * 화면 가드는 첫 번째 방벽일 뿐이다. 서버 액션도 각자 다시 확인한다 —
 * 액션은 폼을 거치지 않고도 호출된다.
 *
 * 이 그룹은 `(main)` 밖에 있다. `(main)`의 레이아웃이 "설치 안 됐으면 /setup으로"를
 * 담당하므로, 그 안에 있으면 무한히 돌아간다. 셸도 그래서 다르다 — 서비스 헤더의 메뉴는
 * 전부 `(main)` 안을 가리키고, 설치 중에 누르면 이 화면으로 되튕긴다.
 */
export default function SetupLayout({ children }: { children: ReactNode }) {
  if (isSetupComplete()) {
    notFound();
  }

  return <SetupShell>{children}</SetupShell>;
}
