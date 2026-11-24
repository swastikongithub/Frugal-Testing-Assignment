import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type ElementHandle } from '@playwright/test';
import { recordedRuns, SYSTEM_PROMPT_PATH, USER_MESSAGE_PATH } from '../scripts/run-prompt';
import {
  DEFAULT_INPUT, parseModelOutput, REFERENCE_PATH, selfTest, validateFile, validateStrategy, SCHEMA_PATH, type Target,
} from '../scripts/validate-locators';
import { Evidence } from './framework/evidence';
import { inOwnFrame, installPierce, loadDemo, RELOADS, sameNode } from './framework/pierce';
import { resolveTarget } from './framework/resolveStrategy';

const fromRoot = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));
const PROMPT_PATH = fromRoot('prompt/locator-cot-system-prompt.md');
const PASTED_PATH = fromRoot('prompt/examples/llm-output.pasted.json');
const rel = (path: string): string => relative(fromRoot(''), path).replace(/\\/g, '/');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The parts of a run's meta.json (written by scripts/run-prompt.ts) that the evidence reports. */
interface RunMeta {
  modelServed: string[];
  durationMs: number;
  tokens: { output: number; thinking: number };
  sha256: { systemPrompt: string; userMessage: string; inputComponent: string };
}

/** The inputs a recorded answer was generated from, and the files that hold them today. */
const RUN_INPUTS = [
  ['system prompt', 'systemPrompt', SYSTEM_PROMPT_PATH],
  ['user message', 'userMessage', USER_MESSAGE_PATH],
  ['input component', 'inputComponent', DEFAULT_INPUT],
] as const;

/** JSON with sorted keys, so two locators compare equal whatever order the model wrote their fields in. */
const canonical = (value: unknown): string => JSON.stringify(value, (_k, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** How a model answer's locators compare with the hand-written reference, target by target (reported, not asserted). */
function compareWithReference(targets: Target[], reference: Target[]): string {
  const parts = (t: Target): Record<string, string> => ({
    scope: t.scope,
    'tier 1': canonical(t.tier1),
    // The reason text of an unavailable tier 2 is free prose; only the fact that it is unavailable is compared.
    'tier 2': 'unavailable' in t.tier2 ? 'unavailable' : canonical(t.tier2),
    'tier 3': canonical(t.tier3.path),
  });
  const differing = new Map<string, string[]>();
  for (const ref of reference) {
    const mine = targets.find((t) => t.key === ref.key);
    const theirs = parts(ref);
    const diff = mine ? Object.keys(theirs).filter((p) => parts(mine)[p] !== theirs[p]) : ['missing'];
    if (diff.length) differing.set(ref.key, diff);
  }
  const same = reference.length - differing.size;
  if (!differing.size) return `${same}/${reference.length} targets identical`;
  const what = [...new Set([...differing.values()].flat())].join(' and ');
  const where = same === 0 ? 'every target' : [...differing.keys()].join(', ');
  return `${same}/${reference.length} targets identical (differs in ${what}, on ${where})`;
}

/** The fenced block of `lang` that follows `heading` in the prompt. */
function fencedBlock(markdown: string, heading: string, lang: string): string {
  const at = markdown.indexOf(heading);
  expect(at, `prompt has a "${heading}" section`).toBeGreaterThanOrEqual(0);
  const open = markdown.indexOf(`\`\`\`${lang}\n`, at);
  const start = open + lang.length + 4;
  return markdown.slice(start, markdown.indexOf('\n```', start));
}

const SCOPE_MODE = { document: 'document', 'open-shadow': 'open', 'closed-shadow': 'closed', iframe: 'frame' } as const;

/** Scopes behind the closed boundary: the closed root itself and the iframe nested in it. */
const BEHIND_CLOSED = new Set(['closed-shadow', 'iframe']);

test.describe('Q3 - ARIA-only locator strategies from the CoT prompt', () => {
  test('the system prompt embeds the schema verbatim and its few-shot answer passes the validator', async ({}, testInfo) => {
    const evidence = new Evidence(testInfo);
    const prompt = readFileSync(PROMPT_PATH, 'utf8');
    const embedded = fencedBlock(prompt, '## Output schema', 'json');
    expect(embedded, 'schema in the prompt is byte-identical to the schema file').toBe(readFileSync(SCHEMA_PATH, 'utf8').trimEnd());

    const exampleHtml = fencedBlock(prompt, '## Example user message', 'html');
    const exampleAnswer = JSON.parse(fencedBlock(prompt, '## Example answer', 'json')) as unknown;
    const report = validateStrategy(exampleAnswer, exampleHtml);
    expect(report.errors, 'few-shot answer obeys its own rules').toEqual([]);

    for (const rule of ['R1. CSS selectors', 'R2. XPath', 'R3. Raw values', 'R4. Other attributes', 'R5. Position', 'R6. Visual', 'R7. Non-semantic roles', 'R8. Invented names']) {
      expect(prompt, `prompt states rule ${rule}`).toContain(rule);
    }
    const steps = [...prompt.matchAll(/\*\*Step (\d), ([a-z -]+)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(steps).toHaveLength(8);

    evidence.metric('schema embedded verbatim', 'yes');
    evidence.metric('few-shot answer', `VALID (${report.errors.length} errors, ${report.warnings.length} warnings)`);
    evidence.metric('method steps', steps.length);
    evidence.metric('hard rules', 8);
    evidence.metric('prompt words', prompt.split(/\s+/).length);
    await evidence.flush();
  });

  test('the validator rejects every known-bad strategy (self-test)', async ({}, testInfo) => {
    const evidence = new Evidence(testInfo);
    const rows = selfTest();
    for (const row of rows) expect(row.pass, `${row.name}: expected ${row.expect}, got ${row.got.join(', ')}`).toBe(true);
    const bad = rows.filter((r) => r.expect !== 'VALID');
    evidence.metric('reference accepted', rows.find((r) => r.expect === 'VALID')?.pass ? 'yes' : 'no');
    evidence.metric('known-bad strategies rejected', `${bad.filter((r) => r.pass).length}/${bad.length}`);
    evidence.metric('codes covered', [...new Set(bad.map((r) => r.expect))].length);
    evidence.detail('cases', rows);
    await evidence.flush();
  });

  // The hand-written reference, every real model answer recorded by `npm run prompt:run`, and the slot for
  // an answer pasted from any other model. All of them must clear the same bar.
  const strategies = [
    { label: 'hand-written reference strategy', path: REFERENCE_PATH, tag: 'hand-written', metaPath: undefined },
    ...recordedRuns().map((r) => ({ label: `${r.model} run-${r.run} (real model answer)`, path: r.answerPath, tag: `${r.model} #${r.run}`, metaPath: r.metaPath })),
    { label: 'pasted LLM answer', path: PASTED_PATH, tag: 'pasted', metaPath: undefined },
  ];

  for (const source of strategies) {
    test(`${source.label}: valid, and all tiers resolve to one same element on ${RELOADS} reloads`, async ({ page }, testInfo) => {
      const parsed = parseModelOutput(readFileSync(source.path, 'utf8'));
      const placeholder = Boolean(parsed.document && typeof parsed.document === 'object' && '_placeholder' in parsed.document);
      test.skip(placeholder, `${rel(source.path)} is still the placeholder: paste a real model answer into it to run this test`);

      const evidence = new Evidence(testInfo);
      const log = evidence.logger(source.tag);
      if (source.metaPath) {
        const meta = JSON.parse(readFileSync(source.metaPath, 'utf8')) as RunMeta;
        evidence.metric('model served', meta.modelServed.join(', '));
        evidence.metric('answer', `${meta.tokens.output} tokens out (${meta.tokens.thinking} thinking), ${(meta.durationMs / 1000).toFixed(0)} s`);
        // Reported, not asserted: an edited input makes the answer stale, and the replay below still shows whether it holds.
        const edited = RUN_INPUTS.filter(([, key, path]) => meta.sha256[key] !== sha256(readFileSync(path, 'utf8'))).map(([name]) => name);
        evidence.metric('inputs unchanged since run', edited.length ? `NO (${edited.join(', ')} edited after this run)` : 'yes (prompt, user message, component)');
      }
      const report = validateFile(source.path, readFileSync(DEFAULT_INPUT, 'utf8'));
      expect(report.errors.map((e) => `${e.code} at ${e.at}: ${e.message}`), `${rel(source.path)} passes the validator`).toEqual([]);
      const targets = (report.strategy?.targets ?? []) as Target[];
      log(`${rel(source.path)}: VALID, ${targets.length} targets, ${report.warnings.length} warning(s)${report.warnings.length ? ` (${report.warnings.map((w) => w.code).join(', ')})` : ''}`);

      await installPierce(page);
      let checks = 0;
      let flows = 0;
      let scopeClaims = 0;
      let closedBaselineHits = 0;
      for (let load = 1; load <= RELOADS; load++) {
        await loadDemo(page);
        const deepest = new Map<string, ElementHandle<Element>>();
        for (const target of targets) {
          const resolved = await resolveTarget(page, target);
          const where = `load ${load}, ${target.key}`;
          expect(resolved.tier3.handles, `${where}: tier 3 (${resolved.tier3.engine}) matches one element`).toHaveLength(1);
          const element = resolved.tier3.handles[0] as ElementHandle<Element>;

          if (target.tier1.uniqueOnPage) {
            expect(resolved.tier1.handles, `${where}: tier 1 (${resolved.tier1.engine}) matches one element`).toHaveLength(1);
            expect(await sameNode(page, resolved.tier1.handles[0] as ElementHandle<Element>, element), `${where}: tier 1 = tier 3`).toBe(true);
          } else {
            expect(resolved.tier1.handles.length, `${where}: tier 1 declared shared`).toBeGreaterThan(1);
            const hits = await Promise.all(resolved.tier1.handles.map((h) => sameNode(page, h, element)));
            expect(hits.includes(true), `${where}: tier 3 element is one of the tier 1 matches`).toBe(true);
          }
          checks += 2;
          if (resolved.tier2) {
            expect(resolved.tier2.handles, `${where}: tier 2 (${resolved.tier2.engine}) matches one element`).toHaveLength(1);
            expect(await sameNode(page, resolved.tier2.handles[0] as ElementHandle<Element>, element), `${where}: tier 2 = tier 3`).toBe(true);
            checks++;
          }

          // The model's claim about where the element lives must match the live page.
          const mode = await element.evaluate((el) => window.__shadowPierce.scopeOf(el).mode);
          expect(mode, `${where}: scope "${target.scope}"`).toBe(SCOPE_MODE[target.scope]);
          scopeClaims++;
          if (BEHIND_CLOSED.has(target.scope)) {
            const t1 = target.tier1;
            closedBaselineHits += await (t1.name === undefined
              ? page.getByRole(t1.role as never)
              : page.getByRole(t1.role as never, { name: t1.name, exact: true })).count();
          }
          deepest.set(`${target.tier1.role}|${target.tier1.name ?? ''}`, element);
          if (load === 1) {
            log(`${target.key.padEnd(18)} [${target.scope}] t1 ${resolved.tier1.engine} | t2 ${resolved.tier2?.engine ?? 'unavailable'} | t3 ${resolved.tier3.engine}`);
          }
        }

        // Drive the transfer through the tier-3 handles when the strategy covers the form.
        const amount = deepest.get('textbox|Amount');
        const account = deepest.get('combobox|To account');
        const confirm = deepest.get('button|Confirm Transaction');
        const status = deepest.get('status|');
        if (amount && account && confirm && status) {
          const value = (load * 77.7).toFixed(2);
          await amount.fill(value);
          await account.selectOption({ label: 'Holiday fund 1093' });
          await (await inOwnFrame(confirm)).click(); // the button is in the iframe: act through that frame
          await expect.poll(() => status.evaluate((el) => el.textContent)).toBe(`Transfer of ${value} to Holiday fund 1093 scheduled.`);
          flows++;
        }
      }

      expect(closedBaselineHits, 'getByRole alone finds none of the targets behind the closed boundary').toBe(0);
      evidence.metric('validator', `VALID (${report.warnings.length} warnings)`);
      evidence.metric('targets', targets.length);
      evidence.metric('scopes', [...new Set(targets.map((t) => t.scope))].join(', '));
      evidence.metric('tier 2 relations', targets.filter((t) => 'relation' in t.tier2).length);
      evidence.metric('reloads', RELOADS);
      evidence.metric('tier checks (same single element)', `${checks}/${checks}`);
      evidence.metric('scope claims matching the page', `${scopeClaims}/${targets.length * RELOADS}`);
      evidence.metric('getByRole hits for targets behind the closed root', closedBaselineHits);
      evidence.metric('transfer driven via tier 3', `${flows}/${RELOADS}`);
      if (source.metaPath) {
        const reference = validateFile(REFERENCE_PATH, readFileSync(DEFAULT_INPUT, 'utf8')).strategy?.targets as Target[];
        evidence.metric('locators vs hand-written reference', compareWithReference(targets, reference));
      }
      await evidence.flush();
    });
  }
});
