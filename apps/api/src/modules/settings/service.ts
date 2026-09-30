import {
  getSetting,
  setSetting,
  STORAGE_SETTING_KEY,
  getStorageSettings,
  type StorageSettings,
} from '@repo/db';

// The instance settings kept in app_setting: the upload limits and the keyboard
// shortcuts.

// Instance-wide upload limits (app_setting key 'storage'). getStorageSettings/
// mimeAllowed/MB/StorageSettings live in @repo/db (packages/db/src/domains/storage.ts) —
// the worker checks an imported Plane attachment against the same limits. This module
// keeps only the write side: the limits are set in the database and edited in god mode,
// there is no env var for them.
export async function setStorageSettings(
  patch: Partial<StorageSettings>,
): Promise<StorageSettings> {
  const next = { ...(await getStorageSettings()), ...patch };
  // Types are matched case-insensitively; store them normalized so the settings UI
  // shows what is actually applied.
  next.attachmentMimeTypes = [
    ...new Set(next.attachmentMimeTypes.map((m) => m.trim().toLowerCase()).filter(Boolean)),
  ];
  await setSetting(STORAGE_SETTING_KEY, next);
  return next;
}

// Instance-wide project defaults (app_setting key 'projects'): what a newly
// created project starts with. Only the defaults live here — every one of them
// stays editable per project afterwards, so this decides the starting value and
// nothing else.

const PROJECT_DEFAULTS_SETTING_KEY = 'projects';

export interface ProjectDefaults {
  // Whether a new project starts reachable over MCP. On: an instance driven
  // through MCP does not have to remember the per-project toggle. This is a
  // visibility default, not an access grant — a project still only appears to a
  // member holding a key, exactly as it does today.
  mcpEnabled: boolean;
}

function defaultProjectDefaults(): ProjectDefaults {
  return { mcpEnabled: true };
}

export async function getProjectDefaults(): Promise<ProjectDefaults> {
  const stored = await getSetting<Partial<ProjectDefaults>>(PROJECT_DEFAULTS_SETTING_KEY);
  // Merge over the default so a value written before a field was added stays valid.
  return { ...defaultProjectDefaults(), ...(stored ?? {}) };
}

export async function setProjectDefaults(
  patch: Partial<ProjectDefaults>,
): Promise<ProjectDefaults> {
  const next = { ...(await getProjectDefaults()), ...patch };
  await setSetting(PROJECT_DEFAULTS_SETTING_KEY, next);
  return next;
}

// The instance keyboard shortcuts (app_setting key 'hotkeys'): the combination
// each command is bound to for everyone on this instance. Only the bindings
// changed in god mode are stored; the web app fills the rest from its built-in
// defaults, then applies the user's own overrides on top (user_preference.hotkeys).

const HOTKEYS_SETTING_KEY = 'hotkeys';

export type HotkeyCombos = Record<string, string>;

export async function getHotkeySettings(): Promise<HotkeyCombos> {
  return (await getSetting<HotkeyCombos>(HOTKEYS_SETTING_KEY)) ?? {};
}

// Replaces the stored map. The god screen sends the full set of overrides, so an
// unbound command is one left out rather than one written as empty.
export async function setHotkeySettings(combos: HotkeyCombos): Promise<HotkeyCombos> {
  await setSetting(HOTKEYS_SETTING_KEY, combos);
  return combos;
}

// Instance branding (app_setting key 'branding'): the product name, accent colour and
// logo every page shows. A null field falls back to the built-in It's a Plan brand.
const BRANDING_SETTING_KEY = 'branding';

export interface Branding {
  appName: string | null;
  accentColor: string | null;
  logo: string | null;
  logoLight: string | null;
}

const NO_BRANDING: Branding = { appName: null, accentColor: null, logo: null, logoLight: null };

export async function getBranding(): Promise<Branding> {
  return { ...NO_BRANDING, ...(await getSetting<Branding>(BRANDING_SETTING_KEY)) };
}

export async function setBranding(branding: Branding): Promise<Branding> {
  const value = { ...branding, appName: branding.appName?.trim() || null };
  await setSetting(BRANDING_SETTING_KEY, value);
  return value;
}

// Instance billing (app_setting key 'billing'): how many hours make a day of an
// estimate, and the day rate internal work is costed at.
const BILLING_SETTING_KEY = 'billing';

export interface BillingSettings {
  hoursPerDay: number;
  internalDayRatePence: number | null;
}

const DEFAULT_BILLING: BillingSettings = { hoursPerDay: 8, internalDayRatePence: null };

export async function getBillingSettings(): Promise<BillingSettings> {
  return { ...DEFAULT_BILLING, ...(await getSetting<BillingSettings>(BILLING_SETTING_KEY)) };
}

export async function setBillingSettings(settings: BillingSettings): Promise<BillingSettings> {
  await setSetting(BILLING_SETTING_KEY, settings);
  return settings;
}
