import "server-only";
import { cache } from "react";
import { SETTINGS, type SettingKey, type SettingValue } from "@/domain/settings";
import { log } from "./logger";
import { prisma, type Tx } from "./db";

/** Read a setting, validated against its schema. Falls back to defaults if missing or invalid. */
export const getSetting = cache(async <K extends SettingKey>(key: K): Promise<SettingValue<K>> => {
  const definition = SETTINGS[key];
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (!row) return definition.defaults as SettingValue<K>;
  const parsed = definition.schema.safeParse(row.value);
  if (!parsed.success) {
    log.warn("settings.invalid_stored_value", { key });
    return definition.defaults as SettingValue<K>;
  }
  return parsed.data as SettingValue<K>;
});

export async function saveSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  actorId: string | null,
  tx: Tx = prisma,
): Promise<void> {
  const parsed = SETTINGS[key].schema.parse(value);
  await tx.siteSetting.upsert({
    where: { key },
    create: { key, value: parsed, updatedById: actorId },
    update: { value: parsed, updatedById: actorId },
  });
}
