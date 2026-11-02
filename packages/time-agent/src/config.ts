import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PrivateList } from './transform';

export interface Config {
  url: string;
  device: string;
  // Time of the last successful sync, per ActivityWatch bucket id, plus 'calls'.
  cursor: Record<string, string>;
  private: PrivateList;
}

export const DEFAULT_PRIVATE: PrivateList = {
  apps: [
    '1Password',
    'Bitwarden',
    'KeePassXC',
    'Dashlane',
    'LastPass',
    'Passwords',
    'Keychain Access',
    'Messages',
    'WhatsApp',
    'Telegram',
    'Signal',
    'FaceTime',
    'Health',
    'Wallet',
  ],
  domains: [
    'hsbc.co.uk',
    'barclays.co.uk',
    'lloydsbank.co.uk',
    'halifax.co.uk',
    'natwest.com',
    'santander.co.uk',
    'nationwide.co.uk',
    'tsb.co.uk',
    'firstdirect.com',
    'monzo.com',
    'starlingbank.com',
    'revolut.com',
    'chase.co.uk',
    'wise.com',
    'paypal.com',
    'nhs.uk',
    'patientaccess.com',
    'patient.info',
    'bupa.co.uk',
    'web.whatsapp.com',
    'web.telegram.org',
    'messenger.com',
    'web.snapchat.com',
    '1password.com',
    'bitwarden.com',
    'lastpass.com',
    'dashlane.com',
  ],
  titles: ['incognito', 'private browsing', 'password'],
};

// PLAN_TIME_HOME overrides the directory, which is what the tests use.
export function configDir(): string {
  return process.env.PLAN_TIME_HOME || join(homedir(), '.config', 'plan-time');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function loadConfig(): Promise<Config | null> {
  let text: string;
  try {
    text = await readFile(configPath(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${configPath()} is not valid JSON`);
  }
  const priv = (raw.private ?? {}) as Record<string, unknown>;
  const cursor = (raw.cursor ?? {}) as Record<string, unknown>;
  return {
    url: typeof raw.url === 'string' ? raw.url.replace(/\/+$/, '') : '',
    device: typeof raw.device === 'string' ? raw.device : '',
    cursor: Object.fromEntries(
      Object.entries(cursor).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string';
      }),
    ),
    private: { apps: list(priv.apps), domains: list(priv.domains), titles: list(priv.titles) },
  };
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function requireConfig(): Promise<Config> {
  const config = await loadConfig();
  if (!config || !config.url || !config.device) {
    throw new Error('plan-time is not set up yet — run: plan-time setup');
  }
  return config;
}

export type PrivateKind = keyof PrivateList;

export function isPrivateKind(value: string): value is PrivateKind {
  return value === 'apps' || value === 'domains' || value === 'titles';
}

export function addPrivate(list: PrivateList, kind: PrivateKind, value: string): PrivateList {
  const entry = value.trim();
  const exists = list[kind].some((v) => v.toLowerCase() === entry.toLowerCase());
  return exists ? list : { ...list, [kind]: [...list[kind], entry] };
}

export function removePrivate(list: PrivateList, kind: PrivateKind, value: string): PrivateList {
  const entry = value.trim().toLowerCase();
  return { ...list, [kind]: list[kind].filter((v) => v.toLowerCase() !== entry) };
}
