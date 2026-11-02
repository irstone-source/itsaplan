import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export async function ask(question: string, fallback = ''): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (
      await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)
    ).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

// Reads a line without echoing it, so the key never appears in the terminal or its
// scrollback. Falls back to a plain read when stdin is not a terminal.
export function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY) return ask(question);
  return new Promise((resolve, reject) => {
    stdout.write(`${question}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (err) reject(err);
      else resolve(value.trim());
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') return finish(new Error('cancelled'));
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}
