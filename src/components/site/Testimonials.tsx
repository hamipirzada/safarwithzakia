import { Star } from "lucide-react";
import { SectionHeading } from "./Cards";
import { TestimonialCarousel } from "./TestimonialCarousel";

export interface TestimonialItem {
  id: string;
  authorName: string;
  location: string | null;
  quote: string;
  rating: number | null;
}

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
 * Published, consented testimonials (filtered by the catalogue query and a database constraint).
 * One review is shown as a featured quote; two or more in an auto-advancing carousel.
 */
export function Testimonials({ items }: { items: TestimonialItem[] }) {
  if (items.length === 0) return null;
  const [first] = items;

  return (
    <section aria-labelledby="reviews-title" className="py-20 lg:py-24" data-testimonial-count={items.length}>
      <div className="container-page">
        <SectionHeading id="reviews-title" eyebrow="From our guests" title="Traveller stories" />
        {items.length === 1 && first ? (
          <figure data-testimonial-id={first.id} className="mt-12 max-w-3xl border-l-2 border-saffron pl-6 sm:pl-8">
            {first.rating !== null && <Rating value={first.rating} />}
            <blockquote className="mt-4 font-display text-[1.5rem] leading-snug font-light text-ink sm:text-[1.875rem]">“{first.quote}”</blockquote>
            <figcaption className="mt-5 text-sm">
              <span className="font-semibold text-ink">{first.authorName}</span>
              {first.location && <span className="text-muted"> · {first.location}</span>}
            </figcaption>
          </figure>
        ) : (
          <TestimonialCarousel items={items} />
        )}
      </div>
    </section>
  );
}
