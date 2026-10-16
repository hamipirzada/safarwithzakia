import Link from "next/link";
import { formatDateTime } from "@/domain/dates";
import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/admin/forms";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { createStaffAction, resetStaffPasswordAction, updateStaffAction } from "./actions";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const me = await requireStaffPage("ADMIN", "/admin/staff");
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } },
  });
  return (
    <>
      <PageHeader title="Staff" description="Administrators manage staff, business details and email delivery. Staff manage enquiries and website content." />
      <div className="space-y-4">
        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-ink">{u.name} {u.id === me.id && <span className="text-sm text-muted">(you)</span>}</p>
                <p className="text-sm text-muted">{u.email}</p>
                <p className="mt-1 text-xs text-muted">Last active: {u.sessions[0] ? formatDateTime(u.sessions[0].updatedAt) : "never"}</p>
              </div>
              <div className="flex gap-2">
                <Badge tone={u.role === "ADMIN" ? "accent" : "neutral"}>{u.role === "ADMIN" ? "Administrator" : "Staff"}</Badge>
                {!u.active && <Badge tone="danger">Deactivated</Badge>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4">
              <ActionForm action={updateStaffAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="userId" value={u.id} />
                <div>
                  <label className="field-label" htmlFor={`role-${u.id}`}>Role</label>
                  <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="input">
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor={`active-${u.id}`}>Access</label>
                  <select id={`active-${u.id}`} name="active" defaultValue={String(u.active)} className="input">
                    <option value="true">Active</option>
                    <option value="false">Deactivated</option>
                  </select>
                </div>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
              {u.id === me.id ? (
                <Link href="/admin/account" className="btn btn-sm btn-secondary">Change my password</Link>
              ) : (
                <ConfirmAction action={resetStaffPasswordAction} fields={{ userId: u.id }} label="Reset password" confirmLabel="Generate new password" warning="This creates a new temporary password (shown once here) and signs the person out everywhere." />
              )}
            </div>
          </Card>
        ))}
        <Card title="Add a staff account">
          <ActionForm action={createStaffAction} resetOnSuccess>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Name" name="name" required />
              <TextField label="Email" name="email" type="email" required />
              <div>
                <label className="field-label" htmlFor="new-role">Role</label>
                <select id="new-role" name="role" defaultValue="STAFF" className="input">
                  <option value="STAFF">Staff</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">A temporary password is shown once after creating the account. Ask them to change it with “Forgot password” after signing in.</p>
            <div className="mt-4"><SubmitButton>Create account</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
