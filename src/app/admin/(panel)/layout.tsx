import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AdminShell, type AdminNavItem } from "@/components/admin/AdminShell";
import { SIDEBAR_COOKIE } from "@/lib/admin-preferences";
import { errorMessage, log } from "@/server/logger";
import { hasRole, requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage();
  // Badge counts are a convenience: if they cannot be loaded the navigation still renders.
  let newEnquiries = 0;
  let failedEmails = 0;
  try {
    [newEnquiries, failedEmails] = await Promise.all([
      prisma.enquiry.count({ where: { status: "NEW", archivedAt: null } }),
      hasRole(user, "ADMIN") ? prisma.emailDelivery.count({ where: { status: "FAILED" } }) : Promise.resolve(0),
    ]);
  } catch (error) {
    log.warn("admin.nav_counts_failed", { error: errorMessage(error) });
  }
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  const nav: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/enquiries", label: "Enquiries", icon: "enquiries", badge: newEnquiries },
    { href: "/admin/packages", label: "Packages", icon: "packages" },
    { href: "/admin/destinations", label: "Destinations", icon: "destinations" },
    { href: "/admin/offers", label: "Offers & promo codes", icon: "offers" },
    { href: "/admin/testimonials", label: "Testimonials", icon: "testimonials" },
    { href: "/admin/faqs", label: "FAQs", icon: "faqs" },
    { href: "/admin/content", label: "Site content", icon: "content" },
    ...(hasRole(user, "ADMIN")
      ? ([
          { href: "/admin/email-settings", label: "Email delivery", icon: "email", badge: failedEmails },
          { href: "/admin/settings", label: "Business details", icon: "settings" },
          { href: "/admin/staff", label: "Staff", icon: "staff" },
          { href: "/admin/audit", label: "Audit log", icon: "audit" },
        ] satisfies AdminNavItem[])
      : []),
  ];

  return (
    <AdminShell nav={nav} user={{ name: user.name, role: user.role }} initialCollapsed={collapsed}>
      {children}
    </AdminShell>
  );
}
