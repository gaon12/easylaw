import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { PaperFigure } from "@/components/ui/paper-figure";
import { GenerationProgress } from "@/components/viewer/generation-progress";
import type { ViewLevel } from "@/components/viewer/levels";
import { RenditionPanel } from "@/components/viewer/rendition-panel";
import type { PlaceholderState, Sentence } from "@/components/viewer/rendition-state";
import { viewer } from "@/lib/strings";
import styles from "./rendition-section.module.css";

/**
 * 설명 칸. **공개 판례와 올린 판결문이 같은 것을 쓴다**(`PAGES.md` §5).
 *
 * > 두 경로가 **같은 컴포넌트**를 쓴다. 차이는 세 가지뿐이다 — 접근·색인·설명본의 공유 여부.
 *
 * 그 셋은 전부 화면(page) 쪽 문제다. 그려 내는 일은 여기 한 벌만 있다. 두 벌이 되면
 * 한쪽에만 있는 상태가 생기고, 그게 대개 올린 문서 쪽이다 — 화면이 덜 보이는 쪽이
 * 자기 사건 판결문을 읽는 사람의 화면이 된다.
 *
 * **상태를 여기서 정하지 않는다.** 무엇을 보여 줄지는 화면이 계산해서 넘긴다. 공개 판례에는
 * 요청자 상한 같은 규칙이 더 붙고, 올린 문서에는 소유자 확인이 붙는다.
 */

type Level = Exclude<ViewLevel, "L0">;

const PLACEHOLDER_COPY = {
  off: { title: viewer.generatorOffTitle, body: viewer.generatorOffBody },
  limited: { title: viewer.limitTitle, body: viewer.limitBody },
  ready: { title: viewer.generateHint, body: viewer.generateBody },
} as const;

interface SectionProps {
  /** 이 문서의 화면 주소. 새로 고침 링크를 만든다. */
  readonly basePath: string;
  /** 진행을 흘려보내는 주소(SSE). */
  readonly progressPath: string;
  readonly level: Level;
  readonly sentences: readonly Sentence[];
  readonly state: PlaceholderState;
  /** 현재 프롬프트 판보다 오래된 설명이면 만든 날짜, 현재 판이면 null. */
  readonly outdatedAt: string | null;
  /** 만들기 폼이 부를 서버 액션. 공개 판례와 올린 문서가 서로 다른 것을 쓴다. */
  readonly action: (formData: FormData) => Promise<void>;
  /** 액션에 함께 보낼 값. `{ caseNo }` 또는 `{ docId }`. */
  readonly fields: Readonly<Record<string, string>>;
}

/** 다시 눌러 볼 수 있는 자리. 처음 만들 때와 실패한 뒤가 같은 폼을 쓴다. */
function GenerateForm({
  action,
  fields,
  level,
  label,
  showWait = true,
}: {
  action: SectionProps["action"];
  fields: SectionProps["fields"];
  level: Level;
  label: string;
  showWait?: boolean;
}) {
  // 자바스크립트 없이 동작한다. 누르면 서버가 자리를 잡고, 만드는 일은 응답 뒤에 이어진다.
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <input name="level" type="hidden" value={level} />
      <Button size="l" type="submit">
        {label}
      </Button>
      {showWait ? <p className={styles.emptyBody}>{viewer.generateWait}</p> : null}
    </form>
  );
}

/** 옛 설명은 숨기지 않는다. 만든 시점과 새 설명을 만들 수 있는 상태를 함께 밝힌다. */
function OutdatedNotice({
  outdatedAt,
  state,
  action,
  fields,
  level,
  progressPath,
  basePath,
}: Omit<SectionProps, "sentences"> & { outdatedAt: string }) {
  let body: string = viewer.outdatedBody;
  let actions: ReactNode;

  if (state.kind === "off") {
    body = viewer.generatorOffBody;
  } else if (state.kind === "limited") {
    body = viewer.limitBody;
  } else if (state.kind === "failed") {
    body = state.reason ?? viewer.generateFailed;
    actions = (
      <GenerateForm
        action={action}
        fields={fields}
        label={viewer.outdated}
        level={level}
        showWait={false}
      />
    );
  } else if (state.kind === "running") {
    body = viewer.generatingByOther;
    actions = (
      <>
        <GenerationProgress initialStage={state.stage} path={progressPath} />
        <ButtonLink href={`${basePath}?level=${level}`} size="s" variant="secondary">
          {viewer.progressRefresh}
        </ButtonLink>
      </>
    );
  } else {
    actions = (
      <GenerateForm
        action={action}
        fields={fields}
        label={viewer.outdated}
        level={level}
        showWait={false}
      />
    );
  }

  return (
    <Alert actions={actions} title={viewer.outdatedHint(outdatedAt)} tone="warning">
      {body}
    </Alert>
  );
}

/**
 * 설명이 아직 없을 때.
 *
 * 안내 상자 하나로 끝내지 않고 자리를 갖춘 빈 상태로 그린다 — 옆 칸에는 원문이 있으니
 * "아무것도 없는 화면"은 아니라는 것도 함께 보여야 한다.
 */
function RenditionPlaceholder({
  basePath,
  progressPath,
  level,
  state,
  action,
  fields,
}: Omit<SectionProps, "sentences" | "outdatedAt">) {
  if (state.kind === "running") {
    return (
      <div className={styles.empty}>
        <PaperFigure mood="empty" />
        <h3 className={styles.emptyTitle}>{viewer.progressTitle}</h3>
        <GenerationProgress initialStage={state.stage} path={progressPath} />
        {/* 스크립트가 없으면 위 줄이 저절로 바뀌지 않는다. 그때 누를 것을 함께 둔다. */}
        <ButtonLink href={`${basePath}?level=${level}`} size="s" variant="secondary">
          {viewer.progressRefresh}
        </ButtonLink>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div className={styles.empty}>
        <PaperFigure mood="empty" />
        <h3 className={styles.emptyTitle}>{viewer.failedTitle}</h3>
        {/* 왜 실패했는지 그대로 적는다. 감추면 관리자도 무엇을 고칠지 알 수 없다. */}
        {state.reason === null ? null : <p className={styles.emptyBody}>{state.reason}</p>}
        <GenerateForm action={action} fields={fields} label={viewer.regenerate} level={level} />
      </div>
    );
  }

  const copy = PLACEHOLDER_COPY[state.kind];

  return (
    <div className={styles.empty}>
      <PaperFigure mood="empty" />
      <h3 className={styles.emptyTitle}>{copy.title}</h3>
      <p className={styles.emptyBody}>{copy.body}</p>

      {state.kind === "ready" ? (
        <GenerateForm action={action} fields={fields} label={viewer.generateCta} level={level} />
      ) : null}
    </div>
  );
}

/** 만들어진 것이 있으면 그것을, 없으면 상태에 맞는 빈 자리를 그린다. */
function RenditionSection({ sentences, outdatedAt, ...rest }: SectionProps) {
  return (
    <section className={styles.panel}>
      {/* 칸 이름표는 스크린리더에만. 위키 문서에는 칸 제목이 없다. */}
      <h2 className="sr-only">{viewer.renditionPanel}</h2>
      {sentences.length > 0 ? (
        <>
          {outdatedAt === null ? null : <OutdatedNotice {...rest} outdatedAt={outdatedAt} />}
          <RenditionPanel
            level={rest.level}
            needsCheckCount={
              sentences.filter((sentence) => sentence.confidence === "needs_check").length
            }
            sentences={sentences}
          />
        </>
      ) : (
        <RenditionPlaceholder {...rest} />
      )}
    </section>
  );
}

export { RenditionSection };
