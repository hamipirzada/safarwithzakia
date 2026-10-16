import { Card, PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireStaffPage("STAFF", "/admin/account");
  return (
    <>
      <PageHeader title="My account" description={`${user.name} · ${user.email} · ${user.role === "ADMIN" ? "Administrator" : "Staff"}`} />
      <Card title="Change your password" className="max-w-xl">
        <ChangePasswordForm />
      </Card>
    </>
  );
}
