import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

const ROOT = process.cwd();
const SOURCE =
  process.argv[2] ?? path.join(ROOT, "assets", "characters", "easylaw-guides-v1-source.png");
const OUTPUT = path.join(ROOT, "public", "media", "characters");

async function makeThumbHash(source) {
  const { data, info } = await sharp(source)
    .resize({ width: 100, height: 100, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

async function writeCharacter({ name, left, width, sourceHeight }) {
  const output = path.join(OUTPUT, `${name}-640.webp`);
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

  const half = await sharp(SOURCE)
    .extract({ left, top: 0, width, height: sourceHeight })
    .png()
    .toBuffer();

  await sharp(half)
    .trim({ background: transparent, threshold: 2 })
    .extend({ top: 28, right: 28, bottom: 28, left: 28, background: transparent })
    .resize({ height: 640, withoutEnlargement: false })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(output);

  const metadata = await sharp(output).metadata();
  return {
    name,
    src: `/media/characters/${name}-640.webp`,
    width: metadata.width,
    height: metadata.height,
    thumbhash: await makeThumbHash(output),
  };
}

await mkdir(OUTPUT, { recursive: true });
const metadata = await sharp(SOURCE).metadata();
const sourceWidth = metadata.width ?? 0;
const sourceHeight = metadata.height ?? 0;
if (sourceWidth < 2 || sourceHeight < 2) {
  throw new Error("캐릭터 원본 크기를 읽을 수 없습니다.");
}

const middle = Math.floor(sourceWidth / 2);
const master = path.join(OUTPUT, "easylaw-guides-v1-1200.webp");
await sharp(SOURCE)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
  .resize({ width: 1200, withoutEnlargement: true })
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile(master);

const characters = await Promise.all([
  writeCharacter({
    name: "guide-male-001",
    left: 0,
    width: middle,
    sourceHeight,
  }),
  writeCharacter({
    name: "guide-female-001",
    left: middle,
    width: sourceWidth - middle,
    sourceHeight,
  }),
]);

process.stdout.write(`${JSON.stringify({ master, characters }, null, 2)}\n`);
