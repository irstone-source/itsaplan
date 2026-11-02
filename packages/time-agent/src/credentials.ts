import { execFile } from 'node:child_process';
import { chmod, readFile, mkdir, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { configDir } from './config';

// The API key is kept out of the config file: in the macOS Keychain, elsewhere in a file
// only the user can read. Nothing here prints it.

const run = promisify(execFile);

const KEYCHAIN_SERVICE = 'itsaplan_time_key';

function useKeychain(): boolean {
  return process.platform === 'darwin' && !process.env.PLAN_TIME_HOME;
}

function credentialsPath(): string {
  return join(configDir(), 'credentials');
}

function account(): string {
  return userInfo().username;
}

export async function saveApiKey(key: string): Promise<void> {
  if (useKeychain()) {
    await run('security', [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account(),
      '-w',
      key,
    ]);
    return;
  }
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(credentialsPath(), `${key}\n`, { mode: 0o600 });
  await chmod(credentialsPath(), 0o600);
}

export async function loadApiKey(): Promise<string | null> {
  if (useKeychain()) {
    try {
      const { stdout } = await run('security', [
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        account(),
        '-w',
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  try {
    return (await readFile(credentialsPath(), 'utf8')).trim() || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export function keyLocation(): string {
  return useKeychain() ? `macOS Keychain (${KEYCHAIN_SERVICE})` : credentialsPath();
}
