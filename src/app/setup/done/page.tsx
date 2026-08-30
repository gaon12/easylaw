import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { appDb } from "@/db/client";
import { setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { listSettings } from "@/server/settings";
import { finishSetup } from "@/server/setup-actions";
import styles from "../setup-steps.module.css";
import { StepRail } from "../step-rail";

/** 요약에 보여 줄 항목. 설치 완료 표시 자체는 사용자에게 의미가 없으므로 뺀다. */
const SHOWN = [
  "time_zone",
  "secure_cookies",
  "law_api_oc",
  "llm_base_url",
  "llm_api_key",
  "generation_daily_limit",
] as const;

/**
 * 설치 5단계 — 완료. `PAGES.md` §17
 *
 * **완료 표시를 자동으로 찍지 않는다.** 이 값이 찍히는 순간 마법사는 영영 닫히므로,
 * 되돌릴 수 없는 동작을 화면 이동만으로 일으키지 않는다. 사람이 버튼을 눌러야 끝난다.
 *
 * 무엇이 켜지고 무엇이 꺼진 채로 시작하는지 먼저 보여 준다. 여기서 빠진 것을 발견하면
 * 뒤로 가서 넣을 수 있다.
 */
export default async function SetupDonePage() {
  const session = await currentSession();
  if (session?.role !== "admin") {
    redirect("/setup");
  }

  const settings = listSettings(appDb());

  return (
    <>
      <StepRail current="done" />

      <header className={styles.header}>
        <h1 className={styles.title}>{setup.doneTitle}</h1>
        <p className={styles.intro}>{setup.doneIntro}</p>
      </header>

      <Card>
        <StructuredList
          rows={SHOWN.map((key) => {
            const view = settings.find((entry) => entry.key === key);
            const configured = view?.configured ?? false;
            return {
              label: setup.settingNames[key],
              /*
                켜졌는지 꺼졌는지는 상태다 — 배지로 말한다(`DESIGN.md` §11: 아이콘 + 라벨 + 색).
                값이 있는 항목(시간대 같은 것)은 값 자체가 더 유용하므로 값을 보여 준다.
              */
              value:
                view?.value ??
                (configured ? (
                  <Badge tone="grounded">{setup.configured}</Badge>
                ) : (
                  <Badge tone="neutral">{setup.notConfigured}</Badge>
                )),
            };
          })}
        />
      </Card>

      <form action={finishSetup}>
        <Button size="l" type="submit">
          {setup.doneSubmit}
        </Button>
      </form>
    </>
  );
}

export const metadata = { title: setup.title };
