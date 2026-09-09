import Image from "next/image";
import { thumbHashToDataURL } from "thumbhash";
import { type ServiceCharacterKind, serviceCharacters } from "@/lib/service-characters";

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function ServiceCharacter({
  character,
  className,
  priority = false,
}: {
  character: ServiceCharacterKind;
  className?: string;
  priority?: boolean;
}) {
  const asset = serviceCharacters[character];
  const blurDataUrl =
    asset.thumbhash === null ? undefined : thumbHashToDataURL(decodeBase64(asset.thumbhash));
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={className}
      blurDataURL={blurDataUrl}
      height={asset.height}
      priority={priority}
      placeholder={blurDataUrl === undefined ? "empty" : "blur"}
      sizes="(max-width: 640px) 180px, 300px"
      src={asset.src}
      width={asset.width}
    />
  );
}

export { ServiceCharacter };
