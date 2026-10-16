import type { Metadata } from "next";
import { Wordmark } from "@/components/site/Wordmark";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark name="Safar With Zakia" />
        </div>
        <div className="rounded-sm border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </main>
  );
}
