import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { emitKeypressEvents, type Key } from 'node:readline';

const RESET = '\u001b[0m';
const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const logoPath = new URL('../logo.txt', import.meta.url).pathname;
const LOGO = readFileSync(logoPath, 'utf8');

function tty(text: string, style: string): string {
  return process.stdout.isTTY && !process.env.NO_COLOR ? `${style}${text}${RESET}` : text;
}

export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

function clearScreen(): void {
  if (isInteractive()) process.stdout.write('\u001b[2J\u001b[H');
}

function enterInteractiveSurface(): void {
  process.stdout.write('\u001b[?1049h\u001b[?25l\u001b[H');
}

function leaveInteractiveSurface(): void {
  process.stdout.write('\u001b[?25h\u001b[?1049l');
}

function logoLines(): string[] {
  // Keep the asset itself immutable. Only discard empty framing lines from the
  // pasted source so the terminal composition does not acquire a giant gutter.
  const lines = LOGO.split('\n');
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  return lines;
}

export function printHome(version: string): void {
  const logo = logoLines();
  process.stdout.write(`${logo.join('\n')}\n`);
  console.log('');
  console.log(tty('Crucible', BOLD));
  console.log('End-to-end smart contract testing');
  console.log(tty(`v${version}`, DIM));
}

const MENU = [
  { label: 'Test', args: ['test'] },
  { label: 'Scenario create', args: ['scenario', 'create'] },
  { label: 'Web', args: ['web'] },
  { label: 'Help', args: ['--help'] },
  { label: 'Exit', args: [] }
];

function renderMenu(version: string, selected: number): void {
  clearScreen();
  const logo = logoLines();
  const width = process.stdout.columns ?? 100;
  const leftWidth = Math.max(...logo.map((line) => line.length), 0);
  const gap = ' '.repeat(Math.min(10, Math.max(4, Math.floor(width / 18))));
  const rightWidth = Math.max(24, Math.min(34, width - leftWidth - gap.length - 2));
  const separator = '─'.repeat(rightWidth);
  const right = [
    tty('Crucible', BOLD),
    'End-to-end smart contract testing',
    tty(`v${version}`, DIM),
    '',
    separator,
    '',
    tty('Get started', BOLD),
    '',
    ...MENU.map((item, index) => {
      const marker = index === selected ? '❯' : ' ';
      return `${marker} ${index === selected ? tty(item.label, BOLD) : item.label}`;
    }),
    '',
    tty('↑↓ navigate · Enter select · Ctrl+C exit', DIM)
  ];

  if (width < 90) {
    process.stdout.write(`${logo.join('\n')}\n`);
    console.log('');
    right.forEach((line) => console.log(`  ${line}`));
    return;
  }

  for (let index = 0; index < Math.max(logo.length, right.length); index += 1) {
    const left = logo[index] ?? '';
    const rightLine = right[index] ?? '';
    console.log(`${left.padEnd(leftWidth)}${gap}${rightLine}`);
  }
}

function runExistingCommand(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...args], { stdio: 'inherit' });
    child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
    child.once('error', () => resolve(1));
  });
}

export async function runInteractiveHome(version: string): Promise<void> {
  if (!isInteractive()) {
    printHome(version);
    return;
  }
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let selected = 0;
  let active = true;
  let surfaceActive = false;
  const onSigint = () => {
    cleanup();
    process.exit(0);
  };
  const enterSurface = () => {
    if (!surfaceActive) {
      enterInteractiveSurface();
      surfaceActive = true;
    }
  };
  const leaveSurface = () => {
    if (surfaceActive) {
      leaveInteractiveSurface();
      surfaceActive = false;
    }
  };
  const cleanup = () => {
    if (!active && !surfaceActive) return;
    active = false;
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeListener('keypress', onKeypress);
    process.removeListener('SIGINT', onSigint);
    leaveSurface();
    process.stdout.write('\n');
  };
  const onKeypress = async (_input: string, key: Key) => {
    if (!active) return;
    if (key.ctrl && key.name === 'c') {
      cleanup();
      process.exit(0);
    }
    if (key.name === 'up') selected = (selected + MENU.length - 1) % MENU.length;
    else if (key.name === 'down') selected = (selected + 1) % MENU.length;
    else if (key.name === 'escape') selected = 0;
    else if (key.name === 'return') {
      const item = MENU[selected];
      if (item.label === 'Exit') {
        cleanup();
        process.exit(0);
      }
      process.stdin.setRawMode(false);
      process.stdin.pause();
      leaveSurface();
      await runExistingCommand(item.args);
      if (!active) return;
      enterSurface();
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    renderMenu(version, selected);
  };
  process.once('SIGINT', onSigint);
  process.stdin.on('keypress', onKeypress);
  enterSurface();
  renderMenu(version, selected);
  await new Promise<void>(() => undefined);
}

export function printUsage(lines: string[]): void {
  console.error(`${tty('CRUCIBLE CLI', BOLD)}\n\n${lines.join('\n')}`);
}

export function printPanel(title: string, rows: Array<[string, string]>): void {
  const contentWidth = Math.max(title.length, ...rows.map(([label, value]) => label.length + value.length + 3), 30);
  const border = `+${'-'.repeat(contentWidth + 2)}+`;
  console.log(border);
  console.log(`| ${tty(title, BOLD).padEnd(contentWidth)} |`);
  console.log(`|${'-'.repeat(contentWidth + 2)}|`);
  for (const [label, value] of rows) console.log(`| ${tty(label, DIM).padEnd(16)}${value.padEnd(contentWidth - 15)} |`);
  console.log(border);
}

export function printUrl(url: string, resultPath: string): void {
  printPanel('CRUCIBLE WEB VIEWER', [
    ['URL', url],
    ['Result', resultPath],
    ['Security', 'local-only; no RPC or private keys']
  ]);
  console.log('');
  console.log(`${tty('Ready.', BOLD)} Open the URL above. Press Ctrl+C to stop.`);
}

export function printError(message: string): void {
  printPanel('CRUCIBLE ERROR', [['Message', message]]);
}

export function startSpinner(label: string): () => void {
  if (!isInteractive()) return () => undefined;
  const frames = ['.', '..', '...'];
  let index = 0;
  const write = () => process.stderr.write(`\r${label}${frames[index++ % frames.length]} `);
  write();
  const timer = setInterval(write, 350);
  return () => {
    clearInterval(timer);
    process.stderr.write('\r\u001b[K');
  };
}

export function readVersion(packagePath: string): string {
  try {
    return (JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
