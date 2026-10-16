"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import type { TestimonialItem } from "./Testimonials";

/** Time each position is shown before the carousel moves on. */
export const TESTIMONIAL_ADVANCE_MS = 6000;

function Rating({ value }: { value: number }) {
  return (
    <p className="flex gap-0.5 text-saffron" aria-label={`Rated ${value} out of 5`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden size={15} className={i < value ? "fill-current" : "text-line-strong"} />
      ))}
    </p>
  );
}

/**
 * A horizontal, scroll-snapped strip of review cards (1 per view on phones, 2 on tablets, 3 on
 * desktop) that slides one card to the left every few seconds and loops back to the start.
 *
 * - Native scrolling, so touch swipe and trackpads work; Previous/Next buttons and dots too.
 * - Auto-advance pauses on hover, keyboard focus, touch/scroll interaction, when off-screen or the
 *   tab is hidden, and via an explicit Pause button (WCAG 2.2.2). It never starts for
 *   prefers-reduced-motion.
 * - When every card already fits, nothing moves and no controls are shown.
 */
export function TestimonialCarousel({ items }: { items: TestimonialItem[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const [lastStart, setLastStart] = useState(items.length - 1);
  const [paused, setPaused] = useState(false); // user's explicit choice
  const [reducedMotion, setReducedMotion] = useState(false);
  const hovering = useRef(false);
  const focused = useRef(false);
  const visible = useRef(true);
  const lastInteraction = useRef(0);

  const cards = useCallback(() => Array.from(track.current?.querySelectorAll<HTMLElement>("[data-testimonial-id]") ?? []), []);

  /** Index of the card nearest the start of the strip, read from the DOM (never stale). */
  const currentIndex = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const origin = el.getBoundingClientRect().left;
    let first = 0;
    let best = Infinity;
    cards().forEach((c, i) => {
      const d = Math.abs(c.getBoundingClientRect().left - origin);
      if (d < best) [best, first] = [d, i];
    });
    return first;
  }, [cards]);

  /** Recompute which card is first in view and whether there is anything to scroll to. */
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const list = cards();
    const origin = el.getBoundingClientRect().left;
    const first = currentIndex();
    const perView = Math.max(1, list.filter((c) => c.getBoundingClientRect().right <= el.getBoundingClientRect().right + 2 && c.getBoundingClientRect().left >= origin - 2).length);
    setIndex(first);
    setLastStart(Math.max(0, list.length - perView));
    setScrollable(el.scrollWidth > el.clientWidth + 2);
  }, [cards, currentIndex]);

  const goTo = useCallback(
    (i: number) => {
      const el = track.current;
      const card = cards()[i];
      if (!el || !card) return;
      const left = card.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      el.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [cards, reducedMotion],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const at = currentIndex();
      goTo(dir === 1 ? (at >= lastStart ? 0 : at + 1) : at <= 0 ? lastStart : at - 1);
    },
    [currentIndex, goTo, lastStart],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(media.matches);
    onMotion();
    media.addEventListener("change", onMotion);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const io = new IntersectionObserver(([entry]) => (visible.current = Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    io.observe(el);
    return () => {
      media.removeEventListener("change", onMotion);
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      resize.disconnect();
      io.disconnect();
    };
  }, [measure]);

  const autoplay = scrollable && !paused && !reducedMotion;
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      if (hovering.current || focused.current || !visible.current || document.hidden) return;
      if (Date.now() - lastInteraction.current < TESTIMONIAL_ADVANCE_MS) return;
      step(1);
    }, TESTIMONIAL_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [autoplay, step]);

  const interacted = () => (lastInteraction.current = Date.now());

  return (
    <div
      className="mt-12"
      role="region"
      aria-roledescription="carousel"
      aria-label="Traveller reviews"
      data-autoplay={autoplay ? "on" : "off"}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
      onFocus={() => (focused.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focused.current = false;
      }}
    >
      <ul
        ref={track}
        data-testimonial-track
        aria-live={autoplay ? "off" : "polite"}
        onPointerDown={interacted}
        onWheel={interacted}
        onTouchStart={interacted}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-6 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((t, i) => (
          <li
            key={t.id}
            data-testimonial-id={t.id}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className="flex w-[85%] shrink-0 snap-start flex-col rounded-sm border border-line bg-surface p-6 sm:w-[calc((100%-1.5rem)/2)] sm:p-7 lg:w-[calc((100%-3rem)/3)]"
          >
            {t.rating !== null && <Rating value={t.rating} />}
            <blockquote className={`font-display text-[1.125rem] leading-relaxed text-ink-soft ${t.rating !== null ? "mt-4" : ""}`}>“{t.quote}”</blockquote>
            <p className="mt-auto border-t border-line pt-4 text-sm">
              <span className="font-semibold text-ink">{t.authorName}</span>
              {t.location && <span className="text-muted"> · {t.location}</span>}
            </p>
          </li>
        ))}
      </ul>

      {scrollable && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" role="group" aria-label="Choose review">
            {Array.from({ length: lastStart + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  interacted();
                  goTo(i);
                }}
                aria-label={`Show review ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className="grid h-6 w-6 place-items-center rounded-full"
              >
                <span aria-hidden className={`block h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-ink" : "w-1.5 bg-line-strong"}`} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!reducedMotion && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                {paused ? <Play aria-hidden size={15} /> : <Pause aria-hidden size={15} />}
                {paused ? "Play" : "Pause"}
                <span className="sr-only"> automatic scrolling</span>
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous review" onClick={() => { interacted(); step(-1); }}>
              <ChevronLeft aria-hidden size={18} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Next review" onClick={() => { interacted(); step(1); }}>
              <ChevronRight aria-hidden size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
