import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Infobox } from "@/components/ui/infobox";
import type { BadgeTone } from "@/components/ui/types";
import { setup } from "@/lib/strings";
import { type CheckLevel, checkEnvironment, hasBlockingIssue } from "@/server/environment";
import styles from "./setup-steps.module.css";
import { StepRail } from "./step-rail";

/** 검사 결과의 세 단계를 배지 톤으로 옮긴다. 뜻이 같은 것끼리 짝지어 둔다. */
const BADGE_TONES: Readonly<Record<CheckLevel, BadgeTone>> = {
  ok: "grounded",
  warn: "needs-check",
  fail: "ungrounded",
};

/**
 * 점검 결과 한 줄 요약.
 *
 * 막히는 것 · 알아 둘 것 · 이상 없음 셋을 각각 다른 컴포넌트로 그린다.
 * 경고와 오류는 `alert`(파스텔 배경), 이상 없음은 `infobox`(흰 배경)다 —
 * `DESIGN.md` §6에서 둘은 다른 컴포넌트다.
 */
function Verdict({ blocked, warned }: { blocked: boolean; warned: boolean }) {
  if (blocked) {
    return (
      <Alert title={setup.environmentFail} tone="danger">
        {setup.environmentRecheckBody}
      </Alert>
    );
  }
  if (warned) {
    return (
      <Alert title={setup.environmentWarn} tone="warning">
        {setup.environmentRecheckBody}
      </Alert>
    );
  }
  return <Infobox title={setup.environmentOk}>{setup.environmentRecheckBody}</Infobox>;
}

/**
 * 설치 1단계 — 서버 환경 점검. `PAGES.md` §17
 *
 * 설정을 다 넣은 뒤에 "데이터 폴더에 쓸 수 없다"는 것을 알게 되면, 그때는 무엇이 잘못됐는지
 * 찾기 어렵다. 그래서 아무것도 입력받기 전에 먼저 본다.
 *
 * **막히는 것이 있으면 다음으로 보내지 않는다.** 다만 경고는 막지 않는다 — 개발 모드나
 * 적은 디스크는 알릴 일이지 설치를 세울 일이 아니다.
 *
 * 검사는 화면을 열 때마다 다시 돈다. 그래서 문제를 고치고 새로 고치면 바로 반영된다 —
 * "다시 검사하기"는 그냥 이 주소를 다시 여는 링크다.
 */
export default function SetupPage() {
  const checks = checkEnvironment();
  const blocked = hasBlockingIssue(checks);
  const warned = checks.some((check) => check.level === "warn");

  return (
    <>
      <StepRail current="environment" />

      <header className={styles.header}>
        <h1 className={styles.title}>{setup.environmentTitle}</h1>
        <p className={styles.intro}>{setup.environmentIntro}</p>
      </header>

      <Verdict blocked={blocked} warned={warned} />

      <ul className={styles.checks}>
        {checks.map((check) => (
          <Card as="li" key={check.id} padding="tight">
            <div className={styles.checkHead}>
              <span className={styles.checkLabel}>{check.label}</span>
              {/*
                상태는 아이콘 + 라벨 + 색 3중으로 전한다(`DESIGN.md` §11).
                카드 자체에는 색을 입히지 않는다 — 좌측 색 보더 액센트는 §11이 금지한다.
              */}
              <Badge tone={BADGE_TONES[check.level]}>{setup.levels[check.level]}</Badge>
            </div>
            <p className={styles.checkValue}>{check.value}</p>
            <p className={styles.checkNote}>{check.note}</p>
          </Card>
        ))}
      </ul>

      <div className={styles.actions}>
        {blocked ? null : (
          <ButtonLink href="/setup/account" size="l">
            {setup.environmentSubmit}
          </ButtonLink>
        )}
        <a className={styles.recheck} href="/setup">
          {setup.environmentRecheck}
        </a>
      </div>
    </>
  );
}

export const metadata = { title: setup.title };
