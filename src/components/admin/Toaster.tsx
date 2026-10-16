"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export const TOAST_EVENT = "swz:admin-toast";
export type ToastDetail = { tone: "success" | "error"; message: string };

/**
 * Brief visual confirmation of a server result. The authoritative, announced message stays inline
 * beside the form (role=status/alert), so toasts are aria-hidden to avoid double announcements.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<(ToastDetail & { id: number })[]>([]);
  useEffect(() => {
    let next = 0;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      const id = ++next;
      setToasts((list) => [...list.slice(-2), { ...detail, id }]);
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), detail.tone === "error" ? 6000 : 3500);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} data-toast={t.tone} className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink shadow-card">
          {t.tone === "success" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#0ca30c]" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#d03b3b]" />}
          <span className="line-clamp-3">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function toast(detail: ToastDetail) {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}
