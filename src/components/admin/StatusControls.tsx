"use client";

import type { PublicationStatus } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "./forms";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Publish / unpublish / archive buttons for a catalogue record. One form whose buttons submit
 * their target status, so the confirmation stays visible after the buttons change.
 */
export function StatusControls({ id, status, action }: { id: string; status: PublicationStatus; action: Action }) {
  const options: { to: PublicationStatus; label: string; variant: "primary" | "secondary" }[] = [
    ...(status !== "PUBLISHED" ? [{ to: "PUBLISHED" as const, label: "Publish", variant: "primary" as const }] : []),
    ...(status === "PUBLISHED" ? [{ to: "DRAFT" as const, label: "Unpublish", variant: "secondary" as const }] : []),
    ...(status === "ARCHIVED" ? [] : [{ to: "ARCHIVED" as const, label: "Archive", variant: "secondary" as const }]),
    ...(status === "ARCHIVED" ? [{ to: "DRAFT" as const, label: "Restore as draft", variant: "secondary" as const }] : []),
  ];
  return (
    <ActionForm action={action} className="flex max-w-md flex-wrap items-start justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      {options.map((o) => (
        <SubmitButton key={o.label} variant={o.variant} name="status" value={o.to}>
          {o.label}
        </SubmitButton>
      ))}
    </ActionForm>
  );
}
