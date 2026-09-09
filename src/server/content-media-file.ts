import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MEDIA_ROOT = path.resolve(process.cwd(), "assets", "media");

/** 코드 레지스트리에 등록된 상대 경로만 `assets/media` 아래에서 읽는다. */
async function readContentMediaFile(storageKey: string): Promise<ArrayBuffer | undefined> {
  const filePath = path.resolve(MEDIA_ROOT, storageKey);
  if (!filePath.startsWith(`${MEDIA_ROOT}${path.sep}`)) {
    return;
  }
  try {
    return Uint8Array.from(await readFile(filePath)).buffer;
  } catch {
    return;
  }
}

export { readContentMediaFile };
