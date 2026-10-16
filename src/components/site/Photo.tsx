import Image from "next/image";

export interface PhotoAsset {
  path: string;
  alt: string;
  width: number;
  height: number;
  credit?: string | null;
}

/**
 * Responsive photograph with an optional credit line. When no asset is available a quiet
 * paper-toned placeholder is rendered instead of a broken or random image.
 */
export function Photo({
  asset,
  sizes,
  priority = false,
  className = "",
  showCredit = false,
  fill = true,
  fallbackLabel,
}: {
  asset: PhotoAsset | null | undefined;
  sizes: string;
  priority?: boolean;
  className?: string;
  showCredit?: boolean;
  fill?: boolean;
  fallbackLabel?: string;
}) {
  if (!asset) {
    return (
      <div
        className={`flex items-end bg-paper-deep bg-[radial-gradient(circle_at_30%_20%,#f6f2ea_0,transparent_60%)] p-4 ${className}`}
        role="img"
        aria-label={fallbackLabel ?? "Photograph coming soon"}
      >
        <span className="text-xs tracking-wide text-muted uppercase">{fallbackLabel ?? "Photograph coming soon"}</span>
      </div>
    );
  }
  return (
    <figure className={`${/\babsolute\b/.test(className) ? "" : "relative"} overflow-hidden ${className}`}>
      {fill ? (
        <Image src={asset.path} alt={asset.alt} fill sizes={sizes} preload={priority} className="object-cover" />
      ) : (
        <Image src={asset.path} alt={asset.alt} width={asset.width} height={asset.height} sizes={sizes} preload={priority} className="h-auto w-full" />
      )}
      {showCredit && asset.credit && (
        <figcaption className="absolute right-2 bottom-2 rounded-xs bg-night/55 px-1.5 py-0.5 text-[0.6875rem] text-paper/90">
          {asset.credit.replace(/^Photo: /, "")}
        </figcaption>
      )}
    </figure>
  );
}
