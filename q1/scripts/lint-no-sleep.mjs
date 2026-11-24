// Fails if test, framework or reporter code contains a static wait.
// Runs before every `npm test`. Plain Node, so it works the same on Windows, macOS and Linux.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['tests', 'reporters'];
const EXTENSIONS = /\.(ts|tsx|js|mjs|cjs)$/;
// The fault layer may hold packets with a timer: that delay *is* the injected latency.
const FAULT_LAYER = join('tests', 'framework', 'fault-injection') + sep;

const RULES = [
  { id: 'waitForTimeout', pattern: /\bwaitForTimeout\b/, sample: 'await page.waitForTimeout(500)', allowInFaultLayer: false },
  { id: 'sleep(', pattern: /\bsleep\s*\(/i, sample: 'await sleep(100)', allowInFaultLayer: false },
  { id: 'Thread.sleep', pattern: /\bThread\s*\.\s*sleep\b/, sample: 'Thread.sleep(300);', allowInFaultLayer: false },
  { id: 'time.sleep', pattern: /\btime\s*\.\s*sleep\b/, sample: 'time.sleep(0.3)', allowInFaultLayer: false },
  { id: 'setTimeout', pattern: /\bsetTimeout\b/, sample: 'setTimeout(done, 50)', allowInFaultLayer: true },
  { id: 'setInterval', pattern: /\bsetInterval\b/, sample: 'setInterval(poll, 50)', allowInFaultLayer: true },
];

// Self-test first: prove every rule fires on its own sample and not on clean code.
for (const rule of RULES) {
  if (!rule.pattern.test(rule.sample) || rule.pattern.test('await page.waitForFunction(fn, null, { polling: "raf" })')) {
    console.error(`lint:no-sleep self-test failed for rule "${rule.id}"`);
    process.exit(2);
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

const files = ROOTS.flatMap((root) => walk(root));
const violations = [];
for (const file of files) {
  const inFaultLayer = relative('.', file).startsWith(FAULT_LAYER);
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((text, index) => {
      for (const rule of RULES) {
        if (rule.allowInFaultLayer && inFaultLayer) continue;
        if (rule.pattern.test(text)) violations.push(`${file}:${index + 1}  [${rule.id}]  ${text.trim()}`);
      }
    });
}

if (violations.length) {
  console.error(`lint:no-sleep FAILED - ${violations.length} static wait(s) found:\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `lint:no-sleep OK - ${RULES.length} rules self-tested, ${files.length} files scanned in ${ROOTS.join(', ')}; ` +
    `0 violations (timers allowed only in ${FAULT_LAYER.replaceAll('\\', '/')})`,
);
