/** 관리자와 같은 동기화 엔진으로 모든 법제처 목록·상세자료를 제한 병렬 저장한다. */
import process from "node:process";
import {
  isLegalSyncSource,
  type LegalSyncSource,
  SOURCE_NAMES,
  startLegalSync,
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
  const sources = requestedSources();
  process.stdout.write(`${sources.join(", ")}: 최대 3개 자료군 병렬 동기화 시작\n`);
  await startLegalSync(sources, "manual", true);
  process.stdout.write("선택한 자료군 동기화 종료\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "동기화 실패"}\n`);
  process.exitCode = 1;
});
