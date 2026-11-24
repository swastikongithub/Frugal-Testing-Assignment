import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_INPUT, validateFile } from './validate-locators';

/**
 * Runs the CoT system prompt on a real model and records the answer exactly as the model returned it.
 *
 *   npm run prompt:run -- --model <alias or id> [--runs <n>] [--effort <level>]
 *
 * It calls the Claude Code CLI in print mode, from an empty temporary directory:
 *
 *   claude -p --model <m> --system-prompt-file prompt/locator-cot-system-prompt.md --tools ""
 *          --strict-mcp-config --no-session-persistence --output-format json   < prompt/examples/user-message.txt
 *
 * so the model gets the system prompt and the user message, and nothing else it could use: no tools, no MCP
 * servers, no files, no project instructions. (The CLI adds a fixed preamble of its own, about 780 tokens.)
 *
 * Each run is written to prompt/runs/<served model id>/run-<n>/:
 *   answer.txt  the model's final text, byte for byte (the test suite parses and validates this file)
 *   meta.json   provenance: model requested and served, CLI version, command, hashes of every input, timing, tokens
 */
const fromRoot = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));
export const SYSTEM_PROMPT_PATH = fromRoot('prompt/locator-cot-system-prompt.md');
export const USER_MESSAGE_PATH = fromRoot('prompt/examples/user-message.txt');
export const RUNS_DIR = fromRoot('prompt/runs');
const CLAUDE = process.env.CLAUDE_BIN ?? 'claude';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const rel = (path: string): string => relative(fromRoot(''), path).replace(/\\/g, '/');

interface CliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  result: string;
  stop_reason: string;
  duration_ms: number;
  duration_api_ms: number;
  usage: { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number; output_tokens_details?: { thinking_tokens?: number } };
  modelUsage: Record<string, { costUSD: number }>;
  total_cost_usd: number;
}

/** One recorded run, as the test suite and the summary see it. */
export interface RecordedRun { model: string; run: number; dir: string; answerPath: string; metaPath: string }

/** Every run under prompt/runs, sorted by model then run number. */
export function recordedRuns(root = RUNS_DIR): RecordedRun[] {
  if (!existsSync(root)) return [];
  const runs: RecordedRun[] = [];
  for (const model of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const run of readdirSync(join(root, model.name), { withFileTypes: true })) {
      const match = /^run-(\d+)$/.exec(run.name);
      const dir = join(root, model.name, run.name);
      if (run.isDirectory() && match && existsSync(join(dir, 'answer.txt'))) {
        runs.push({ model: model.name, run: Number(match[1]), dir, answerPath: join(dir, 'answer.txt'), metaPath: join(dir, 'meta.json') });
      }
    }
  }
  return runs.sort((a, b) => a.model.localeCompare(b.model) || a.run - b.run);
}

function cliVersion(): string {
  const out = spawnSync(CLAUDE, ['--version'], { encoding: 'utf8' });
  if (out.error) throw new Error(`cannot start "${CLAUDE}" (${out.error.message}). Install Claude Code or set CLAUDE_BIN.`);
  return out.stdout.trim();
}

function runOnce(model: string, effort: string | undefined, version: string): RecordedRun {
  const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
  const userMessage = readFileSync(USER_MESSAGE_PATH, 'utf8');
  const args = ['-p', '--model', model, '--system-prompt-file', SYSTEM_PROMPT_PATH, '--tools', '',
    '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json', ...(effort ? ['--effort', effort] : [])];

  // An empty working directory: nothing for the CLI to discover (no CLAUDE.md, no settings, no repo).
  const cwd = mkdtempSync(join(tmpdir(), 'q3-prompt-run-'));
  const startedAt = new Date().toISOString();
  let out;
  try {
    out = spawnSync(CLAUDE, args, { cwd, input: userMessage, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60_000 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  if (out.error) throw out.error;
  let result: CliResult;
  try {
    result = JSON.parse(out.stdout) as CliResult;
  } catch {
    throw new Error(`claude exited ${out.status} without a JSON result:\n${out.stdout.slice(0, 2000)}\n${out.stderr.slice(0, 2000)}`);
  }
  if (result.is_error || result.subtype !== 'success') throw new Error(`model call failed: ${result.subtype} ${result.result?.slice(0, 500)}`);

  const served = Object.keys(result.modelUsage);
  const modelDir = join(RUNS_DIR, served.length === 1 ? served[0] as string : model);
  mkdirSync(modelDir, { recursive: true });
  const taken = readdirSync(modelDir).map((n) => /^run-(\d+)$/.exec(n)?.[1]).filter(Boolean).map(Number);
  const run = Math.max(0, ...taken) + 1;
  const dir = join(modelDir, `run-${run}`);
  mkdirSync(dir);

  const answerPath = join(dir, 'answer.txt');
  writeFileSync(answerPath, result.result, 'utf8');
  const u = result.usage;
  const meta = {
    modelRequested: model,
    modelServed: served,
    via: version,
    command: ['claude', ...args.map((a) => (a === SYSTEM_PROMPT_PATH ? rel(a) : a === '' ? '""' : a)), '<', rel(USER_MESSAGE_PATH)].join(' '),
    effort: effort ?? 'CLI default',
    startedAt,
    durationMs: result.duration_ms,
    stopReason: result.stop_reason,
    tokens: {
      input: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
      output: u.output_tokens,
      thinking: u.output_tokens_details?.thinking_tokens ?? 0,
    },
    costUSD: Number(result.total_cost_usd.toFixed(4)),
    sha256: {
      systemPrompt: sha256(systemPrompt),
      userMessage: sha256(userMessage),
      inputComponent: sha256(readFileSync(DEFAULT_INPUT, 'utf8')),
      answer: sha256(result.result),
    },
  };
  writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return { model: served[0] ?? model, run, dir, answerPath, metaPath: join(dir, 'meta.json') };
}

function main(argv: string[]): number {
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const model = opt('--model');
  if (!model) {
    console.error('usage: npm run prompt:run -- --model <alias or id> [--runs <n>] [--effort <level>]');
    return 2;
  }
  const runs = Number(opt('--runs') ?? 1);
  const version = cliVersion();
  let invalid = 0;
  for (let i = 0; i < runs; i++) {
    const recorded = runOnce(model, opt('--effort'), version);
    const meta = JSON.parse(readFileSync(recorded.metaPath, 'utf8')) as { durationMs: number; tokens: { input: number; output: number } };
    const report = validateFile(recorded.answerPath, readFileSync(DEFAULT_INPUT, 'utf8'));
    if (report.errors.length) invalid++;
    console.log(`prompt:run ${recorded.model} run-${recorded.run}: ${(meta.durationMs / 1000).toFixed(1)} s, ${meta.tokens.input} in / ${meta.tokens.output} out`);
    console.log(`  answer   : ${rel(recorded.answerPath)}`);
    for (const w of report.warnings) console.log(`  warning  : ${w.code} at ${w.at}: ${w.message}`);
    for (const e of report.errors) console.log(`  ERROR    : ${e.code} at ${e.at}: ${e.message}`);
    console.log(`  validator: ${report.errors.length ? `INVALID (${report.errors.length} error(s))` : 'VALID'}`);
  }
  return invalid ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
