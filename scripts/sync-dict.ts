/**
 * 표준국어대사전을 사전 DB로 가져온다. [F-29]
 *
 * biome-ignore-all lint/correctness/noNodejsModules: 자료를 들여오는 스크립트다.
 *
 * **절차는 `server/dict-sync.ts`에 있다.** 서버가 스스로 도는 예약 작업도 같은 함수를
 * 부른다 — 두 곳에 같은 절차를 두면 언젠가 한쪽만 고쳐진다. 여기는 명령줄 껍데기다.
 *
 * 사용:
 *   npm run dict:sync                 # 내려받아서 가져오기
 *   npm run dict:sync -- --file a.zip # 이미 받아 둔 파일로
 *   npm run dict:sync -- --force      # 같은 판이어도 다시 넣기
 *
 * **임시 파일을 만들지 않는다.** 받은 zip은 메모리에 두고 그 안에서 JSON을 하나씩 푼다.
 * 디스크에 풀지 않으므로 지울 것도 없다. `--save`를 준 경우에만 받은 파일을 남긴다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { syncStandardDictionary } from "@/server/dict-sync";

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : (process.argv[at + 1] ?? "");
}

const BUILT_AT = /(\d{8})\.zip/u;

async function main(): Promise<void> {
  const local = flag("file");
  const zip = local === undefined || local.length === 0 ? undefined : readFileSync(local);

  if (zip !== undefined) {
    const keep = flag("save");
    if (keep !== undefined && keep.length > 0) {
      writeFileSync(keep, zip);
      out(`받은 파일을 ${keep}에 두었습니다.`);
    }
  }

  const started = Date.now();
  const result = await syncStandardDictionary({
    zip,
    builtAt: local === undefined ? undefined : (BUILT_AT.exec(local)?.[1] ?? undefined),
    force: flag("force") !== undefined,
    onFile: (done, total) => {
      if (done % 10 === 0 || done === total) {
        out(`  ${done}/${total}`);
      }
    },
  });

  out("");
  out(`${result.detail} (${((Date.now() - started) / 1000).toFixed(1)}초)`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
