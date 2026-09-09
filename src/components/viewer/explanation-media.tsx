import Image from "next/image";
import { thumbHashToDataURL } from "thumbhash";
import type { CaseMediaPlacement } from "@/lib/case-media";
import styles from "./explanation-media.module.css";
import { MediaReport } from "./media-report";

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

/** WebP가 도착하기 전에는 자산과 함께 저장한 ThumbHash를 실제 흐림 이미지로 그린다. */
function ExplanationMedia({
  media,
  reportable = false,
}: {
  media: CaseMediaPlacement;
  reportable?: boolean;
}) {
  const placeholder = thumbHashToDataURL(decodeBase64(media.thumbhash));

  return (
    <figure className={styles.figure} data-recipe-key={media.recipeKey}>
      <div className={styles.imageWrap}>
        <Image
          alt={media.alt}
          blurDataURL={placeholder}
          className={styles.image}
          height={media.height}
          placeholder="blur"
          priority={false}
          sizes="(max-width: 760px) 100vw, (max-width: 1180px) 54vw, 620px"
          src={media.src}
          unoptimized={true}
          width={media.width}
        />
      </div>
      <figcaption className={styles.caption}>
        <span>{media.caption}</span>
        {reportable ? <MediaReport placementId={media.id} /> : null}
      </figcaption>
    </figure>
  );
}

export { ExplanationMedia };
