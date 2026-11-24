import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

/**
 * Validates an LLM's locator strategy (the JSON the system prompt asks for):
 *   1. JSON Schema (prompt/locator-output.schema.json), strict: unknown keys, roles or false self-checks fail.
 *   2. Semantic checks the schema cannot express: no CSS / XPath / class / id / data-* / style syntax in any
 *      locator field, no volatile token from the input HTML, tier 3 starts at a landmark and ends at tier 1,
 *      tier 2 lands on tier 1's role and uses a relation present in the input, names exist in the input.
 *
 *   tsx scripts/validate-locators.ts <strategy.json> [--input <component.html>]
 *   tsx scripts/validate-locators.ts --self-test        known-bad mutations of the reference must each fail
 */
const fromRoot = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));
export const SCHEMA_PATH = fromRoot('prompt/locator-output.schema.json');
export const DEFAULT_INPUT = fromRoot('prompt/examples/input-component.html');
export const REFERENCE_PATH = fromRoot('prompt/examples/reference-output.handwritten.json');

export type Scope = 'document' | 'open-shadow' | 'closed-shadow' | 'iframe';
export interface NodeRef { role: string; name?: string }
export interface Anchor { role: string; name?: string; text?: string }
export interface RelationLocator {
  relation: string;
  direction: 'anchor-to-target' | 'target-to-anchor';
  anchor: Anchor;
  targetRole: string;
}
export interface Target {
  key: string;
  intent: string;
  scope: Scope;
  tier1: NodeRef & { uniqueOnPage: boolean };
  tier2: RelationLocator | { unavailable: string };
  tier3: { path: NodeRef[] };
}
export interface Strategy {
  analysis: {
    parseTree: { scope: Scope; depth: number; landmarks: NodeRef[] }[];
    accessibilityModel: unknown[];
    volatilityScan: { volatileTokensSeen: string[]; stableSignals: string[] };
    relationshipMap: { from: Anchor; relation: string; to: Anchor }[];
  };
  targets: Target[];
  selfCheck: Record<string, boolean>;
}

export type IssueCode =
  | 'NOT_JSON' | 'FENCED_OUTPUT' | 'PLACEHOLDER' | 'SCHEMA'
  | 'FORBIDDEN_CSS' | 'FORBIDDEN_XPATH' | 'FORBIDDEN_CLASS_OR_ID' | 'FORBIDDEN_DATA_OR_STYLE' | 'VOLATILE_TOKEN'
  | 'TIER3_NOT_LANDMARK' | 'TIER3_END_MISMATCH' | 'TIER2_ROLE_MISMATCH' | 'TIER2_RELATION_NOT_IN_INPUT'
  | 'NAME_NOT_IN_INPUT' | 'SCOPE_NOT_IN_PARSE_TREE' | 'DUPLICATE_KEY' | 'UNSEEN_VOLATILE_TOKEN';

export interface Issue { code: IssueCode; at: string; message: string }
export interface Report { errors: Issue[]; warnings: Issue[]; strategy?: Strategy }

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as { $defs: { landmarkRole: { enum: string[] } } };
const LANDMARKS = new Set(schema.$defs.landmarkRole.enum);
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

/** Which self-check claim each finding contradicts (the model asserted all of them as true). */
const CLAIM: Partial<Record<IssueCode, string>> = {
  FORBIDDEN_CSS: 'noCssSelectors', FORBIDDEN_XPATH: 'noXPath', FORBIDDEN_CLASS_OR_ID: 'noClassOrIdValues',
  FORBIDDEN_DATA_OR_STYLE: 'noDataOrStyleAttributes', VOLATILE_TOKEN: 'noVolatileTokensInLocators',
  TIER3_NOT_LANDMARK: 'everyTier3StartsAtLandmark', TIER3_END_MISMATCH: 'everyTier3EndsAtTier1',
  TIER2_RELATION_NOT_IN_INPUT: 'everyTier2RelationExistsInInput',
};

const FORBIDDEN: { code: IssueCode; what: string; pattern: RegExp }[] = [
  { code: 'FORBIDDEN_CSS', what: 'an id or class selector', pattern: /(^|[\s,>+~(])[#.][A-Za-z_-][\w-]*/ },
  { code: 'FORBIDDEN_CSS', what: 'an attribute selector', pattern: /\[\s*[\w-]+\s*([~|^$*]?=|\])/ },
  { code: 'FORBIDDEN_CSS', what: 'a pseudo-class', pattern: /:(nth-|first-|last-|only-|has\(|is\(|where\(|not\(|host|part\(|slotted)/i },
  { code: 'FORBIDDEN_CSS', what: 'a combinator or selector engine', pattern: /\s[>+~]\s|>>|\bcss=|querySelector|\bpierce\//i },
  { code: 'FORBIDDEN_XPATH', what: 'XPath', pattern: /\/\/|^\/|\/html\b|xpath|@[a-z][\w-]*|\btext\(\)|contains\(|::(ancestor|descendant|following|preceding|parent|child)|\[\d+\]/i },
  { code: 'FORBIDDEN_CLASS_OR_ID', what: 'a class or id reference', pattern: /\bclass(Name|List)?\s*[=:]|\bid\s*=|getElementById|\.className/i },
  { code: 'FORBIDDEN_DATA_OR_STYLE', what: 'a data-*, test-id, style or event attribute', pattern: /\bdata-[a-z]|\btest-?id\b|\bstyle\s*=|\bon[a-z]+\s*=/i },
];

const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();
const decode = (text: string): string =>
  text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Generated-looking tokens in the input: ids, IDREFs, label targets, classes, data-* values, frame URLs and custom-element tags. */
export function volatileTokensOf(html: string): string[] {
  const tokens = new Set<string>();
  const add = (value: string | undefined): void => {
    for (const token of (value ?? '').split(/\s+/)) if (token.length >= 4) tokens.add(token);
  };
  for (const m of html.matchAll(/\b(?:id|for|class|src)="([^"]*)"/g)) add(m[1]);
  for (const m of html.matchAll(/\bdata-[a-z][\w-]*="([^"]*)"/g)) add(m[1]);
  for (const m of html.matchAll(/\baria-(?:controls|labelledby|describedby|owns|activedescendant|details|errormessage|flowto)="([^"]*)"/g)) add(m[1]);
  for (const m of html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)/g)) add(m[1]);
  return [...tokens];
}

/** Text a name could come from: text content plus aria-label / alt / title / placeholder / value. */
function nameHaystack(html: string): string {
  const attributes = [...html.matchAll(/\b(?:aria-label|alt|title|placeholder|value)="([^"]*)"/g)].map((m) => m[1] ?? '');
  const text = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
  return normalise(decode(`${text} ${attributes.join(' ')}`));
}

/** Every string that ends up in a locator, with where it came from. */
function locatorStrings(strategy: Strategy): { at: string; value: string }[] {
  const out: { at: string; value: string }[] = [];
  strategy.targets.forEach((t, i) => {
    const base = `targets[${i}] (${t.key})`;
    if (t.tier1.name !== undefined) out.push({ at: `${base}.tier1.name`, value: t.tier1.name });
    if ('relation' in t.tier2) {
      if (t.tier2.anchor.name !== undefined) out.push({ at: `${base}.tier2.anchor.name`, value: t.tier2.anchor.name });
      if (t.tier2.anchor.text !== undefined) out.push({ at: `${base}.tier2.anchor.text`, value: t.tier2.anchor.text });
    }
    t.tier3.path.forEach((step, j) => {
      if (step.name !== undefined) out.push({ at: `${base}.tier3.path[${j}].name`, value: step.name });
    });
  });
  return out;
}

const sameNode = (a: NodeRef, b: NodeRef): boolean => a.role === b.role && (a.name ?? '') === (b.name ?? '');

/** Validates a parsed strategy against the schema and the semantic rules. `inputHtml` enables input-aware checks. */
export function validateStrategy(document: unknown, inputHtml?: string): Report {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const fail = (code: IssueCode, at: string, message: string): void => {
    const claim = CLAIM[code];
    errors.push({ code, at, message: claim ? `${message} (contradicts selfCheck.${claim})` : message });
  };

  if (document && typeof document === 'object' && '_placeholder' in document) {
    return { errors: [{ code: 'PLACEHOLDER', at: '$', message: 'placeholder file: paste a real model answer first' }], warnings };
  }
  if (!validateSchema(document)) {
    for (const e of validateSchema.errors ?? []) {
      const detail = e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : '';
      errors.push({ code: 'SCHEMA', at: e.instancePath || '$', message: `${e.message ?? 'invalid'}${detail}` });
    }
    return { errors, warnings };
  }
  const strategy = document as Strategy;

  // Forbidden syntax in any locator field.
  const strings = locatorStrings(strategy);
  for (const { at, value } of strings) {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(value)) fail(rule.code, at, `"${value}" contains ${rule.what}`);
    }
  }

  // Volatile tokens: the model's own list, plus everything generated-looking in the input.
  const declared = strategy.analysis.volatilityScan.volatileTokensSeen.filter((t) => !/\s/.test(t) && t.length >= 3);
  const fromInput = inputHtml ? volatileTokensOf(inputHtml) : [];
  const volatile = [...new Set([...declared, ...fromInput])];
  for (const { at, value } of strings) {
    const hit = volatile.find((token) => value.toLowerCase().includes(token.toLowerCase()));
    if (hit) fail('VOLATILE_TOKEN', at, `"${value}" uses the volatile token "${hit}"`);
  }
  if (inputHtml) {
    for (const token of declared) {
      if (!inputHtml.includes(token)) warnings.push({ code: 'UNSEEN_VOLATILE_TOKEN', at: 'analysis.volatilityScan', message: `"${token}" is not in the input` });
    }
  }

  // Structure of the tiers.
  const scopes = new Set(strategy.analysis.parseTree.map((p) => p.scope));
  const keys = new Set<string>();
  const haystack = inputHtml ? nameHaystack(inputHtml) : '';
  strategy.targets.forEach((t, i) => {
    const base = `targets[${i}] (${t.key})`;
    if (keys.has(t.key)) fail('DUPLICATE_KEY', base, `key "${t.key}" is used twice`);
    keys.add(t.key);
    if (!scopes.has(t.scope)) fail('SCOPE_NOT_IN_PARSE_TREE', `${base}.scope`, `scope "${t.scope}" is not in analysis.parseTree`);

    const path = t.tier3.path;
    const first = path[0] as NodeRef;
    const last = path[path.length - 1] as NodeRef;
    if (!LANDMARKS.has(first.role)) fail('TIER3_NOT_LANDMARK', `${base}.tier3.path[0]`, `starts at "${first.role}", not a landmark (${[...LANDMARKS].join(', ')})`);
    if (!sameNode(last, t.tier1)) fail('TIER3_END_MISMATCH', `${base}.tier3`, `ends at ${last.role} "${last.name ?? ''}", tier 1 is ${t.tier1.role} "${t.tier1.name ?? ''}"`);

    if ('relation' in t.tier2) {
      if (t.tier2.targetRole !== t.tier1.role) fail('TIER2_ROLE_MISMATCH', `${base}.tier2.targetRole`, `"${t.tier2.targetRole}" differs from tier 1 role "${t.tier1.role}"`);
      if (inputHtml && !inputHtml.includes(`${t.tier2.relation}="`)) {
        fail('TIER2_RELATION_NOT_IN_INPUT', `${base}.tier2.relation`, `${t.tier2.relation} does not occur in the input`);
      }
    }
  });

  // Names must exist in the input (catches invented labels).
  if (inputHtml) {
    for (const { at, value } of strings) {
      if (!haystack.includes(normalise(value))) fail('NAME_NOT_IN_INPUT', at, `"${value}" does not occur as text or label in the input`);
    }
  }
  return { errors, warnings, strategy };
}

/** Parses model output: plain JSON, or JSON in a ```json fence (accepted with a warning). */
export function parseModelOutput(raw: string): { document?: unknown; issues: Issue[] } {
  try {
    return { document: JSON.parse(raw), issues: [] };
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
    if (fenced?.[1]) {
      try {
        return { document: JSON.parse(fenced[1]), issues: [{ code: 'FENCED_OUTPUT', at: '$', message: 'answer was wrapped in a markdown fence; the prompt asks for bare JSON' }] };
      } catch { /* fall through */ }
    }
    return { issues: [{ code: 'NOT_JSON', at: '$', message: 'answer is not valid JSON' }] };
  }
}

/** Validates a file on disk; FENCED_OUTPUT is a warning, NOT_JSON an error. */
export function validateFile(path: string, inputHtml?: string): Report {
  const parsed = parseModelOutput(readFileSync(path, 'utf8'));
  if (parsed.document === undefined) return { errors: parsed.issues, warnings: [] };
  const report = validateStrategy(parsed.document, inputHtml);
  return { ...report, warnings: [...parsed.issues, ...report.warnings] };
}

// ---------------------------------------------------------------------------------- self-test

export interface SelfTestCase { name: string; expect: IssueCode | 'VALID'; got: string[]; pass: boolean }

/** Mutates the hand-written reference into known-bad strategies; each must fail with the expected code. */
export function selfTest(inputHtml = readFileSync(DEFAULT_INPUT, 'utf8')): SelfTestCase[] {
  const reference = JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) as Strategy;
  const tokens = volatileTokensOf(inputHtml);
  const anId = tokens.find((t) => /^[a-z][a-z0-9]{8,}$/.test(t)) ?? 'missing-id';
  const aTestId = tokens.find((t) => /^dyn-uuid-\d+$/.test(t)) ?? 'missing-test-id';
  const aTag = tokens.find((t) => /^[a-z][a-z0-9]*-[a-z0-9]+-[a-z0-9]+$/.test(t)) ?? 'missing-tag';
  const button = (s: Strategy): Target => s.targets.find((t) => t.key === 'confirmTransfer') as Target;
  const tab = (s: Strategy): Target => s.targets.find((t) => t.key === 'securityTab') as Target;

  const cases: [string, IssueCode | 'VALID', (s: Strategy) => void][] = [
    ['hand-written reference as-is', 'VALID', () => undefined],
    ['class selector as a name', 'FORBIDDEN_CSS', (s) => { button(s).tier1.name = '.css-udwwm'; }],
    ['id selector as an anchor', 'FORBIDDEN_CSS', (s) => { (tab(s).tier2 as RelationLocator).anchor.name = '#q5das5i5xdt'; }],
    ['attribute selector', 'FORBIDDEN_CSS', (s) => { button(s).tier1.name = 'button[type=submit]'; }],
    ['shadow-piercing CSS combinator', 'FORBIDDEN_CSS', (s) => { button(s).tier1.name = 'form >> button'; }],
    ['absolute XPath in a tier 3 step', 'FORBIDDEN_XPATH', (s) => { (button(s).tier3.path[1] as NodeRef).name = '/html/body/main/section[2]'; }],
    ['relative XPath with text()', 'FORBIDDEN_XPATH', (s) => { button(s).tier1.name = "//button[text()='Confirm transfer']"; }],
    ['raw class string', 'FORBIDDEN_CLASS_OR_ID', (s) => { button(s).tier1.name = 'class="css-udwwm"'; }],
    ['data-testid', 'FORBIDDEN_DATA_OR_STYLE', (s) => { button(s).tier1.name = 'data-testid=confirm'; }],
    ['inline style', 'FORBIDDEN_DATA_OR_STYLE', (s) => { button(s).tier1.name = 'style="color: blue"'; }],
    ['random id from the input as a name', 'VOLATILE_TOKEN', (s) => { button(s).tier1.name = anId; }],
    ['custom-element tag from the input in a path', 'VOLATILE_TOKEN', (s) => { (button(s).tier3.path[1] as NodeRef).name = aTag; }],
    ['data-test-id value from the input as a name', 'VOLATILE_TOKEN', (s) => { button(s).tier1.name = aTestId; }],
    ['tier 3 starts below a landmark', 'TIER3_NOT_LANDMARK', (s) => { tab(s).tier3.path.splice(0, 2); }],
    ['tier 3 ends at another element', 'TIER3_END_MISMATCH', (s) => { tab(s).tier3.path[tab(s).tier3.path.length - 1] = { role: 'tab', name: 'Profile' }; }],
    ['tier 2 lands on another role', 'TIER2_ROLE_MISMATCH', (s) => { (button(s).tier2 as RelationLocator).targetRole = 'link'; }],
    ['tier 2 relation absent from input', 'TIER2_RELATION_NOT_IN_INPUT', (s) => { (button(s).tier2 as RelationLocator).relation = 'aria-owns'; }],
    ['invented accessible name', 'NAME_NOT_IN_INPUT', (s) => { button(s).tier1.name = 'Submit payment'; (button(s).tier3.path[3] as NodeRef).name = 'Submit payment'; }],
    ['unknown role', 'SCHEMA', (s) => { button(s).tier1.role = 'clickable'; }],
    ['extra "css" property', 'SCHEMA', (s) => { (button(s).tier1 as unknown as Record<string, string>).css = 'form > button'; }],
    ['self-check reports false', 'SCHEMA', (s) => { s.selfCheck.noXPath = false; }],
    ['analysis step missing', 'SCHEMA', (s) => { delete (s.analysis as Partial<Strategy['analysis']>).volatilityScan; }],
    ['duplicate target key', 'DUPLICATE_KEY', (s) => { s.targets.push(structuredClone(button(s))); }],
    ['scope missing from the parse tree', 'SCOPE_NOT_IN_PARSE_TREE', (s) => { s.analysis.parseTree = s.analysis.parseTree.filter((p) => p.scope !== 'closed-shadow'); }],
  ];

  return cases.map(([name, expect, mutate]) => {
    const strategy = structuredClone(reference);
    mutate(strategy);
    const report = validateStrategy(strategy, inputHtml);
    const got = [...new Set(report.errors.map((e) => e.code))];
    const pass = expect === 'VALID' ? got.length === 0 : got.includes(expect);
    return { name, expect, got: got.length ? got : ['VALID'], pass };
  });
}

// ---------------------------------------------------------------------------------- CLI

function printReport(file: string, inputPath: string | undefined, report: Report): void {
  const rel = (p: string): string => relative(process.cwd(), p) || p;
  console.log(`validate-locators: ${rel(file)}`);
  if (inputPath) console.log(`  input   : ${rel(inputPath)}`);
  for (const w of report.warnings) console.log(`  warning : ${w.code} at ${w.at}: ${w.message}`);
  for (const e of report.errors) console.log(`  ERROR   : ${e.code} at ${e.at}: ${e.message}`);
  if (report.strategy) {
    const t = report.strategy.targets;
    const withRelation = t.filter((x) => 'relation' in x.tier2).length;
    console.log(`  targets : ${t.length} (tier 2 relation: ${withRelation}, tier 2 unavailable: ${t.length - withRelation})`);
  }
  console.log(`  RESULT  : ${report.errors.length ? `INVALID (${report.errors.length} error(s))` : 'VALID'}`);
}

function main(argv: string[]): number {
  if (argv.includes('--self-test')) {
    const rows = selfTest();
    console.log('validate-locators self-test: each known-bad strategy must be rejected with the expected code');
    for (const r of rows) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(44)} expect ${r.expect.padEnd(28)} got ${r.got.join(', ')}`);
    const passed = rows.filter((r) => r.pass).length;
    console.log(`  self-test: ${passed}/${rows.length} cases behaved as expected`);
    return passed === rows.length ? 0 : 1;
  }
  const inputIndex = argv.indexOf('--input');
  const inputPath = inputIndex >= 0 ? resolve(argv[inputIndex + 1] ?? '') : DEFAULT_INPUT;
  const files = argv.filter((a, i) => !a.startsWith('--') && !(inputIndex >= 0 && i === inputIndex + 1));
  if (!files.length) {
    console.error('usage: tsx scripts/validate-locators.ts <strategy.json> [--input <component.html>] | --self-test');
    return 2;
  }
  const inputHtml = readFileSync(inputPath, 'utf8');
  let failed = 0;
  for (const file of files) {
    const report = validateFile(resolve(file), inputHtml);
    printReport(resolve(file), inputPath, report);
    if (report.errors.length) failed++;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
