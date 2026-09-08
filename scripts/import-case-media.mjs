import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "public", "media", "cases", "2023da287663");

const SOURCES = [
  {
    name: "payment-plan-001",
    source:
      "C:/Users/solso/.codex/generated_images/01a070c8-0d4b-72b3-a76c-72afff3e3564/exec-0b48e782-f921-413b-a805-e82eef94ddfe.png",
  },
  {
    name: "payment-dispute-001",
    source:
      "C:/Users/solso/.codex/generated_images/01a070c8-0d4b-72b3-a76c-72afff3e3564/exec-e0504fe9-8bc2-48ab-8dd3-e175e040caa3.png",
  },
  {
    name: "plan-review-001",
    source:
      "C:/Users/solso/.codex/generated_images/01a070c8-0d4b-72b3-a76c-72afff3e3564/exec-40e71517-f26c-4979-b920-3f0a87c6257b.png",
  },
  {
    name: "remand-review-001",
    source:
      "C:/Users/solso/.codex/generated_images/01a070c8-0d4b-72b3-a76c-72afff3e3564/exec-3a77ea9d-79d8-4a23-be41-c46d26d7fef7.png",
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
