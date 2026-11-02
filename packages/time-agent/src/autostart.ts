import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

// Opt-in only: nothing here runs unless the person types `plan-time install-autostart`.

const run = promisify(execFile);

const LABEL = 'co.cambray.plan-time';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function autostartPath(platform = process.platform): string {
  if (platform === 'darwin') return join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData/Roaming');
    return join(appData, 'Microsoft/Windows/Start Menu/Programs/Startup/plan-time.cmd');
  }
  return join(homedir(), '.config/systemd/user/plan-time.service');
}

export async function autostartInstalled(): Promise<boolean> {
  return access(autostartPath()).then(
    () => true,
    () => false,
  );
}

function launchdPlist(node: string, script: string, args: string[]): string {
  const argv = [node, script, 'watch', ...args].map((a) => `    <string>${escapeXml(a)}</string>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argv.join('\n')}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(homedir(), 'Library/Logs/plan-time.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(homedir(), 'Library/Logs/plan-time.log'))}</string>
</dict>
</plist>
`;
}

function systemdUnit(node: string, script: string, args: string[]): string {
  const exec = [node, script, 'watch', ...args].map((a) => JSON.stringify(a)).join(' ');
  return `[Unit]
Description=Plan time agent

[Service]
ExecStart=${exec}
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`;
}

function windowsStartup(node: string, script: string, args: string[]): string {
  const argv = [script, 'watch', ...args].map((a) => `"${a}"`).join(' ');
  return `@echo off\r\nstart "" /min "${node}" ${argv}\r\n`;
}

// Writes the autostart entry for `plan-time watch` with the given extra args and loads it.
export async function installAutostart(args: string[]): Promise<string> {
  const node = process.execPath;
  const script = resolve(process.argv[1] ?? '');
  const path = autostartPath();
  await mkdir(join(path, '..'), { recursive: true });
  if (process.platform === 'darwin') {
    await writeFile(path, launchdPlist(node, script, args));
    await run('launchctl', ['unload', path]).catch(() => {});
    await run('launchctl', ['load', '-w', path]);
  } else if (process.platform === 'win32') {
    await writeFile(path, windowsStartup(node, script, args));
  } else {
    await writeFile(path, systemdUnit(node, script, args));
    await run('systemctl', ['--user', 'daemon-reload']);
    await run('systemctl', ['--user', 'enable', '--now', 'plan-time.service']);
  }
  return path;
}
