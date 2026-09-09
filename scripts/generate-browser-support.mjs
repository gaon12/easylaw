import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import browserslist from "browserslist";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputPath = fileURLToPath(
  new URL("../src/lib/browser-support.generated.ts", import.meta.url),
);

const familyNames = {
  chrome: "chrome",
  firefox: "firefox",
  safari: "safari",
  ios_saf: "iosSafari",
};

const majors = {
  chrome: new Set(),
  firefox: new Set(),
  safari: new Set(),
  iosSafari: new Set(),
};

for (const target of browserslist(undefined, { path: projectRoot })) {
  const [browser, version] = target.split(" ");
  const family = familyNames[browser];
  if (!(family && version)) {
    continue;
  }

  for (const part of version.split("-")) {
    const major = Number.parseInt(part, 10);
    if (Number.isFinite(major)) {
      majors[family].add(major);
    }
  }
}

for (const [family, versions] of Object.entries(majors)) {
  if (versions.size === 0) {
    throw new Error(`Browserslist에서 ${family} 지원 버전을 찾지 못했습니다.`);
  }
}

const values = Object.fromEntries(
  Object.entries(majors).map(([family, versions]) => [
    family,
    [...versions].sort((left, right) => right - left),
  ]),
);

const rows = Object.entries(values)
  .map(([family, versions]) => `  ${family}: [${versions.join(", ")}],`)
  .join("\n");

const source = `/* biome-ignore-all lint/style/noMagicNumbers: Browserslist가 만든 브라우저 메이저 버전이다. */
/**
 * 이 파일은 \`.browserslistrc\`에서 생성됩니다.
 * 직접 고치지 말고 \`npm run browser-support:generate\`를 실행하세요.
 */
export const browserSupportMajors = {
${rows}
} as const;
`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== source) {
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, source, "utf8");
}
