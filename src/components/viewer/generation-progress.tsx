"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { viewer } from "@/lib/strings";

/**
 * 단계 이름. `db/corpus/schema.ts`의 `JOB_STAGES`와 같은 값이어야 한다.
 *
 * 저장소에서 타입을 가져오지 않는 이유는 **이 파일이 클라이언트 번들에 들어가기 때문**이다.
 * 문구 표의 열쇠로 정의하면, 단계가 늘었는데 문구가 없으면 그 자리에서 타입이 깨진다.
 */
type Stage = keyof typeof viewer.progressStages;

interface Progress {
  status: "idle" | "queued" | "running" | "done" | "failed";
  stage?: Stage | null;
}

/**
 * 만드는 동안 어디까지 왔는지 보여 준다. `PRODUCT.md` §5.3
 *
 * **스크립트가 없어도 화면은 멀쩡하다.** 서버가 그린 첫 마크업에 이미 "만들고 있어요"와
 * 새로 고침 링크가 있고, 스크립트가 있으면 그 자리가 저절로 바뀔 뿐이다. 이 화면 전체가
 * 자바스크립트 없이 도는 것을 전제로 만들어져 있다(`74d4348` 이후).
 *
 * 끝나면 `router.refresh()`로 **서버에게 다시 그리라고 한다.** 만들어진 문장을 이 컴포넌트가
 * 직접 받아 그리지 않는다 — 그러면 같은 화면을 두 벌(서버용·클라이언트용) 갖게 된다.
 */
function GenerationProgress({
  path,
  initialStage,
}: {
  /** 진행을 흘려보내는 주소. 공개 판례와 올린 문서가 서로 다른 라우트를 쓴다. */
  path: string;
  initialStage: Stage | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage | null>(initialStage);

  useEffect(() => {
    const source = new EventSource(path);

    source.onmessage = (event) => {
      const progress = JSON.parse(event.data) as Progress;

      if (progress.status === "done" || progress.status === "failed") {
        source.close();
        router.refresh();
        return;
      }
      setStage(progress.stage ?? null);
    };

    /*
     * 연결이 끊겨도 아무 말도 하지 않는다. EventSource는 스스로 다시 붙고, 그 사이에
     * "연결이 끊겼어요"를 띄우면 대개 아무 문제도 없는 상황에서 사람을 놀라게 한다.
     */
    return () => {
      source.close();
    };
  }, [path, router]);

  return (
    <p aria-live="polite">{stage === null ? viewer.progressStart : viewer.progressStages[stage]}</p>
  );
}

export { GenerationProgress };
