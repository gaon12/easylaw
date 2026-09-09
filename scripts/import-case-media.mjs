import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

const ROOT = process.cwd();
const MEDIA_ROOT = path.join(ROOT, "assets", "media", "cases", "2023da287663");
const SOURCE_ROOT = path.join(MEDIA_ROOT, "sources");
const OUTPUT = path.join(MEDIA_ROOT, "generated");

const SOURCES = [
  {
    name: "payment-plan-002",
    source: path.join(SOURCE_ROOT, "payment-plan-002-source.png"),
  },
  {
    name: "payment-dispute-002",
    source: path.join(SOURCE_ROOT, "payment-dispute-002-source.png"),
  },
  {
    name: "plan-review-002",
    source: path.join(SOURCE_ROOT, "plan-review-002-source.png"),
  },
  {
    name: "remand-review-002",
    source: path.join(SOURCE_ROOT, "remand-review-002-source.png"),
  },
];

async function thumbhash(source) {
  const { data, info } = await sharp(source)
    .resize({ width: 100, height: 100, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

await mkdir(OUTPUT, { recursive: true });

await Promise.all(
  SOURCES.map(async (item) => {
    const metadata = await sharp(item.source).metadata();
    const aspect = (metadata.width ?? 4) / (metadata.height ?? 3);

    await Promise.all(
      [640, 1200].map((width) =>
        sharp(item.source)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 84, effort: 6 })
          .toFile(path.join(OUTPUT, `${item.name}-${width}.webp`)),
      ),
    );

    process.stdout.write(
      `${JSON.stringify({
        name: item.name,
        width: 1200,
        height: Math.round(1200 / aspect),
        thumbhash: await thumbhash(item.source),
      })}\n`,
    );
  }),
);
