# Q3 · Dynamic Micro-Frontend Shadow DOM Piercing & Semantic Prompt Architecture

A local **micro-frontend** whose tag names, ids, classes and nesting depth change on every load, with
an **unlinked closed shadow root nested inside an open shadow host**. Two deliverables work against it:

| | What it is |
|---|---|
| **Shadow DOM piercing** | A raw vanilla JS deep query that walks the document, every open root and the closed root, and matches elements by **ARIA role + accessible name**. It comes as a readable engine ([`src/shadow-pierce.js`](src/shadow-pierce.js)) and as a **one-line copy-paste query string** ([`src/pierce-query.min.js`](src/pierce-query.min.js)) with its one-line hook. A hook-free **CDP alternative** ([`src/cdpPierce.ts`](src/cdpPierce.ts)) uses `DOM.getDocument({pierce: true})` and `Accessibility.queryAXTree`. All three drive the form inside the closed root on 5 reloads. |
| **CoT prompt architecture** | A Chain-of-Thought system prompt ([`prompt/locator-cot-system-prompt.md`](prompt/locator-cot-system-prompt.md)) that makes an LLM parse a raw HTML component tree and return a **three-tier, ARIA-only locator strategy**: role mapping → ARIA relationship (`aria-controls`, …) → accessibility sub-tree path. CSS, XPath, class strings, ids and `data-*` are explicitly forbidden. The answer is a strict JSON document. A validator checks it, and a resolver executes every tier on 5 fresh loads. |

---

## Run it

Needs Node.js 20+. The test run starts the demo server itself, on 127.0.0.1:5318.

```bash
npm install
npx playwright install chromium
npm test
```

| Command | What it does |
|---|---|
| `npm test` | Validator self-test (22 known-bad strategies) → `tsc --noEmit` → 9 Playwright tests. Ends with the **Q3 EVIDENCE SUMMARY**. |
| `npm run serve` | The demo on http://127.0.0.1:5318. Reload it and watch the tags, ids and classes change in DevTools. If it is already running, `npm test` reuses it. |
| `npm run snapshot` | Captures a fresh load into `prompt/examples/input-component.html` and `prompt/examples/user-message.txt`. |
| `npm run validate -- <answer.json>` | Validates one LLM answer against the schema and the hard rules (the input defaults to `prompt/examples/input-component.html`). |
| `npm run report` | Opens the HTML report (trace, screenshot and video of every test). |

---

## The demo micro-frontend

[`site/app.js`](site/app.js) mounts two custom elements. On every load it regenerates:

- the custom-element tag names (`mf-<5>-<5>`),
- every id, and so every IDREF (`for`, `aria-controls`, `aria-labelledby`, `aria-describedby`),
- every class (`css-<5>`, like CSS-in-JS output),
- 0–2 anonymous wrapper `<div>`s around most blocks, so absolute paths change too.

Only the accessibility semantics stay the same:

```
document
└─ main                                       (landmark: main)
   └─ <mf-?????-?????>                        shell host
      └─ #shadow-root (open)
         ├─ nav "Account sections"            links Overview / Statements / Settings
         ├─ region "Account settings"         tablist "Settings sections": tab Profile / tab Security
         │                                    tabpanel Profile (textbox "Display name"), tabpanel Security (hidden)
         └─ region "Transfer funds"
            └─ (0-2 wrapper divs)
               └─ <mf-?????-?????>            vault host
                  └─ #shadow-root (closed)    kept only in a local variable: "unlinked"
                     └─ form "New transfer"   textbox "Amount", combobox "To account",
                                              button "Confirm transfer" (aria-controls → status,
                                              aria-describedby → note), status (aria-live)
```

The vault calls `this.attachShadow({ mode: 'closed' })` and keeps the result only in the closures of
`connectedCallback`. So `host.shadowRoot` is `null`, and nothing on the host, on `window`, in a slot or
in an event references the root. The test checks this on every load: own and inherited host properties,
and every `window` property.

---

## Part 1 · Piercing the closed root

### Spec behaviour (why this is hard)

- **A closed root is unreachable from page JS by design.** `attachShadow({mode: 'closed'})` returns the
  root to its caller only, and `Element.shadowRoot` returns `null` for closed roots. If the component
  keeps no reference ("unlinked"), no script running later can reach it. Walking the DOM stops at the
  host. Seen from outside, `elementFromPoint` and an event's `composedPath()` stop at the host too.
- **The only page-level way in is to be there when the root is created.** An init script that runs
  before any page script can replace `Element.prototype.attachShadow` and keep each returned root.
  Playwright's `addInitScript` (CDP `Page.addScriptToEvaluateOnNewDocument`) runs at document creation,
  before the page's own scripts, which is early enough. A root attached before the hook loads is lost.
- **Declarative shadow DOM bypasses the hook.** `<template shadowrootmode="closed">` is attached by the
  HTML parser, not through `attachShadow`, so a prototype hook never sees it. The snapshot in
  `prompt/examples/` uses exactly this form, so if you served that file as a page, only the CDP route
  could pierce it. The demo creates its roots imperatively, as most component frameworks do.
- **IDREFs are scoped to one tree.** `aria-labelledby`, `aria-controls` and `<label for>` resolve inside
  the tree scope that holds the element: the document or one shadow root. They never cross a shadow
  boundary. The engine resolves them with `el.getRootNode().getElementById(...)`, as the browser does.
- **The accessibility tree is flat.** Chrome builds it over the flat tree, so content in a closed root is
  fully exposed to assistive technology and to the DevTools protocol, though not to page JS. The CDP
  route works because of this asymmetry.
- **Playwright and XPath.** Playwright's CSS and role engines pierce **open** roots, not closed ones.
  XPath (`document.evaluate`) pierces no shadow root at all. Both are measured: 0 hits inside the
  closed root on every load.

### 1. The deep query engine: `src/shadow-pierce.js`

Load it before the page's scripts, then query by role and accessible name:

```ts
await page.addInitScript({ path: 'src/shadow-pierce.js' });
await page.goto('/');
const button = await page.evaluateHandle(() =>
  window.__shadowPierce.query({ role: 'button', name: 'Confirm transfer' }));
await button.asElement()!.click();
```

- **Hook.** It patches `attachShadow` and stores every root in a `WeakMap` keyed by host. Nothing is
  added to the host, and detached hosts can be garbage-collected.
- **Walk.** It walks the flat tree with `TreeWalker`, entering `host.shadowRoot` or the captured root
  at any depth. It uses no selectors at all, so it never reads a tag name, id or class.
- **Role.** The explicit `role` first, then the implicit HTML-AAM mapping. This includes the context
  rules: `header`/`footer` are only banner/contentinfo at top level, and `section`/`form` are only a
  region/form when named.
- **Accessible name** (accname 1.2 subset): `aria-labelledby` (same tree scope), `aria-label`,
  `<label>` / `labels`, `alt`, `<legend>`, then content for name-from-content roles, then `title` and
  `placeholder`. Elements that are hidden (`aria-hidden`, `hidden`, `display:none`,
  `visibility:hidden` via `checkVisibility`) are skipped unless `includeHidden` is set.
- **API.** `query`, `queryAll`, `queryPath` (tier 3 paths), `queryRelation` (tier 2 relations),
  `roleOf`, `nameOf`, `scopeOf` (`open`/`closed` chain), `landmarksOf`, `absolutePath` (evidence only),
  `stats`.

The role/name subset is checked against two independent oracles in the run: **Playwright `getByRole`**
(19 document and open-root elements return the same node) and **Chrome's own accessibility tree** over
CDP (every role and name pair inside the closed root is equal).

### 2. The copy-paste query string

**Hook**: [`src/pierce-hook.min.js`](src/pierce-hook.min.js). It must run before the component's
scripts:

```js
(()=>{const K=Symbol.for('shadow-pierce.roots');if(window[K])return;const M=new WeakMap(),A=Element.prototype.attachShadow;Object.defineProperty(window,K,{value:M});Element.prototype.attachShadow=function(i){const r=A.call(this,i);M.set(this,r);return r}})();
```

**Query**: [`src/pierce-query.min.js`](src/pierce-query.min.js). It takes `(role, name)` and returns the
first visible match from the document, open roots and hooked closed roots. Pass `name` as `null` to
match any name:

```js
(role,name)=>{const M=window[Symbol.for('shadow-pierce.roots')],sr=e=>e.shadowRoot||(M&&M.get(e))||null,T={A:'link',BUTTON:'button',SELECT:'combobox',TEXTAREA:'textbox',NAV:'navigation',MAIN:'main',FORM:'form',SECTION:'region',UL:'list',LI:'listitem'},I={button:'button',submit:'button',reset:'button',checkbox:'checkbox',radio:'radio'},ro=e=>e.getAttribute('role')||(e.tagName==='INPUT'?I[e.type]||'textbox':/^H[1-6]$/.test(e.tagName)?'heading':T[e.tagName]),n=s=>(s||'').replace(/\s+/g,' ').trim(),nm=e=>{const ids=e.getAttribute('aria-labelledby'),root=e.getRootNode();return n(ids?ids.split(/\s+/).map(i=>(root.getElementById(i)||{}).textContent).join(' '):e.getAttribute('aria-label')||(e.labels&&e.labels.length?[...e.labels].map(l=>l.textContent).join(' '):e.textContent))},q=[document];while(q.length){const s=q.shift(),w=document.createTreeWalker(s,1);for(let e=w.nextNode();e;e=w.nextNode()){if(ro(e)===role&&(name==null||nm(e)===name)&&e.checkVisibility())return e;const r=sr(e);if(r)q.push(r)}}return null}
```

Usage: `(<query string>)('button', 'Confirm transfer')`. In Playwright:

```ts
await page.addInitScript({ content: HOOK });
const el = await page.evaluateHandle(`(${QUERY})('textbox', 'Amount')`);
```

- **Tested.** The suite runs a page that has **only** these two strings: no engine and no helpers. It
  fills, submits and reads the closed-root form on 5 reloads. Then it checks that the string returns
  the same node as the full engine for 11 targets.
- **Same root map.** Both hooks share the global root map (`Symbol.for('shadow-pierce.roots')`), so
  either may load first.
- **Smaller role/name subset.** The string covers explicit role, the common implicit roles,
  `aria-labelledby`, `aria-label`, `<label>`, then text content. For full accname behaviour, use the
  engine.
- **Untested ways to install the hook without Playwright:** a MAIN-world extension content script at
  `document_start`, or CDP `Page.addScriptToEvaluateOnNewDocument`. Pasting it into the console after
  load is too late: the root already exists.

### 3. The hook-free alternative: CDP (`src/cdpPierce.ts`)

`CdpPierce` opens a CDP session and never injects anything into the page. The test asserts the hook and
the API are absent on every load.

| Step | CDP call | Result in the run |
|---|---|---|
| Map the shadow boundaries | `DOM.getDocument({depth: -1, pierce: true})` → `shadowRoots[].shadowRootType` | `open` (in document) > `closed` (in the open root), 5/5 loads |
| Find by role + name | `Accessibility.queryAXTree({backendNodeId: <document>, role, accessibleName})` | `textbox "Amount"`, `combobox "To account"`, `button "Confirm transfer"`, each with shadow chain `open > closed` |
| Type | `DOM.focus` + real key events | Amount filled |
| Click | `DOM.scrollIntoViewIfNeeded` + `DOM.getContentQuads` + real mouse click | Transfer submitted |
| Read | `DOM.resolveNode` + `Runtime.callFunctionOn` | Status text verified, 5/5 loads |

The `<select>` is set on its remote object through `Runtime.callFunctionOn`, followed by `input` and
`change` events. Keyboard selection on a collapsed `<select>` differs by platform. CDP is Chromium
only.

---

## Part 2 · The CoT prompt for ARIA-only locators

| File | Role |
|---|---|
| [`prompt/locator-cot-system-prompt.md`](prompt/locator-cot-system-prompt.md) | The system prompt (whole file). |
| [`prompt/locator-output.schema.json`](prompt/locator-output.schema.json) | JSON Schema 2020-12 of the answer. It is embedded verbatim in the prompt, and a test checks that byte-for-byte. |
| [`prompt/examples/user-message.txt`](prompt/examples/user-message.txt) | The user message: 6 targets by **intent** (not by name), plus the captured component. |
| [`prompt/examples/input-component.html`](prompt/examples/input-component.html) | One live load, captured by `npm run snapshot`. Shadow roots are serialised as declarative templates with `Element.getHTML({shadowRoots})`. The closed root is included because the hook captured it. |
| [`prompt/examples/reference-output.handwritten.json`](prompt/examples/reference-output.handwritten.json) | **Hand-written** reference answer (written while building this, **not** produced by a model run of the prompt). It is used as the validator's known-good base and to test the resolver. |
| [`prompt/examples/llm-output.pasted.json`](prompt/examples/llm-output.pasted.json) | Slot for a **real** model answer. While it holds the placeholder, its test is skipped and says so. |

### How the prompt forces the behaviour

- **The chain of thought is part of the output and can be checked.** The answer's `reasoning` object
  holds the eight steps: parse-tree → accessibility-model → volatility-scan → target identification →
  relationship-map → landmark-map → compose tiers → self-check. The targets have to be derived from
  that model, not from the raw HTML. A free-text "think step by step" can't be checked, but this can.
- **Three tiers with exact contracts:**
  - **Tier 1, role mapping:** `{role, name, uniqueOnPage}`.
  - **Tier 2, ARIA relationship:** `{relation, direction, anchor, targetRole}`. `aria-controls` is
    preferred. If no ARIA relation touches the target, it is `{unavailable: <why>}`: a `<label for>`
    is not an ARIA relation, and the prompt forbids inventing one.
  - **Tier 3, accessibility sub-tree path:** it must start at a landmark and end at tier 1. Shadow
    boundaries don't appear in it, because the accessibility tree is flat.
- **Eight hard rules (R1–R8)** forbid, by name:
  - CSS selectors and fragments, and selector engines (`css=`, `pierce/`);
  - absolute and relative XPath, axes, predicates and `text()`;
  - raw class strings, ids, IDREF values and custom tag names;
  - `data-*`, `style` and event attributes;
  - positional reasoning;
  - visual properties;
  - non-semantic roles;
  - invented names.

  Ids may appear in the reasoning only to resolve an IDREF, and are dropped once it is resolved.
- **Self-check (step 8).** Eight assertions that must all be `true` (they are `const: true` in the
  schema). The model has to revise until each one holds. The validator then recomputes every one
  independently, and reports which claim was false.
- **One few-shot example**, for a *different* component: a closed-root notification card with a
  switch, an `aria-describedby` note and an `aria-controls` dialog. It shows the shape of the answer
  without giving away the answer for the bank component. A test runs the example answer through the
  validator against the example HTML.
- **Prompt-injection guard.** The HTML is declared to be data, and instructions inside it are ignored.

### The validator (`scripts/validate-locators.ts`)

| Check | Error code |
|---|---|
| Strict schema (unknown keys, roles outside the ARIA 1.2 concrete list, a `false` self-check, missing reasoning step) | `SCHEMA` |
| `#id` / `.class` / `[attr]` / pseudo-classes / combinators / `css=` / `pierce/` / `querySelector` in a locator field | `FORBIDDEN_CSS` |
| `//`, `/html`, axes, `@attr`, `text()`, `contains()`, `[n]` | `FORBIDDEN_XPATH` |
| `class=`, `id=`, `getElementById`, `className` | `FORBIDDEN_CLASS_OR_ID` |
| `data-*`, `testid`, `style=`, `on*=` | `FORBIDDEN_DATA_OR_STYLE` |
| Any id, IDREF, class or custom tag from the **input HTML**, or any token the model itself listed in `volatileTokensSeen` | `VOLATILE_TOKEN` |
| Tier 3 does not start at a landmark / does not end at tier 1 | `TIER3_NOT_LANDMARK` / `TIER3_END_MISMATCH` |
| Tier 2 lands on another role / uses a relation absent from the input | `TIER2_ROLE_MISMATCH` / `TIER2_RELATION_NOT_IN_INPUT` |
| A name that is not text or a label anywhere in the input (invented) | `NAME_NOT_IN_INPUT` |
| Target scope not in the parse tree, duplicate keys | `SCOPE_NOT_IN_PARSE_TREE` / `DUPLICATE_KEY` |

`--self-test` mutates the reference into 22 known-bad strategies, covering 13 error codes, and each one
must be rejected with its expected code. The reference itself must pass. This runs first in `npm test`,
and again as a Playwright test so it shows in the summary. Answers wrapped in a markdown fence are
accepted with a `FENCED_OUTPUT` warning. Anything else that isn't JSON is `NOT_JSON`.

### Executing a strategy (`tests/framework/resolveStrategy.ts`)

| Scope the answer claims | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| `document` / `open-shadow` | Playwright `getByRole(role, {name, exact})` | deep query `queryRelation` (IDREF in the element's own tree scope) | Playwright chained `getByRole` |
| `closed-shadow` | deep query `queryAll` | deep query `queryRelation` | deep query `queryPath` |

On each of 5 fresh loads, for every target:

- tier 3 must match exactly one element;
- tier 1 (when `uniqueOnPage`) and tier 2 must match that same single element;
- the element's real scope (`document` / `open` / `closed`) must equal the scope the answer claimed.

After that, the transfer form is filled, submitted and its status read through the tier-3 handles. As a
baseline, plain `getByRole` must find **none** of the closed-shadow targets.

### Running the prompt on a real model

1. Use the whole of `prompt/locator-cot-system-prompt.md` as the **system** prompt, and the whole of
   `prompt/examples/user-message.txt` as the **user** message.
2. Paste the model's raw answer into `prompt/examples/llm-output.pasted.json`, replacing the placeholder.
3. Run `npm run validate -- prompt/examples/llm-output.pasted.json`, then `npm test`. The *pasted LLM
   answer* test now runs instead of being skipped. If the model broke a rule, the validator names the
   rule and the field.

`npm run snapshot` gives the model a fresh, never-seen load. The reference's own token list then
produces `UNSEEN_VOLATILE_TOKEN` warnings, which are expected because the tokens changed.

---

## Spec → implementation traceability

| PDF requirement | Implementation | Evidence in the run |
|---|---|---|
| Micro-frontend whose node segment names change on every DOM refresh | [`site/app.js`](site/app.js): random tags, ids/IDREFs, classes, wrapper depth per load | 5/5 distinct shell tags, vault tags, IDREFs, classes and absolute paths over 5 reloads |
| Closed shadow root **nested inside a secondary open shadow host** | Vault (closed) inside the shell's open root | `scopeOf` chain `closed` inside `open`, every load; CDP boundaries `open > closed` |
| **Unlinked** closed root | Root kept only in closures | `vault.shadowRoot === null` 5/5; 0 host or `window` properties reference it |
| **Raw vanilla JS query string** that **dynamically traverses** it | [`src/pierce-query.min.js`](src/pierce-query.min.js) + [`src/pierce-hook.min.js`](src/pierce-hook.min.js) (one line each), full engine [`src/shadow-pierce.js`](src/shadow-pierce.js) | Compact strings alone drive the closed form 5/5. Same node as the engine 11/11. Engine drives it 5/5 |
| (extra) Hook-free alternative | [`src/cdpPierce.ts`](src/cdpPierce.ts) | 5/5 transfers with no script injected |
| **CoT system prompt** that makes an LLM **parse raw HTML component trees** | [`prompt/locator-cot-system-prompt.md`](prompt/locator-cot-system-prompt.md), steps 1–8 written into `reasoning` | Prompt test: 8 steps, schema embedded verbatim, few-shot answer valid |
| **Multi-tiered strategy** from **role mappings, aria-controls relationships, accessibility sub-trees** | Tier 1 / tier 2 / tier 3 contracts in the prompt and [schema](prompt/locator-output.schema.json) | Reference strategy: every tier resolves to the same single element, 5/5 loads |
| **Explicitly forbidding** CSS attributes, absolute structural XPaths, raw class strings | Rules R1–R4 (+ R5–R8) in the prompt; [`scripts/validate-locators.ts`](scripts/validate-locators.ts) enforces them | Self-test: 22/22 known-bad strategies rejected with the right code |
| Strategies survive volatile classes / random ids | Resolver runs each strategy against 5 new loads, never the captured one | 0 volatile tokens accepted; transfer driven through tier 3 on 5/5 loads |

---

## Design decisions and trade-offs

- **Query by role + name, never by structure.** The only stable thing on this page is its accessibility
  semantics, so both the piercing deliverable and the prompt use them. The engine walks with
  `TreeWalker` and uses no selectors at all.
- **`WeakMap` keyed by host for the captured roots.** Adding a property to the host would make the root
  "linked", and the unlinked check would no longer test anything. A `WeakMap` also keeps no detached host
  alive.
- **A full engine and a compact string.** The brief asks for a query *string*, and the tests need real
  accessible-name rules. Both exist, and a test proves they return the same nodes.
- **Two independent checks of the role/name logic.** Writing an accname subset is easy to get subtly
  wrong. Playwright's `getByRole` checks it wherever Playwright can see, and Chrome's own accessibility
  tree (CDP) checks it inside the closed root, where Playwright can't.
- **Structured chain of thought instead of a free-text one.** Every reasoning step is a schema field, so
  it can be read, diffed and validated. The self-check values are fixed to `true` in the schema, so the
  model has to fix its strategy instead of reporting a failure, and the validator recomputes them anyway.
- **Tier 2 may be `unavailable`.** Forcing a relationship for every target would push the model to
  invent `aria-controls` links. Two of the six reference targets have none, and say why.
- **No `prefixItems` in the schema.** JSON Schema can only enforce "landmark first" with an open tuple,
  which strict Ajv flags and several structured-output APIs don't support. The validator checks it
  instead, as `TIER3_NOT_LANDMARK`.
- **Targets are given by intent, not by name.** The user message says "the button that submits the
  transfer", not "Confirm transfer", so the model has to compute the accessible name itself. Invented
  names are caught as `NAME_NOT_IN_INPUT`.
- **Strategies are executed, not just validated.** A strategy can be schema-valid and still wrong, so
  the resolver runs it on five loads the model never saw.

## Interpretations (where the brief was ambiguous)

1. **"Raw vanilla JavaScript query string"**: a single-line JS expression with no dependencies
   (`pierce-query.min.js`), plus its single-line hook. No page script can traverse a truly unlinked
   closed root after it exists, so the "dynamic" part is capturing roots as they are created and then
   walking them on demand on every load. The CDP route is included as the alternative that needs no
   hook.
2. **"Node segment names change programmatically on every DOM refresh"**: custom-element tag names, ids
   (and so IDREFs), classes and wrapper depth are regenerated on every page load. Roles, names and ARIA
   relationship types stay fixed, as they do on a real site between releases.
3. **"Unlinked"**: no reference to the closed root outside the component's own closures. `host.shadowRoot`
   is `null`, and no property, global, slot or event exposes it. The test verifies this.
4. **"Non-visual semantic ARIA models"**: roles (explicit and implicit), accessible names, ARIA relationship
   attributes as relationship *types*, and landmark paths. Visible text is used only where accname takes
   it from content (for example a button's label) or as the text of a relationship anchor.
5. **"Forces an LLM"**: a prompt alone can't force anything, so it is backed by a strict schema, a
   validator and an executor that reject non-compliant answers.
6. **Model output.** The reference strategy was written by hand while building this. It is labelled so in
   its file name and above. **A real model answer is not in the repo yet.** The `llm-output.pasted.json`
   slot and its test are ready for one (see *Running the prompt on a real model*).

---

## Evidence from a real run

Output of `npm install && npx playwright install chromium && npm test` is in [`EVIDENCE.md`](EVIDENCE.md).

---

## Video checklist (output → source → AI prompt history)

1. **Output**
   - Run `npm test`. Point out:
     - the validator self-test table (22 rejected, reference accepted);
     - the per-load deep-query lines: new tags and IDREFs on every load, the `#shadow-root(closed)`
       absolute paths, the transfer status;
     - the CDP lines;
     - the **Q3 EVIDENCE SUMMARY**: `vault.shadowRoot null: 5/5`, `getByRole/XPath hits in closed root: 0`,
       `closed-root (role, name) vs Chrome AX tree`, `tier checks`.
   - Run `npm run serve`, open http://127.0.0.1:5318 in DevTools, reload twice, and show the tag names
     changing and `#shadow-root (closed)`. In the console, `$0.shadowRoot` on the vault host is `null`.
   - Run `npm run validate -- prompt/examples/reference-output.handwritten.json`.
2. **Source walkthrough**, in this order:
   - `site/app.js` (randomisation, the closed root kept in a closure)
   - `src/shadow-pierce.js` → `src/pierce-hook.min.js` + `src/pierce-query.min.js` → `src/cdpPierce.ts`
   - `prompt/locator-cot-system-prompt.md` → `prompt/locator-output.schema.json` → `scripts/validate-locators.ts`
   - `tests/framework/resolveStrategy.ts` → `tests/*.spec.ts`
3. **AI prompt history**
   - Show the prompts used to build this.
   - Show a live run of the CoT prompt: system = the prompt file, user = `user-message.txt`. Paste the
     answer into `llm-output.pasted.json` and run `npm test` again so the pasted-answer test runs.

## Layout

```
q3/
  package.json, tsconfig.json, playwright.config.ts
  site/            index.html, page.css, app.js        the randomised micro-frontend (open shell + closed vault)
  src/
    shadow-pierce.js                                    attachShadow hook + role/name deep query engine
    pierce-hook.min.js, pierce-query.min.js             the one-line copy-paste hook and query string
    cdpPierce.ts                                        hook-free CDP alternative
  prompt/
    locator-cot-system-prompt.md                        the CoT system prompt
    locator-output.schema.json                          strict schema of the answer
    examples/                                           captured input, user message, reference, pasted-answer slot
  scripts/
    serve.ts                                            static server (no-store)
    snapshot-component.ts                               captures a live load with declarative shadow roots
    validate-locators.ts                                schema + semantic validator, --self-test
  tests/
    shadow-pierce.spec.ts                               engine and compact string over 5 reloads, oracles, README check
    cdp-pierce.spec.ts                                  CDP route over 5 reloads
    semantic-locators.spec.ts                           prompt integrity, validator self-test, strategy execution
    framework/                                          evidence, pierce helpers, strategy resolver
  reporters/evidence-summary.ts                         end-of-run Q3 EVIDENCE SUMMARY
```
