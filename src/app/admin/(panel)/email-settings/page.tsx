import Link from "next/link";
import { formatDateTime } from "@/domain/dates";
import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/admin/forms";
import { Badge, Card, EmailStatusBadge, EmptyState, PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { GMAIL_CREDENTIAL_ID, resolveBusinessRecipient, resolveGmailTransport } from "@/server/email/config";
import { getEnv } from "@/server/env";
import { getSetting } from "@/server/settings";
import { retryEmailAction } from "../enquiries/actions";
import { disconnectGmailAction, processQueueAction, saveEmailSettingsAction, sendTestEmailAction } from "./actions";

export const metadata = { title: "Email delivery" };

const ERRORS: Record<string, string> = {
  not_configured: "Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REDIRECT_URI on the server first.",
  state_mismatch: "The connection attempt expired or did not match. Please try again.",
  consent_denied: "Permission was not granted in Google.",
  scope_missing: "Google did not grant permission to send email. Please try again and allow sending.",
  no_email: "Could not determine the mailbox address. Set GMAIL_SENDER_ADDRESS and try again.",
  no_refresh_token: "Google did not return a long-lived token. Remove this app's access in the Google account's security settings, then connect again.",
};

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm">
      <span aria-hidden className={ok ? "text-success" : "text-danger"}>{ok ? "✓" : "✗"}</span>
      <span className={ok ? "text-ink" : "text-ink-soft"}>{children}</span>
    </li>
  );
}

export default async function EmailSettingsPage({ searchParams }: PageProps<"/admin/email-settings">) {
  await requireStaffPage("ADMIN", "/admin/email-settings");
  const { error, connected } = await searchParams;
  const env = getEnv();
  const [transport, credential, settings, recipient, problems, counts] = await Promise.all([
    resolveGmailTransport(),
    prisma.gmailCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } }),
    getSetting("email"),
    resolveBusinessRecipient(),
    prisma.emailDelivery.findMany({
      where: { status: { in: ["FAILED", "PENDING", "SENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { enquiry: { select: { id: true, reference: true } } },
    }),
    prisma.emailDelivery.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const clientConfigured = Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET);

  return (
    <>
      <PageHeader title="Email delivery" description="Enquiry notifications and customer acknowledgements are sent through the Gmail API from the business mailbox. Enquiries are always saved first; email is sent afterwards and retried if it fails." />

      {typeof error === "string" && <p role="alert" className="mb-6 rounded-sm bg-danger-soft p-3 text-sm">Gmail was not connected: {ERRORS[error] ?? `Google returned “${error}”.`}</p>}
      {connected === "1" && <p role="status" className="mb-6 rounded-sm bg-success-soft p-3 text-sm">Gmail connected. Send a test email to confirm delivery.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Status">
          <div className="flex items-center gap-3">
            {transport.ok ? <Badge tone="success">Ready to send</Badge> : <Badge tone={transport.state === "REVOKED" ? "danger" : "warning"}>{transport.state === "REVOKED" ? "Reconnect needed" : "Not configured"}</Badge>}
            {transport.ok && <span className="text-sm text-muted">Sending as {transport.transport.sender} ({transport.transport.source === "connected" ? "connected here" : "from server environment"})</span>}
          </div>
          {!transport.ok && <p className="mt-3 text-sm text-ink-soft">{transport.message}</p>}
          <ul className="mt-5 space-y-2">
            <Check ok={clientConfigured}>OAuth client configured on the server (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET)</Check>
            <Check ok={Boolean(env.GMAIL_REDIRECT_URI)}>Redirect URI set{env.GMAIL_REDIRECT_URI ? `: ${env.GMAIL_REDIRECT_URI}` : ""}</Check>
            <Check ok={Boolean(credential && credential.status === "ACTIVE") || Boolean(env.GMAIL_REFRESH_TOKEN)}>Business mailbox authorised</Check>
            <Check ok={Boolean(recipient)}>Business inbox for notifications{recipient ? `: ${recipient}` : " — not set"}</Check>
          </ul>
          {credential && (
            <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-y-1 border-t border-line pt-4 text-sm">
              <dt className="text-muted">Mailbox</dt><dd>{credential.senderAddress}</dd>
              <dt className="text-muted">Connected</dt><dd>{formatDateTime(credential.connectedAt)}</dd>
              <dt className="text-muted">Last success</dt><dd>{credential.lastSuccessAt ? formatDateTime(credential.lastSuccessAt) : "—"}</dd>
              {credential.lastError && (<><dt className="text-muted">Last error</dt><dd className="text-danger">{credential.lastError}</dd></>)}
            </dl>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {clientConfigured && env.GMAIL_REDIRECT_URI && (
              <a href="/api/admin/gmail/connect" className="btn btn-sm btn-primary">{credential ? "Reconnect Gmail" : "Connect Gmail"}</a>
            )}
            {credential && <ConfirmAction action={disconnectGmailAction} fields={{}} label="Disconnect" confirmLabel="Disconnect" warning="Emails will stop sending until a mailbox is connected again. Enquiries are still saved." />}
          </div>
          <p className="mt-4 text-xs text-muted">Setup steps for the Google Cloud project are in docs/DEPLOYMENT.md (“Gmail API”).</p>
        </Card>

        <Card title="Settings">
          <ActionForm version={JSON.stringify(settings)} action={saveEmailSettingsAction}>
            <TextField label="Business inbox for enquiry notifications" name="recipientEmail" type="email" defaultValue={settings.recipientEmail} hint={env.ENQUIRY_RECIPIENT_EMAIL ? `If blank, ENQUIRY_RECIPIENT_EMAIL is used (${env.ENQUIRY_RECIPIENT_EMAIL}).` : "Where new enquiries are sent. Replies go straight to the customer."} />
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" name="sendCustomerAcknowledgement" defaultChecked={settings.sendCustomerAcknowledgement} className="mt-0.5 h-5 w-5 accent-[var(--color-ink)]" />
              <span>Email customers a confirmation with their reference number</span>
            </label>
            <div className="mt-4"><SubmitButton>Save settings</SubmitButton></div>
          </ActionForm>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
            <ActionForm action={sendTestEmailAction}><SubmitButton variant="secondary">Send a test email</SubmitButton></ActionForm>
            <ActionForm action={processQueueAction}><SubmitButton variant="secondary">Process queue now</SubmitButton></ActionForm>
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <h2 className="font-display text-xl text-ink">Needs attention</h2>
          <span>{count("FAILED")} failed · {count("PENDING") + count("SENDING")} queued · {count("SENT")} sent in total</span>
        </div>
        {problems.length === 0 ? (
          <EmptyState title="Nothing waiting">All emails have been delivered to Gmail.</EmptyState>
        ) : (
          <Table>
            <thead><tr><th>Email</th><th>Status</th><th>Last error</th><th /></tr></thead>
            <tbody>
              {problems.map((m) => (
                <tr key={m.id}>
                  <td>
                    <p className="text-ink">{m.subject}</p>
                    <p className="text-xs text-muted">
                      {m.kind.replace(/_/g, " ").toLowerCase()} · {formatDateTime(m.createdAt)}
                      {m.enquiry && <> · <Link href={`/admin/enquiries/${m.enquiry.id}`} className="link">{m.enquiry.reference}</Link></>}
                    </p>
                  </td>
                  <td><EmailStatusBadge status={m.status} /><p className="mt-1 text-xs text-muted">{m.attempts} attempt{m.attempts === 1 ? "" : "s"}</p></td>
                  <td className="max-w-xs text-xs text-ink-soft">{m.lastErrorCode ? `${m.lastErrorCode}: ${m.lastErrorMessage ?? ""}` : "—"}</td>
                  <td>
                    {m.status !== "SENDING" && (
                      <ActionForm action={retryEmailAction}>
                        <input type="hidden" name="deliveryId" value={m.id} />
                        <SubmitButton variant="secondary">{m.status === "FAILED" ? "Retry" : "Send now"}</SubmitButton>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
