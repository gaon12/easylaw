import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Infobox } from "@/components/ui/infobox";
import { appDb } from "@/db/client";
import { setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { shouldUseSecureCookies, siteTimeZone } from "@/server/settings";
import { saveService } from "@/server/setup-actions";
import styles from "../setup-steps.module.css";
import { StepRail } from "../step-rail";

/**
 * 설치 3단계 — 서비스 환경. `PAGES.md` §17
 *
 * 시간대와 https 두 가지만 묻는다. **둘 다 코드가 실제로 쓰는 값이다** —
 * 시간대는 날짜 표시와 보관 기한 계산에, https는 세션 쿠키의 `secure` 플래그에 쓰인다.
 * 쓰지도 않는 값을 물어보는 마법사가 가장 나쁘다.
 *
 * 시간대 목록은 `Intl.supportedValuesOf`로 이 런타임이 실제로 아는 것만 보여 준다.
 * 손으로 적은 목록은 Node를 올리는 순간 낡는다.
 */
export default async function ServicePage() {
  const session = await currentSession();
  if (session?.role !== "admin") {
    redirect("/setup");
  }

  const db = appDb();
  const zones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <StepRail current="service" />

      <header className={styles.header}>
        <h1 className={styles.title}>{setup.serviceTitle}</h1>
        <p className={styles.intro}>{setup.serviceIntro}</p>
      </header>

      <form action={saveService} className={styles.form}>
        <fieldset className={styles.group}>
          <legend className={styles.groupTitle}>{setup.timeZoneTitle}</legend>
          <p className={styles.groupBody}>{setup.timeZoneBody}</p>

          <label className={styles.field}>
            <span className={styles.label}>{setup.timeZoneLabel}</span>
            <select className={styles.input} defaultValue={siteTimeZone(db)} name="time_zone">
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <span className={styles.hint}>{setup.timeZoneHint}</span>
          </label>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.groupTitle}>{setup.httpsTitle}</legend>
          <p className={styles.groupBody}>{setup.httpsBody}</p>

          {/*
            켜면 http에서 로그인이 조용히 막힌다. 되돌리기 어려운 실수라 경고를 체크박스
            **위**에 둔다 — 아래 두면 이미 누른 뒤에 읽는다.
          */}
          <Infobox title={setup.httpsLabel} tone="warning">
            {setup.httpsWarn}
          </Infobox>

          <label className={styles.checkboxRow}>
            <input
              className={styles.checkbox}
              defaultChecked={shouldUseSecureCookies(db)}
              name="secure_cookies"
              type="checkbox"
              value="true"
            />
            <span className={styles.label}>{setup.httpsLabel}</span>
          </label>
        </fieldset>

        <Button size="l" type="submit">
          {setup.serviceSubmit}
        </Button>
      </form>
    </>
  );
}

export const metadata = { title: setup.title };
