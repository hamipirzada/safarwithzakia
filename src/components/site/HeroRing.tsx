"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export interface RingItem {
  key: string;
  href: string;
  title: string;
  caption: string;
  image: { path: string; alt: string };
}

/**
 * A draggable 3D ring of destination photographs (CSS 3D transforms, no WebGL).
 * - Pointer/touch drag rotates; release snaps to the nearest card. Vertical page scroll is kept.
 * - Arrow keys and the previous/next buttons step one card; the front card links to its page.
 * - Gentle auto-advance (one card every few seconds, resting front-facing) pauses on hover, focus,
 *   interaction and when off-screen, and is disabled entirely for prefers-reduced-motion.
 * - Each photo tracks loading → loaded / error (data-image-state). It is painted as soon as the browser
 *   decodes it (never blurred, never hidden behind JavaScript), and a failed image falls back to a
 *   toned card that still shows the destination name.
 */
const AUTO_ADVANCE_MS = 4500;

/** Cards nearest the front on first render load immediately; the rest load progressively. */
function loadingFor(index: number, count: number) {
  const distance = Math.min(index, count - index);
  if (distance === 0) return { loading: "eager" as const, fetchPriority: "high" as const };
  if (distance === 1) return { loading: "eager" as const, fetchPriority: "auto" as const };
  return { loading: "lazy" as const, fetchPriority: "low" as const };
}

// The card is portrait (3:4) but the photographs are landscape (up to ~1.8:1) and are cropped
// with object-cover, so the drawn image is ~2.4× the card's width. `sizes` must describe that
// drawn width (not the card width), otherwise the browser downloads an image ~half the size
// it needs and upscales it.
const RING_IMAGE_SIZES = "(min-width: 1024px) 560px, (min-width: 640px) 500px, 430px";

type LoadState = "loading" | "loaded" | "error";

function RingCardImage({ image, index, count }: { image: RingItem["image"]; index: number; count: number }) {
  const [state, setState] = useState<LoadState>("loading");
  const imgRef = useRef<HTMLImageElement>(null);

  // The image may finish loading before hydration attaches onLoad; reconcile once mounted.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  if (state === "error") {
    return (
      <span data-image-state="error" role="img" aria-label={image.alt} className="absolute inset-0 bg-gradient-to-b from-ink-soft to-night">
        <span className="sr-only">Image unavailable</span>
      </span>
    );
  }
  return (
    <Image
      ref={imgRef}
      src={image.path}
      alt={image.alt}
      fill
      sizes={RING_IMAGE_SIZES}
      {...loadingFor(index, count)}
      data-image-state={state}
      onLoad={() => setState("loaded")}
      onError={() => setState("error")}
      // Never hidden while loading: the browser paints the photo the moment it is decoded (over the
      // card's dark background). Gating visibility on hydration delayed the LCP by seconds on mobile.
      className="pointer-events-none object-cover"
      draggable={false}
    />
  );
}

export function HeroRing({ items }: { items: RingItem[] }) {
  const count = items.length;
  const step = 360 / count;
  const ringRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const paused = useRef(false);
  const visible = useRef(true);
  const reducedMotion = useRef(false);
  const lastInteraction = useRef(0);
  const justDragged = useRef(false);
  const [active, setActive] = useState(0);
  const liveId = useId();

  const indexForAngle = useCallback((deg: number) => ((Math.round(-deg / step) % count) + count) % count, [count, step]);

  const apply = useCallback(
    (deg: number, animate: boolean) => {
      angle.current = deg;
      const ring = ringRef.current;
      if (!ring) return;
      ring.style.transition = animate && !reducedMotion.current ? "transform 600ms var(--ease-out-soft)" : "none";
      ring.style.transform = `translateZ(calc(var(--ring-radius) * -1)) rotateY(${deg}deg)`;
      setActive(indexForAngle(deg));
    },
    [indexForAngle],
  );

  const snap = useCallback(() => apply(Math.round(angle.current / step) * step, true), [apply, step]);
  const go = useCallback(
    (direction: 1 | -1) => {
      lastInteraction.current = performance.now();
      apply(Math.round(angle.current / step) * step - direction * step, true);
    },
    [apply, step],
  );

  // Auto-advance: one card at a time, resting exactly front-facing between steps.
  // A continuously spinning ring keeps every photo under a changing perspective transform, which
  // browsers resample (and, for constantly animating 3D layers, rasterise at reduced resolution),
  // so the images never look crisp. Stepping lets the front card sit at an identity transform.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = media.matches;
    const onChange = () => (reducedMotion.current = media.matches);
    media.addEventListener("change", onChange);

    const observer = new IntersectionObserver(([entry]) => (visible.current = Boolean(entry?.isIntersecting)), { threshold: 0.2 });
    if (stageRef.current) observer.observe(stageRef.current);

    const timer = window.setInterval(() => {
      const idle = performance.now() - lastInteraction.current > AUTO_ADVANCE_MS;
      if (!reducedMotion.current && visible.current && !paused.current && !drag.current && idle && !document.hidden) {
        apply(Math.round(angle.current / step) * step - step, true);
      }
    }, AUTO_ADVANCE_MS);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      media.removeEventListener("change", onChange);
    };
  }, [apply, step]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { x: event.clientX, start: angle.current, moved: false };
    justDragged.current = false;
    lastInteraction.current = performance.now();
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    if (!current.moved && Math.abs(dx) > 6) {
      current.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    if (current.moved) apply(current.start + dx * 0.35, false);
  };
  const endDrag = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    lastInteraction.current = performance.now();
    if (moved) {
      justDragged.current = true;
      snap();
    }
  };
  const onClickCapture = (event: React.MouseEvent) => {
    // A drag that ends over a card must not also follow its link.
    if (justDragged.current) {
      justDragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  };

  const current = items[active]!;

  return (
    <div
      className="relative select-none"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="carousel"
        aria-label="Destinations in Kashmir"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className="relative mx-auto h-[19rem] w-full cursor-grab touch-pan-y rounded-sm [--card-w:11rem] [--ring-radius:12.5rem] [perspective:1100px] active:cursor-grabbing sm:h-[22rem] sm:[--card-w:13rem] sm:[--ring-radius:15rem] lg:h-[26rem] lg:[--card-w:14.5rem] lg:[--ring-radius:18rem]"
      >
        <div
          ref={ringRef}
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{ transform: "translateZ(calc(var(--ring-radius) * -1)) rotateY(0deg)" }}
        >
          {items.map((item, index) => {
            const isFront = index === active;
            return (
              <div
                key={item.key}
                className="absolute top-1/2 left-1/2 aspect-[3/4] w-[var(--card-w)] [backface-visibility:hidden]"
                style={{
                  transform: `translate(-50%, -50%) rotateY(${index * step}deg) translateZ(var(--ring-radius))`,
                }}
                aria-hidden={!isFront}
              >
                <Link
                  href={item.href}
                  tabIndex={isFront ? 0 : -1}
                  draggable={false}
                  onClick={(event) => {
                    if (!isFront) event.preventDefault();
                  }}
                  className={`group block h-full overflow-hidden rounded-sm bg-ink shadow-[0_20px_40px_-20px_rgb(0_0_0/0.6)] ring-1 ring-paper/15 transition-[filter] duration-500 ${
                    isFront ? "" : "brightness-[0.6]"
                  }`}
                >
                  <RingCardImage image={item.image} index={index} count={count} />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/90 via-night/40 to-transparent p-4 pt-12">
                    <span className="block font-display text-lg leading-tight text-paper">{item.title}</span>
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-paper">
        <button type="button" onClick={() => go(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-paper/30 hover:border-paper" aria-label="Previous destination">
          <ChevronLeft aria-hidden size={20} />
        </button>
        <p id={liveId} aria-live="polite" className="min-w-0 flex-1 text-center text-sm text-paper/80 sm:flex-none sm:min-w-56">
          <Link href={current.href} className="font-medium text-paper underline decoration-saffron underline-offset-4">
            {current.title}
          </Link>
          <span className="mt-0.5 block truncate text-xs text-paper/60">{current.caption}</span>
        </p>
        <button type="button" onClick={() => go(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-paper/30 hover:border-paper" aria-label="Next destination">
          <ChevronRight aria-hidden size={20} />
        </button>
      </div>
      <p className="mt-2 hidden text-center text-xs text-paper/50 sm:block">Drag, swipe or use the arrow keys</p>
    </div>
  );
}
