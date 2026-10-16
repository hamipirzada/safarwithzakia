import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined, getAll: () => [] }),
}));
// Server actions call revalidatePath; outside a Next request it has nothing to revalidate.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { hashPassword } = await import("better-auth/crypto");
const { prisma } = await import("@/server/db");
const { getAuth } = await import("@/server/auth");
const { destinationInput, packageInput } = await import("@/domain/admin-schemas");
const { saveDestination, savePackage } = await import("@/server/catalog-admin");
const { getDestination, getPackage, listActiveOffers, listPackages } = await import("@/server/catalog");
const { createStaffAction, resetStaffPasswordAction, updateStaffAction } = await import("@/app/admin/(panel)/staff/actions");
const { saveTestimonialAction } = await import("@/app/admin/(panel)/testimonials/actions");
const { resetDatabase, createDestination } = await import("../support/db");

async function createUser(email: string, role: "ADMIN" | "STAFF") {
  const user = await prisma.user.create({ data: { name: email.split("@")[0]!, email, role, emailVerified: true } });
  await prisma.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword("correct-horse-battery") } });
  return user;
}
async function signInAs(email: string) {
  const { headers } = await getAuth().api.signInEmail({ body: { email, password: "correct-horse-battery" }, returnHeaders: true });
  requestHeaders.current = new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}
function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
const idle = { status: "idle" } as const;

beforeEach(async () => {
  await resetDatabase();
  requestHeaders.current = new Headers();
});

describe("publication rules", () => {
  it("refuses to route a published package through an unpublished destination", async () => {
    const actor = await createUser("admin@example.test", "ADMIN");
    const live = await createDestination("Live");
    const hidden = await createDestination("Hidden");
    await prisma.destination.update({ where: { id: hidden.id }, data: { status: "DRAFT" } });
    const media = await prisma.mediaAsset.create({ data: { path: "/images/t.jpg", alt: "t", width: 1, height: 1 } });
    const base = { title: "P", slug: "p", summary: "S", description: "D", durationDays: 2, durationNights: 1, heroImageId: media.id };
    const id = await savePackage(null, packageInput.parse({ ...base, route: [{ destinationId: live.id, days: 2 }] }), actor.id);
    await prisma.package.update({ where: { id }, data: { status: "PUBLISHED" } });

    await expect(savePackage(id, packageInput.parse({ ...base, route: [{ destinationId: live.id, days: 1 }, { destinationId: hidden.id, days: 1 }] }), actor.id)).rejects.toThrow(/Publish these destinations/);
    await expect(savePackage(id, packageInput.parse({ ...base, route: [] }), actor.id)).rejects.toThrow(/at least one route destination/);
    // Nothing changed
    expect(await prisma.packageDestination.findMany({ where: { packageId: id }, select: { destinationId: true } })).toEqual([{ destinationId: live.id }]);
  });

  it("rejects images that do not exist", async () => {
    const actor = await createUser("admin@example.test", "ADMIN");
    await expect(
      saveDestination(null, destinationInput.parse({ name: "X", slug: "x", summary: "S", description: "D", heroImageId: "00000000-0000-4000-8000-000000000000" }), actor.id),
    ).rejects.toThrow(/no longer exists/);
    expect(await prisma.destination.count()).toBe(0);
  });

  it("hides drafts and archived records from every public query", async () => {
    const d = await createDestination("Draftland");
    await prisma.destination.update({ where: { id: d.id }, data: { status: "DRAFT" } });
    expect(await getDestination("draftland")).toBeNull();
    const pkg = await prisma.package.create({ data: { slug: "arch", title: "Archived", summary: "S", description: "D", durationDays: 1, durationNights: 0, status: "ARCHIVED" } });
    expect(await getPackage("arch")).toBeNull();
    expect((await listPackages()).map((p) => p.id)).not.toContain(pkg.id);
  });

  it("shows offers only while published and valid, and their codes only while usable", async () => {
    const now = new Date("2026-10-16T06:00:00Z");
    const valid = await prisma.promoCode.create({ data: { code: "OK10", discountType: "PERCENT", value: 10 } });
    const expired = await prisma.promoCode.create({ data: { code: "OLD10", discountType: "PERCENT", value: 10, validTo: new Date("2026-10-01") } });
    await prisma.offer.createMany({
      data: [
        { title: "Live", description: "d", status: "PUBLISHED", promoCodeId: valid.id },
        { title: "Live, expired code", description: "d", status: "PUBLISHED", promoCodeId: expired.id },
        { title: "Draft", description: "d", status: "DRAFT" },
        { title: "Ended", description: "d", status: "PUBLISHED", validTo: new Date("2026-10-15") },
        { title: "Future", description: "d", status: "PUBLISHED", validFrom: new Date("2026-11-01") },
      ],
    });
    const offers = await listActiveOffers(now);
    const shown = offers.map((o) => [o.title, o.promoCode?.code ?? null]);
    expect(shown).toHaveLength(2);
    expect(shown).toEqual(expect.arrayContaining([["Live", "OK10"], ["Live, expired code", null]]));
  });
});

describe("admin server actions", () => {
  it("accepts unchecked checkboxes (browsers omit them)", async () => {
    await createUser("staff@example.test", "STAFF");
    await signInAs("staff@example.test");
    const result = await saveTestimonialAction(idle, form({ id: "", authorName: "Guest", quote: "A lovely trip with the team.", status: "DRAFT", sortOrder: "0" }));
    expect(result).toEqual({ status: "success", message: "Testimonial saved." });
    expect(await prisma.testimonial.findFirstOrThrow()).toMatchObject({ consentConfirmed: false, status: "DRAFT" });
  });

  it("does not let staff grant themselves (or anyone) administrator access", async () => {
    const staff = await createUser("staff@example.test", "STAFF");
    await signInAs("staff@example.test");
    expect(await updateStaffAction(idle, form({ userId: staff.id, role: "ADMIN", active: "true" }))).toEqual({ status: "error", message: "You do not have permission to do that." });
    expect(await createStaffAction(idle, form({ name: "Mallory", email: "m@example.test", role: "ADMIN" }))).toMatchObject({ status: "error" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).role).toBe("STAFF");
    expect(await prisma.user.count({ where: { email: "m@example.test" } })).toBe(0);
  });

  it("keeps at least one active administrator and stops admins locking themselves out", async () => {
    const admin = await createUser("admin@example.test", "ADMIN");
    const other = await createUser("other@example.test", "ADMIN");
    await signInAs("admin@example.test");
    expect(await updateStaffAction(idle, form({ userId: admin.id, role: "STAFF", active: "true" }))).toMatchObject({ status: "error", message: expect.stringMatching(/your own administrator access/) });
    expect(await updateStaffAction(idle, form({ userId: other.id, role: "ADMIN", active: "false" }))).toMatchObject({ status: "success" });
    expect(await prisma.session.count({ where: { userId: other.id } })).toBe(0);
    // `admin` is now the only active administrator, and cannot be demoted by anyone.
    await prisma.user.update({ where: { id: other.id }, data: { active: true } });
    await signInAs("other@example.test");
    await prisma.user.update({ where: { id: admin.id }, data: {} });
    expect(await updateStaffAction(idle, form({ userId: admin.id, role: "ADMIN", active: "true" }))).toMatchObject({ status: "success" });
    const audit = await prisma.auditLog.findMany({ where: { action: "staff.updated" }, include: { actor: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.actor?.email)).toEqual(["admin@example.test", "other@example.test"]);
  });

  it("lets administrators create staff and reset passwords; old sessions end and the new password works", async () => {
    await createUser("admin@example.test", "ADMIN");
    await signInAs("admin@example.test");
    const created = await createStaffAction(idle, form({ name: "New Guide", email: "Guide@Example.test", role: "STAFF" }));
    expect(created).toMatchObject({ status: "success", message: expect.stringContaining("Temporary password") });
    const temporary = (created as { message: string }).message.match(/\): (\S+)$/)?.[1] ?? (created as { message: string }).message.split(": ").at(-1)!;
    const guide = await prisma.user.findUniqueOrThrow({ where: { email: "guide@example.test" } });
    expect(guide.role).toBe("STAFF");
    await expect(getAuth().api.signInEmail({ body: { email: "guide@example.test", password: temporary } })).resolves.toBeTruthy();

    const reset = await resetStaffPasswordAction(idle, form({ userId: guide.id }));
    expect(reset).toMatchObject({ status: "success" });
    expect(await prisma.session.count({ where: { userId: guide.id } })).toBe(0);
    const fresh = (reset as { message: string }).message.match(/shown once\): (\S+)\./)![1]!;
    await expect(getAuth().api.signInEmail({ body: { email: "guide@example.test", password: temporary } })).rejects.toThrow();
    await expect(getAuth().api.signInEmail({ body: { email: "guide@example.test", password: fresh } })).resolves.toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: { in: ["staff.created", "staff.password_reset"] }, entityId: guide.id } })).toBe(2);
  });

  it("refuses to let an administrator reset their own password from the staff page (it would sign them out unseen)", async () => {
    const admin = await createUser("admin@example.test", "ADMIN");
    await signInAs("admin@example.test");
    const before = await prisma.account.findFirstOrThrow({ where: { userId: admin.id } });
    expect(await resetStaffPasswordAction(idle, form({ userId: admin.id }))).toEqual({ status: "error", message: "To change your own password, use My account." });
    expect((await prisma.account.findFirstOrThrow({ where: { userId: admin.id } })).password).toBe(before.password);
    expect(await prisma.session.count({ where: { userId: admin.id } })).toBe(1);
  });
});

