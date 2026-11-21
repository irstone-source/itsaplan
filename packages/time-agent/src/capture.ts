import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Writes a PNG of the whole screen to `file`; throws when this machine has no way to.
export type Capturer = (file: string) => Promise<void>;

const WINDOWS_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
  '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen',
  '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
  '$g = [System.Drawing.Graphics]::FromImage($bmp)',
  '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)',
  '$bmp.Save($env:PLAN_TIME_SHOT, [System.Drawing.Imaging.ImageFormat]::Png)',
].join('; ');

type Command = (file: string) => [string, string[], NodeJS.ProcessEnv?];

function commandsFor(platform: string): Command[] {
  if (platform === 'darwin') return [(f) => ['screencapture', ['-x', '-t', 'png', f]]];
  if (platform === 'win32') {
    return [
      (f) => [
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT],
        { ...process.env, PLAN_TIME_SHOT: f },
      ],
    ];
  }
  return [
    (f) => ['grim', [f]],
    (f) => ['gnome-screenshot', ['-f', f]],
    (f) => ['import', ['-window', 'root', f]],
  ];
}

// The first command that works is kept for later shots.
export function systemCapturer(platform: string = process.platform): Capturer {
  let commands = commandsFor(platform);
  return async (file) => {
    let lastError: unknown = new Error('no screenshot tool found');
    for (const command of commands) {
      const [bin, args, env] = command(file);
      try {
        await run(bin, args, { env, timeout: 30_000 });
        commands = [command];
        // A Retina or multi-display PNG can pass the 25 MB attachment limit; on failure
        // the full-size file is kept.
        if (platform === 'darwin') {
          await run('sips', ['-Z', '2560', file], { timeout: 30_000 }).catch(() => {});
        }
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };
}
