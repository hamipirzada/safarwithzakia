"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { Wordmark } from "./Wordmark";

/**
 * Site header. Transparent over the home hero until the page scrolls, solid everywhere else.
 * The mobile menu is a disclosure panel: Escape closes it and focus returns to the toggle.
 */
export interface Announcement {
  message: string;
  linkHref: string;
  linkLabel: string;
}

export function HeaderBar({ businessName, announcement }: { businessName: string; announcement: Announcement | null }) {
  const pathname = usePathname();
  const overlay = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  // The menu remembers the page it was opened on, so navigating elsewhere closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean | ((current: boolean) => boolean)) =>
    setOpenedOn((current) => ((typeof next === "function" ? next(current === pathname) : next) ? pathname : null));
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedOn(null);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const transparent = overlay && !scrolled && !open;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={`${overlay ? "fixed" : "sticky"} inset-x-0 top-0 z-40 transition-colors duration-300 ${
        transparent ? "bg-transparent text-paper" : "border-b border-line bg-paper/95 text-ink backdrop-blur-sm"
      }`}
    >
      {announcement && (
        <div className="bg-saffron text-night">
          <p className="container-page py-2 text-center text-sm font-medium">
            {announcement.message}
            {announcement.linkHref && announcement.linkLabel && (
              <>
                {" "}
                <Link href={announcement.linkHref} className="underline underline-offset-2">
                  {announcement.linkLabel}
                </Link>
              </>
            )}
          </p>
        </div>
      )}
      <div className="container-page flex h-16 items-center justify-between gap-6 lg:h-[4.5rem]">
        <Link href="/" className="rounded-xs" aria-label={`${businessName} — home`}>
          <Wordmark name={businessName} tone={transparent ? "light" : "ink"} />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-sm px-3 py-2 text-[0.9375rem] font-medium transition-colors ${
                transparent ? "text-paper/85 hover:text-paper" : "text-ink-soft hover:text-ink"
              } aria-[current=page]:underline aria-[current=page]:decoration-saffron aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8`}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/trip-builder" className={`btn btn-sm ml-3 ${transparent ? "btn-on-dark" : "btn-primary"}`}>
            Plan your trip
          </Link>
        </nav>

        <button
          ref={toggleRef}
          type="button"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-sm lg:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden size={22} /> : <Menu aria-hidden size={22} />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      <div id={menuId} hidden={!open} className="border-t border-line bg-paper text-ink lg:hidden">
        <nav aria-label="Main" className="container-page flex flex-col py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="flex min-h-12 items-center border-b border-line/70 text-lg font-medium last:border-0 aria-[current=page]:text-saffron-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/trip-builder" className="btn btn-primary mt-4 mb-2 w-full">
            Plan your trip
          </Link>
        </nav>
      </div>
    </header>
  );
}
