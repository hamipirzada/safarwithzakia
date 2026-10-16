"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CircleHelp,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageSquareQuote,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  TicketPercent,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { SIDEBAR_COOKIE } from "@/lib/admin-preferences";
import { authClient } from "@/lib/auth-client";
import { Wordmark } from "@/components/site/Wordmark";
import { Toaster } from "./Toaster";

export const ICONS = {
  dashboard: LayoutDashboard,
  enquiries: Inbox,
  packages: Package,
  destinations: MapPin,
  offers: TicketPercent,
  testimonials: MessageSquareQuote,
  faqs: CircleHelp,
  content: FileText,
  email: Mail,
  settings: Building2,
  staff: Users,
  audit: ScrollText,
} satisfies Record<string, LucideIcon>;

export interface AdminNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
}


/**
 * Tooltip for the collapsed rail. Positioned `fixed` from the item's own rectangle, because the nav
 * list scrolls vertically and a scrolling container clips anything that overflows it sideways.
 * Visual only (aria-hidden): the item itself carries the accessible name.
 */
function useRailTooltip(enabled: boolean, label: string) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = (event: React.SyntheticEvent<HTMLElement>) => {
    if (!enabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const hide = () => setPos(null);
  const tooltip =
    enabled && pos ? (
      <span
        aria-hidden
        role="tooltip"
        data-rail-tooltip={label}
        className="pointer-events-none fixed z-[70] -translate-y-1/2 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-paper shadow-card"
        style={{ top: pos.top, left: pos.left }}
      >
        {label}
      </span>
    ) : null;
  return { handlers: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide }, tooltip };
}

function NavLink({ href, label, Icon, active, collapsed, badge, onClick }: { href: string; label: string; Icon: LucideIcon; active: boolean; collapsed: boolean; badge?: number; onClick?: () => void }) {
  const { handlers, tooltip } = useRailTooltip(collapsed, badge ? `${label} (${badge})` : label);
  return (
    <Link
      href={href}
      onClick={onClick}
      {...handlers}
      aria-current={active ? "page" : undefined}
      data-nav-item={href}
      className={`group relative flex h-10 items-center gap-3 rounded-md text-sm text-paper/70 transition-colors hover:bg-paper/[0.06] hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-saffron aria-[current=page]:bg-paper/[0.1] aria-[current=page]:text-paper ${collapsed ? "justify-center px-0" : "px-3"}`}
    >
      {/* Active-route indicator, visible in both modes */}
      <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-saffron opacity-0 group-aria-[current=page]:opacity-100" />
      <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>
      {badge ? (
        collapsed ? (
          <span aria-hidden className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-saffron" />
        ) : (
          <span className="rounded-full bg-saffron px-1.5 text-xs font-semibold text-night">{badge}</span>
        )
      ) : null}
      {badge && collapsed ? <span className="sr-only">({badge})</span> : null}
      {tooltip}
    </Link>
  );
}

function RailAction({ label, Icon, collapsed, href, onClick, ...rest }: { label: string; Icon: LucideIcon; collapsed: boolean; href?: string; onClick?: () => void } & React.AriaAttributes) {
  const { handlers, tooltip } = useRailTooltip(collapsed, label);
  const cls = `relative flex h-10 w-full items-center gap-3 rounded-md text-sm text-paper/70 hover:bg-paper/[0.06] hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-saffron ${collapsed ? "justify-center" : "px-3"}`;
  const content = (
    <>
      <Icon aria-hidden size={18} strokeWidth={1.75} />
      <span className={collapsed ? "sr-only" : ""}>{label}</span>
      {tooltip}
    </>
  );
  return href ? (
    <a href={href} target="_blank" className={cls} {...handlers} {...rest}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls} {...handlers} {...rest}>
      {content}
    </button>
  );
}

export function AdminShell({ nav, user, initialCollapsed, children }: { nav: AdminNavItem[]; user: { name: string; role: string }; initialCollapsed: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // The drawer remembers the page it was opened on, so navigating closes it.
  const [drawerOpenedOn, setDrawerOpenedOn] = useState<string | null>(null);
  const drawerOpen = drawerOpenedOn === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  const toggleCollapsed = () => {
    // Cookie (read by the server layout) so the first render already has the right width: no flash.
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/admin; max-age=31536000; samesite=lax`;
      return next;
    });
  };

  const closeDrawer = useCallback(() => {
    setDrawerOpenedOn(null);
    menuButtonRef.current?.focus();
  }, []);

  // Drawer: focus the first link, trap Tab inside, close on Escape, lock page scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const panel = drawerRef.current;
    const focusables = () => [...(panel?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])];
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === "Tab") {
        const items = focusables();
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [drawerOpen, closeDrawer]);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  const navList = (mode: "desktop" | "drawer") => {
    const isCollapsed = mode === "desktop" && collapsed;
    return (
      <ul className="space-y-0.5">
        {nav.map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              label={item.label}
              Icon={ICONS[item.icon]}
              active={isActive(item.href)}
              collapsed={isCollapsed}
              badge={item.badge}
              onClick={mode === "drawer" ? () => setDrawerOpenedOn(null) : undefined}
            />
          </li>
        ))}
      </ul>
    );
  };

  const footer = (mode: "desktop" | "drawer") => {
    const isCollapsed = mode === "desktop" && collapsed;
    return (
      <div className="space-y-0.5 border-t border-paper/10 pt-3">
        {!isCollapsed && (
          <div className="px-3 pb-2 text-sm">
            <p className="truncate text-paper">{user.name}</p>
            <p className="text-xs text-paper/50">{user.role === "ADMIN" ? "Administrator" : "Staff"}</p>
          </div>
        )}
        <NavLink href="/admin/account" label="My account" Icon={UserRound} active={isActive("/admin/account")} collapsed={isCollapsed} />
        <RailAction label="View site" Icon={ExternalLink} collapsed={isCollapsed} href="/" />
        <RailAction label="Sign out" Icon={LogOut} collapsed={isCollapsed} onClick={signOut} />
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-[#f7f4ee] lg:flex">
      {/* Desktop sidebar */}
      <aside
        data-sidebar={collapsed ? "collapsed" : "expanded"}
        className={`hidden shrink-0 bg-night text-paper transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col ${collapsed ? "w-[4.5rem]" : "w-60"}`}
      >
        <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "px-5"}`}>
          <Link href="/admin" aria-label="Admin dashboard" className="rounded-sm focus-visible:outline-2 focus-visible:outline-saffron">
            {collapsed ? (
              <svg aria-hidden width="26" height="18" viewBox="0 0 26 18" fill="none"><path d="M1 17 8.5 5l4 6 3.5-4.5L25 17" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.5 5 10.6 8.3" stroke="var(--color-saffron)" strokeWidth="1.6" strokeLinecap="round" /></svg>
            ) : (
              <Wordmark name="Admin" tone="light" />
            )}
          </Link>
        </div>
        <nav aria-label="Admin" className={`flex-1 overflow-y-auto ${collapsed ? "overflow-x-visible px-2" : "px-3"} [scrollbar-width:thin]`}>
          {navList("desktop")}
        </nav>
        <div className={`pb-3 ${collapsed ? "px-2" : "px-3"}`}>
          {footer("desktop")}
          <div className="mt-2">
            <RailAction
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              Icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              collapsed={collapsed}
              onClick={toggleCollapsed}
              aria-pressed={collapsed}
            />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-night px-4 text-paper lg:hidden">
        <Link href="/admin" aria-label="Admin dashboard"><Wordmark name="Admin" tone="light" /></Link>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpenedOn(pathname)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-saffron"
        >
          <Menu aria-hidden size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div aria-hidden data-testid="drawer-backdrop" className="absolute inset-0 bg-night/60" onClick={closeDrawer} />
          <div ref={drawerRef} id="admin-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-night text-paper shadow-2xl">
            <div className="flex h-14 items-center justify-between px-4">
              <Wordmark name="Admin" tone="light" />
              <button type="button" onClick={closeDrawer} aria-label="Close navigation" className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-saffron">
                <X aria-hidden size={20} />
              </button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3">{navList("drawer")}</nav>
            <div className="px-3 pb-4">{footer("drawer")}</div>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
