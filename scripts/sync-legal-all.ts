/** 관리자와 같은 동기화 엔진으로 모든 법제처 목록·상세자료를 순차 저장한다. */
import process from "node:process";
import {
  isLegalSyncSource,
  type LegalSyncSource,
  SOURCE_NAMES,
  syncLegalSource,
} from "@/server/legal-sync";

function requestedSources(): LegalSyncSource[] {
  const index = process.argv.indexOf("--source");
  if (index === -1) {
    // 작은 자료군을 먼저 끝내고 가장 큰 시행일법령은 마지막에 받는다.
    return [...SOURCE_NAMES.filter((source) => source !== "eflaw"), "eflaw"];
  }
  const source = process.argv[index + 1];
  if (source === undefined || !isLegalSyncSource(source)) {
    throw new Error(`알 수 없는 자료 종류입니다: ${source ?? "(없음)"}`);
  }
  return [source];
}

async function main(): Promise<void> {
  for (const source of requestedSources()) {
    process.stdout.write(`${source}: 목록·상세 동기화 시작\n`);
    // biome-ignore lint/performance/noAwaitInLoops: 공공 API 자료군을 병렬 호출하지 않는다.
    await syncLegalSource(source, "manual", true);
    process.stdout.write(`${source}: 동기화 종료\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "동기화 실패"}\n`);
  process.exitCode = 1;
});
