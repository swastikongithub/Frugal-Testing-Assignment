# Q3 · Dynamic Micro-Frontend Shadow DOM Piercing & Semantic Prompt Architecture

A local **micro-frontend** whose tag names, ids, classes and nesting depth change on every load, with
an **unlinked closed shadow root nested inside an open shadow host**. Two deliverables work against it:

| | What it is |
|---|---|
| **Shadow DOM piercing** | The demo has the structure of the brief's snippet: an open shell, a closed root inside it, and a **nested iframe inside the closed root** holding the "Confirm Transaction" button. A raw vanilla JS deep query walks the document, every open root, the closed root and the iframe's document, and matches elements by **ARIA role + accessible name**. It comes as a readable engine ([`src/shadow-pierce.js`](src/shadow-pierce.js)) and as a **one-line copy-paste query string** ([`src/pierce-query.min.js`](src/pierce-query.min.js)) with its one-line hook. A hook-free **CDP alternative** ([`src/cdpPierce.ts`](src/cdpPierce.ts)) uses `DOM.getDocument({pierce: true})` and `Accessibility.queryAXTree`. A fourth route shows that **the nested iframe is itself a way into the closed root**, with no hook at all. All four drive the transfer on 5 reloads. |
| **CoT prompt architecture** | A Chain-of-Thought system prompt ([`prompt/locator-cot-system-prompt.md`](prompt/locator-cot-system-prompt.md)) that makes an LLM parse a raw HTML component tree and return a **three-tier, ARIA-only locator strategy**: role mapping → ARIA relationship (`aria-controls`, …) → accessibility sub-tree path. CSS, XPath, class strings, ids and `data-*` are explicitly forbidden. The answer is a strict JSON document. A validator checks it, and a resolver executes every tier on 5 fresh loads. **Run on real models, three times each on Haiku, Sonnet and Opus 5.5: 6 of 9 answers work on 5 fresh loads, all six identical to the hand-written reference. The other 3 are caught, 2 by the validator and 1 only by executing it** ([results](#real-model-answers)). |

---

## Run it

Needs Node.js 20+. The test run starts the demo server itself, on 127.0.0.1:5318. Set `PORT=<n>` to
use another port, and `CI=1` to make it start a fresh server even when one is already running.

```bash
npm install
npx playwright install chromium
npm test
```

| Command | What it does |
|---|---|
| `npm test` | Validator self-test (23 known-bad strategies) → `tsc --noEmit` → 19 Playwright tests (9 of them are the recorded model answers). Ends with the **Q3 EVIDENCE SUMMARY**. |
| `npm run serve` | The demo on http://127.0.0.1:5318. Reload it and watch the tags, ids and classes change in DevTools. If it is already running, `npm test` reuses it. |
| `npm run snapshot` | Captures a fresh load into `prompt/examples/input-component.html` and `prompt/examples/user-message.txt`, the iframe's document included. |
| `npm run validate -- <answer.json>` | Validates one LLM answer against the schema and the hard rules (the input defaults to `prompt/examples/input-component.html`). |
| `npm run prompt:run -- --model <m> [--runs <n>]` | Runs the prompt on a real model through the Claude Code CLI and records the answer and its provenance under `prompt/runs/` (see [*Real model answers*](#real-model-answers)). |
| `npm run report` | Opens the HTML report (trace, screenshot and video of every test). |

---

## The demo micro-frontend

[`site/app.js`](site/app.js) mounts two custom elements, and the vault's closed root loads
[`site/confirm-frame.html`](site/confirm-frame.html) in an iframe. On every load, both documents regenerate:

- the custom-element tag names (`mf-<5>-<5>`),
- every id, and so every IDREF (`for`, `aria-controls`, `aria-labelledby`, `aria-describedby`),
- every class (`css-<5>` and `cta-<5>`, like CSS-in-JS output),
- the confirm button's `data-test-id` (`dyn-uuid-<n>`, as in the brief) and the iframe's `src` query,
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
                     └─ form "New transfer"   textbox "Amount", combobox "To account"
                        └─ iframe "Transaction confirmation"   same origin, its own document
                           └─ #document       button "Confirm Transaction" (aria-controls → status,
                                              aria-describedby → note), status (aria-live)
```

This is the structure of the brief's snippet, with the same kind of volatile names:

| Brief's snippet | Demo |
|---|---|
| `<shell-container id="viewport-root">` + `#shadow-root (open)` | `<mf-?????-?????>` shell host + open root |
| `<micro-frontend-wrapper class="sub-module-x9">` + `#shadow-root (closed)` | `<mf-?????-?????>` vault host + closed root |
| `<nested-iframe src="...">` | `<iframe title="Transaction confirmation" src="/confirm-frame.html?session=?????">` |
| `<button class="cta-execute" data-test-id="dyn-uuid-9921">Confirm Transaction</button>` | `<button class="cta-?????" data-test-id="dyn-uuid-????">Confirm Transaction</button>` |

The vault calls `this.attachShadow({ mode: 'closed' })` and keeps the result only in the closures of
`connectedCallback`. So `host.shadowRoot` is `null`, and nothing on the host, on `window`, in a slot or
in an event references the root. The test checks this on every load: own and inherited host properties,
and every `window` property.

The button sits in the iframe together with its note and status, because an IDREF only resolves inside
its own document. The amount and account stay in the closed root. A click asks the vault for the result
over `postMessage`, and the vault answers with the status text.

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
- **The iframe is another document.** It has its own `window`, its own `Element.prototype` and its own
  DOM. An init script runs in every frame, so the hook is installed in the iframe too, and the engine
  reads that frame's own root map. Nodes from the iframe fail `instanceof ShadowRoot` in the top
  window, so the engine checks node types instead.
- **`window.frames` hides it.** An iframe inside a shadow tree is not a "document-tree child navigable",
  so in the top window `window.length` is 0 and `window[0]` is undefined. The test checks this.
  Playwright's frame tree still lists the iframe, because that list comes from the browser, not the DOM.
- **…and the iframe is a way in.** Code running in the iframe can call `frameElement.getRootNode()`.
  The iframe element sits in the closed root, so that returns the closed `ShadowRoot` itself:
  "closed" hides `host.shadowRoot`, nothing more. Route 4 below uses this.
- **Handles belong to a frame.** A handle the top window creates for an element of the iframe makes
  Playwright compute from the wrong frame: the bounding box is off by the iframe's offset, and a click
  times out. This was measured while building the change. `inOwnFrame()` in
  [`tests/framework/pierce.ts`](tests/framework/pierce.ts) hands the element to its own frame first.
- **Chrome's AX query stays in one document.** `Accessibility.queryAXTree` on the top document finds
  nothing inside the iframe, so the CDP route queries every document.

### 1. The deep query engine: `src/shadow-pierce.js`

Load it before the page's scripts, then query by role and accessible name:

```ts
await page.addInitScript({ path: 'src/shadow-pierce.js' });
await page.goto('/');
const button = await page.evaluateHandle(() =>
  window.__shadowPierce.query({ role: 'button', name: 'Confirm Transaction' }));
await (await inOwnFrame(button.asElement()!)).click();   // the button is in the iframe
```

- **Hook.** It patches `attachShadow` and stores every root in a `WeakMap` keyed by host. Nothing is
  added to the host, and detached hosts can be garbage-collected.
- **Walk.** It walks the flat tree with `TreeWalker`, entering `host.shadowRoot`, the captured root
  and the `contentDocument` of a same-origin iframe, at any depth. In an iframe it reads that frame's
  own root map. It uses no selectors at all, so it never reads a tag name, id or class.
- **Role.** The explicit `role` first, then the implicit HTML-AAM mapping. This includes the context
  rules: `header`/`footer` are only banner/contentinfo at top level, and `section`/`form` are only a
  region/form when named.
- **Accessible name** (accname 1.2 subset): `aria-labelledby` (same tree scope), `aria-label`,
  `<label>` / `labels`, `alt`, `<legend>`, then content for name-from-content roles, then `title` and
  `placeholder`. Elements that are hidden (`aria-hidden`, `hidden`, `display:none`,
  `visibility:hidden` via `checkVisibility`) are skipped unless `includeHidden` is set.
- **API.** `query`, `queryAll`, `queryPath` (tier 3 paths), `queryRelation` (tier 2 relations),
  `roleOf`, `nameOf`, `scopeOf` (`open` / `closed` / `frame` chain), `landmarksOf`, `absolutePath`
  (evidence only, `#document` marks a frame boundary), `stats`.

The role/name subset is checked against two independent oracles in the run: **Playwright `getByRole`**
(19 document and open-root elements return the same node) and **Chrome's own accessibility tree** over
CDP (every role and name pair behind the closed boundary, in the closed root and its iframe, is equal).

### 2. The copy-paste query string

**Hook**: [`src/pierce-hook.min.js`](src/pierce-hook.min.js). It must run before the component's
scripts:

```js
(()=>{const K=Symbol.for('shadow-pierce.roots');if(window[K])return;const M=new WeakMap(),A=Element.prototype.attachShadow;Object.defineProperty(window,K,{value:M});Element.prototype.attachShadow=function(i){const r=A.call(this,i);M.set(this,r);return r}})();
```

**Query**: [`src/pierce-query.min.js`](src/pierce-query.min.js). It takes `(role, name)` and returns the
first visible match from the document, open roots, hooked closed roots and same-origin iframe documents
(`sr(e)||e.contentDocument`). Pass `name` as `null` to match any name:

```js
(role,name)=>{const K=Symbol.for('shadow-pierce.roots'),sr=e=>{const M=e.ownerDocument.defaultView[K];return e.shadowRoot||(M&&M.get(e))||null},T={A:'link',BUTTON:'button',SELECT:'combobox',TEXTAREA:'textbox',NAV:'navigation',MAIN:'main',FORM:'form',SECTION:'region',UL:'list',LI:'listitem'},I={button:'button',submit:'button',reset:'button',checkbox:'checkbox',radio:'radio'},ro=e=>e.getAttribute('role')||(e.tagName==='INPUT'?I[e.type]||'textbox':/^H[1-6]$/.test(e.tagName)?'heading':T[e.tagName]),n=s=>(s||'').replace(/\s+/g,' ').trim(),nm=e=>{const ids=e.getAttribute('aria-labelledby'),root=e.getRootNode();return n(ids?ids.split(/\s+/).map(i=>(root.getElementById(i)||{}).textContent).join(' '):e.getAttribute('aria-label')||(e.labels&&e.labels.length?[...e.labels].map(l=>l.textContent).join(' '):e.textContent))},q=[document];while(q.length){const s=q.shift(),w=(s.ownerDocument||s).createTreeWalker(s,1);for(let e=w.nextNode();e;e=w.nextNode()){if(ro(e)===role&&(name==null||nm(e)===name)&&e.checkVisibility())return e;const r=sr(e)||e.contentDocument;if(r)q.push(r)}}return null}
```

Usage: `(<query string>)('button', 'Confirm Transaction')`. In Playwright:

```ts
await page.addInitScript({ content: HOOK });
const el = await page.evaluateHandle(`(${QUERY})('textbox', 'Amount')`);
```

- **Tested.** The suite runs a page that has **only** these two strings: no engine and no helpers. On
  5 reloads it fills the amount in the closed root, clicks the button in the iframe and reads the
  status. Then it checks that the string returns the same node as the full engine for 11 targets.
- **Same root map.** Both hooks share the global root map (`Symbol.for('shadow-pierce.roots')`), so
  either may load first. Each frame has its own; the string looks up the one of the element's frame.
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
| Map the boundaries | `DOM.getDocument({depth: -1, pierce: true})` → `shadowRoots[].shadowRootType` and `contentDocument` | `open` (in document) > `closed` (in the open root) > iframe document (in the closed root), 5/5 loads |
| Find by role + name | `Accessibility.queryAXTree({backendNodeId: <document>, role, accessibleName})`, once per document (top + iframe): it does not cross into a frame | `textbox "Amount"`, `combobox "To account"` with chain `open > closed`; `button "Confirm Transaction"` and `status` with `open > closed > frame` |
| Type | `DOM.focus` + real key events | Amount filled |
| Click | `DOM.scrollIntoViewIfNeeded` + `DOM.getContentQuads` (page coordinates, also inside the iframe) + real mouse click | Transfer confirmed |
| Read | `DOM.resolveNode` + `Runtime.callFunctionOn` | Status text verified, 5/5 loads |

The `<select>` is set on its remote object through `Runtime.callFunctionOn`, followed by `input` and
`change` events. Keyboard selection on a collapsed `<select>` differs by platform. CDP is Chromium
only.

### 4. The nested iframe as a hook-free way in (`tests/frame-route.spec.ts`)

The brief's own structure has a weak point: the iframe inside the closed root.

1. Nothing is injected into the page. In the top window, `window.length` is 0.
2. Playwright's frame tree lists the iframe anyway. The test picks the frame that has
   `getByRole('button', { name: 'Confirm Transaction' })`, by role and not by selector.
3. In that frame, `window.frameElement.getRootNode()` returns the closed `ShadowRoot`, while
   `host.shadowRoot` is still `null`.
4. From that root the test finds the Amount field by its label text, fills it, clicks the button
   through the frame's `getByRole`, and reads the status. This works on 5/5 loads.

So a closed root keeps out scripts of the top window, but not scripts of a same-origin frame inside it.
For a real micro-frontend, any script that runs in such a frame (an analytics tag, a third-party
widget) can reach the closed root this way.

---

## Part 2 · The CoT prompt for ARIA-only locators

| File | Role |
|---|---|
| [`prompt/locator-cot-system-prompt.md`](prompt/locator-cot-system-prompt.md) | The system prompt (whole file). |
| [`prompt/locator-output.schema.json`](prompt/locator-output.schema.json) | JSON Schema 2020-12 of the answer. It is embedded verbatim in the prompt, and a test checks that byte-for-byte. |
| [`prompt/examples/user-message.txt`](prompt/examples/user-message.txt) | The user message: 6 targets by **intent** (not by name), plus the captured component. |
| [`prompt/examples/input-component.html`](prompt/examples/input-component.html) | One live load, captured by `npm run snapshot`. Shadow roots are serialised as declarative templates with `Element.getHTML({shadowRoots})`. The closed root is included because the hook captured it. The iframe's document is serialised inside the `<iframe>`, after a `#document` line, as DevTools shows it. |
| [`prompt/examples/reference-output.handwritten.json`](prompt/examples/reference-output.handwritten.json) | **Hand-written** reference answer (written while building this, **not** produced by a model run of the prompt). It is used as the validator's known-good base and to test the resolver. |
| [`prompt/runs/`](prompt/runs) | **Real model answers**, one folder per run: `answer.txt` exactly as the model returned it, and `meta.json` with its provenance. Written by [`scripts/run-prompt.ts`](scripts/run-prompt.ts). |
| [`prompt/history/v1/`](prompt/history/v1/README.md) | The first prompt version's runs, and why it was replaced (Sonnet and Opus refused it). |
| [`prompt/history/v2/`](prompt/history/v2/README.md) | Prompt v2's nine runs on the component before the nested iframe (9/9 valid), and why v3 replaced it. |
| [`prompt/examples/llm-output.pasted.json`](prompt/examples/llm-output.pasted.json) | Slot for an answer from **any other model** (for example a non-Claude one). While it holds the placeholder, its test is skipped and says so. |

### How the prompt forces the behaviour

- **An eight-step method whose results are part of the output and can be checked.** The steps are
  parse-tree → accessibility-model → volatility-scan → target identification → relationship-map →
  landmark-map → compose tiers → self-check. The model thinks privately. The answer's `analysis`
  object records what steps 1, 2, 3 and 5 found (the scopes, the accessibility model, the volatile
  tokens, the resolved IDREF relationships). The targets record steps 4, 6 and 7, and `selfCheck`
  records step 8. The targets have to be derived from those findings, not from the raw HTML. A
  free-text "think step by step" can't be checked, but a parse tree and a relationship map can.
- **Three tiers with exact contracts:**
  - **Tier 1, role mapping:** `{role, name, uniqueOnPage}`.
  - **Tier 2, ARIA relationship:** `{relation, direction, anchor, targetRole}`. `aria-controls` is
    preferred. If no ARIA relation touches the target, it is `{unavailable: <why>}`: a `<label for>`
    is not an ARIA relation, and the prompt forbids inventing one.
  - **Tier 3, accessibility sub-tree path:** it must start at a landmark and end at tier 1. Shadow
    and iframe boundaries don't appear in it: the accessibility tree is flat, and an iframe's document
    joins it where the iframe element sits.
- **Four tree scopes.** `document`, `open-shadow`, `closed-shadow` and `iframe`. The prompt explains the
  `#document` convention and that each shadow root and iframe document is its own id scope, so an
  IDREF never crosses into or out of the iframe.
- **Eight hard rules (R1–R8)** forbid, by name:
  - CSS selectors and fragments, and selector engines (`css=`, `pierce/`);
  - absolute and relative XPath, axes, predicates and `text()`;
  - raw class strings, ids, IDREF values, custom tag names and URLs;
  - `data-*` (including the `data-test-id` the brief shows), `style` and event attributes;
  - positional reasoning;
  - visual properties;
  - non-semantic roles;
  - invented names.

  Ids may be used for one purpose only: to resolve an IDREF to the element it points at. After that,
  the element is described by role + name and the id is dropped.
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
| Strict schema (unknown keys, roles outside the ARIA 1.2 concrete list, a `false` self-check, a missing `analysis` step) | `SCHEMA` |
| `#id` / `.class` / `[attr]` / pseudo-classes / combinators / `css=` / `pierce/` / `querySelector` in a locator field | `FORBIDDEN_CSS` |
| `//`, `/html`, axes, `@attr`, `text()`, `contains()`, `[n]` | `FORBIDDEN_XPATH` |
| `class=`, `id=`, `getElementById`, `className` | `FORBIDDEN_CLASS_OR_ID` |
| `data-*`, `testid`, `style=`, `on*=` | `FORBIDDEN_DATA_OR_STYLE` |
| Any id, IDREF, class, `data-*` value (the `dyn-uuid` test id), iframe `src` or custom tag from the **input HTML**, or any token the model itself listed in `volatileTokensSeen` | `VOLATILE_TOKEN` |
| Tier 3 does not start at a landmark / does not end at tier 1 | `TIER3_NOT_LANDMARK` / `TIER3_END_MISMATCH` |
| Tier 2 lands on another role / uses a relation absent from the input | `TIER2_ROLE_MISMATCH` / `TIER2_RELATION_NOT_IN_INPUT` |
| A name that is not text or a label anywhere in the input (invented) | `NAME_NOT_IN_INPUT` |
| Target scope not in the parse tree, duplicate keys | `SCOPE_NOT_IN_PARSE_TREE` / `DUPLICATE_KEY` |

`--self-test` mutates the reference into 23 known-bad strategies, covering 13 error codes, and each one
must be rejected with its expected code. The reference itself must pass. This runs first in `npm test`,
and again as a Playwright test so it shows in the summary. Answers wrapped in a markdown fence are
accepted with a `FENCED_OUTPUT` warning. Anything else that isn't JSON is `NOT_JSON`.

### Executing a strategy (`tests/framework/resolveStrategy.ts`)

| Scope the answer claims | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| `document` / `open-shadow` | Playwright `getByRole(role, {name, exact})` | deep query `queryRelation` (IDREF in the element's own tree scope) | Playwright chained `getByRole` |
| `closed-shadow` / `iframe` | deep query `queryAll` | deep query `queryRelation` | deep query `queryPath` |

On each of 5 fresh loads, for every target:

- tier 3 must match exactly one element;
- tier 1 (when `uniqueOnPage`) and tier 2 must match that same single element;
- the element's real scope (`document` / `open` / `closed` / `frame`) must equal the scope the answer
  claimed.

After that, the transfer is driven through the tier-3 handles: amount and account filled in the closed
root, the button clicked in the iframe (through `inOwnFrame`), the status read. As a baseline, plain
`getByRole` must find **none** of the targets behind the closed root.

### Real model answers

The current prompt (v3) was run three times each on Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5:

```bash
npm run prompt:run -- --model haiku --runs 3      # also sonnet, opus, or a full model id; --effort is optional
```

[`scripts/run-prompt.ts`](scripts/run-prompt.ts) calls the Claude Code CLI in print mode, from an empty
temporary directory:

```
claude -p --model <m> --system-prompt-file prompt/locator-cot-system-prompt.md --tools "" \
       --strict-mcp-config --no-session-persistence --output-format json   < prompt/examples/user-message.txt
```

- **What the model gets.** The model gets the system prompt and the user message, and nothing else it
  could use: no tools, no MCP servers, no files and no project instructions. The CLI does add a fixed
  preamble of its own, about 780 tokens, which is included in the input counts.
- **What is recorded.** Each run is saved to `prompt/runs/<served model id>/run-<n>/`:
  - `answer.txt`: the model's final text, byte for byte;
  - `meta.json`: the model requested and served, CLI version, exact command, timing, tokens, the
    sha256 of the system prompt, user message, component and answer, and the validator's verdict when
    the run was recorded (`verdictWhenRecorded`).
- **How it is tested.** `npm test` finds every recorded run, and also reports whether the prompt, user
  message and component are still the ones the run was made with:
  - answers the validator accepted are replayed like the reference;
  - answers it rejected are not executed; their test checks they are still rejected, with the same
    error codes;
  - an accepted answer that fails on the live page is listed in
    [`prompt/runs/known-replay-failures.json`](prompt/runs/known-replay-failures.json) with the check it
    failed and why. Its test checks that it still fails there, and fails if the answer starts to work.

Results (2026-11-24, Claude Code CLI 2.1.331, default effort; per-run rows are in
[`EVIDENCE.md`](EVIDENCE.md)):

| Model | Validator | On the live page (5 fresh loads) | Time per run | Output tokens (of which thinking) | Cost per run, as the CLI reports it |
|---|---|---|---|---|---|
| Haiku 5.5 | 2/3 accepted | 1 works (run-3); 1 accepted but fails (run-2) | 11–55 s | 3 401–14 797 (0–10 406) | $0.002–0.008 |
| Sonnet 5.5 | 3/3 accepted | 3 work: 80/80 tier checks, 30/30 scope claims, 5/5 transfers each | 33–37 s | 6 071–6 432 (2 301–2 642) | $0.06–0.11 |
| Opus 5.5 | 2/3 accepted | 2 work | 74–92 s | 9 173–10 416 (5 129–6 197) | $0.19–0.31 |

Fable 5.2 was not run: on this plan it needs usage credits.

What the answers show:

- **All six working answers are identical to the hand-written reference.** For every target they give
  the same scope (`iframe` for the button and the status), the same tier 1 role and name, the same
  tier 2, and the same tier 3 path through the iframe boundary:
  `main > region "Transfer funds" > form "New transfer" > button "Confirm Transaction"`. Each
  model-answer test prints this as `locators vs hand-written reference`. The models never saw the
  reference: the prompt's only example is a different component.
- **The three that fail are caught at two different layers.**
  - **Haiku run-1** stopped its tier 3 paths at the frame boundary: just `button "Confirm Transaction"`
    and `status`. It then reported `selfCheck.everyTier3StartsAtLandmark: false`, which the schema
    forbids. The validator rejected it with 4 `SCHEMA` errors.
  - **Opus run-2** had the right locators. One pattern description in `volatileTokensSeen` was 81
    characters long, in a list whose entries the schema caps at 80, and the cap was in the schema the
    model was given. It was rejected for that one character. The contract was not loosened afterwards.
  - **Haiku run-2** passes the validator, but it gives the amount input the role `spinbutton`, from
    `inputmode="decimal"`. An input with no `type` is a `textbox`, so nothing on the page matches and
    the replay stops on load 1. Only executing the strategy shows this.
- **Thinking made the difference for Haiku.** Every Haiku answer recorded here that failed came from a
  run with 0 thinking tokens: one in v1 and two in v3, about 10–12 s each. Every Haiku run that used
  thinking produced an accepted answer: 5 runs, from v1 to v3. That is too few runs to measure a rate,
  but the pattern is consistent.
- **Nothing is taken on trust.** The validator recomputes all eight self-check claims, and the resolver
  executes every tier on loads the model never saw.

**The prompt's versions.**

| Version | What changed | Recorded result |
|---|---|---|
| v1 | — | Sonnet and Opus refused it as `reasoning_extraction`, because it asked for a written-out chain of thought. Haiku: 2/3 valid. ([`prompt/history/v1/`](prompt/history/v1/README.md)) |
| v2 | Only the framing: the model thinks privately, and `analysis` (renamed from `reasoning`) holds each step's checkable findings. A finding can be checked against the input; a transcript can't. Made once, not tuned against the classifier. | 9/9 valid on the component before the iframe. ([`prompt/history/v2/`](prompt/history/v2/README.md)) |
| v3 | The demo gained the brief's nested iframe, so the prompt gained the `iframe` scope, the `#document` convention, and frame boundaries that are transparent in tier 3. | The results above. |

### Running the prompt on any other model

1. Use the whole of `prompt/locator-cot-system-prompt.md` as the **system** prompt, and the whole of
   `prompt/examples/user-message.txt` as the **user** message.
2. Paste the model's raw answer into `prompt/examples/llm-output.pasted.json`, replacing the placeholder.
3. Run `npm run validate -- prompt/examples/llm-output.pasted.json`, then `npm test`. The *pasted LLM
   answer* test now runs instead of being skipped. If the model broke a rule, the validator names the
   rule and the field.

`npm run snapshot` gives the model a fresh, never-seen load. It rewrites the component and the user
message, so the recorded runs then report `inputs unchanged since run: NO`. Their answers are still
replayed against live loads. The reference's own token list produces `UNSEEN_VOLATILE_TOKEN`
warnings, which are expected because the tokens changed.

---

## Spec → implementation traceability

| PDF requirement | Implementation | Evidence in the run |
|---|---|---|
| Micro-frontend whose node segment names change on every DOM refresh | [`site/app.js`](site/app.js): random tags, ids/IDREFs, classes, wrapper depth per load | 5/5 distinct shell tags, vault tags, IDREFs, classes and absolute paths over 5 reloads |
| Closed shadow root **nested inside a secondary open shadow host** | Vault (closed) inside the shell's open root | `scopeOf` chain `frame` < `closed` < `open`, every load; CDP boundaries `open > closed > frame` |
| The brief's snippet: a **nested iframe** in the closed root, button "Confirm Transaction" with a `cta-*` class and a `dyn-uuid` test id | [`site/confirm-frame.html`](site/confirm-frame.html) + [`confirm-frame.js`](site/confirm-frame.js), loaded by the vault | Engine, compact string and CDP each click the button inside the iframe, 5/5 loads; `window.frames` lists 0 frames |
| **Unlinked** closed root | Root kept only in closures | `vault.shadowRoot === null` 5/5; 0 host or `window` properties reference it |
| **Raw vanilla JS query string** that **dynamically traverses** it | [`src/pierce-query.min.js`](src/pierce-query.min.js) + [`src/pierce-hook.min.js`](src/pierce-hook.min.js) (one line each), full engine [`src/shadow-pierce.js`](src/shadow-pierce.js) | Compact strings alone drive the closed form 5/5. Same node as the engine 11/11. Engine drives it 5/5 |
| (extra) Hook-free alternative | [`src/cdpPierce.ts`](src/cdpPierce.ts) | 5/5 transfers with no script injected |
| (extra) The nested iframe as a way into the closed root | [`tests/frame-route.spec.ts`](tests/frame-route.spec.ts): Playwright frame tree + `frameElement.getRootNode()` | Closed root reached 5/5 with no hook; 5/5 transfers |
| **CoT system prompt** that makes an LLM **parse raw HTML component trees** | [`prompt/locator-cot-system-prompt.md`](prompt/locator-cot-system-prompt.md): eight steps, whose findings (parse tree, accessibility model, volatility scan, relationship map) go into `analysis` | Prompt test: 8 steps, schema embedded verbatim, few-shot answer valid. Real runs on Haiku, Sonnet and Opus 5.5: 7/9 accepted, 6/9 work on the live page ([`prompt/runs/`](prompt/runs)) |
| **Multi-tiered strategy** from **role mappings, aria-controls relationships, accessibility sub-trees** | Tier 1 / tier 2 / tier 3 contracts in the prompt and [schema](prompt/locator-output.schema.json) | The reference and the 6 working model answers: every tier resolves to the same single element, 5/5 loads, 80/80 tier checks each |
| **Explicitly forbidding** CSS attributes, absolute structural XPaths, raw class strings | Rules R1–R4 (+ R5–R8) in the prompt; [`scripts/validate-locators.ts`](scripts/validate-locators.ts) enforces them | Self-test: 23/23 known-bad strategies rejected with the right code |
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
- **A structured method instead of a free-text chain of thought.** Each step's finding is a schema
  field, so it can be read, diffed and validated. The prompt asks for findings, not for the model's
  thinking. Asking for a transcript of the thinking got v1 refused by Sonnet and Opus, and a transcript
  can't be checked anyway. The self-check values are fixed to `true` in the schema, so the model has to
  fix its strategy instead of reporting a failure, and the validator recomputes them anyway.
- **Record real runs with their provenance.** Pasting an answer by hand leaves no proof of where it came
  from. `prompt:run` saves the exact text with hashes of every input, so each recorded answer can be
  traced to the prompt version it was made from.
- **Tier 2 may be `unavailable`.** Forcing a relationship for every target would push the model to
  invent `aria-controls` links. Two of the six reference targets have none, and say why.
- **No `prefixItems` in the schema.** JSON Schema can only enforce "landmark first" with an open tuple,
  which strict Ajv flags and several structured-output APIs don't support. The validator checks it
  instead, as `TIER3_NOT_LANDMARK`.
- **Targets are given by intent, not by name.** The user message says "the button that submits the
  transfer", not "Confirm Transaction", so the model has to compute the accessible name itself. Invented
  names are caught as `NAME_NOT_IN_INPUT`.
- **Act on an element through its own frame.** The deep query runs in the top window and returns
  elements of the iframe too. Comparing nodes works from there, but Playwright actions need the
  element's own frame, so `inOwnFrame()` hands it over through that frame's `window`. It doesn't use a
  selector, and the iframe's `window` is never exposed to the top page.
- **Strategies are executed, not just validated.** A strategy can be schema-valid and still wrong, so
  the resolver runs it on five loads the model never saw. Haiku run-2 is a real case: a valid answer
  with the wrong role for one field, which only the replay catches.
- **Failed model answers stay in the suite.** Hiding them would overstate the prompt, and leaving the
  suite red would bury the real result. A rejected answer is checked to stay rejected for the same
  reasons, and a known replay failure is checked to keep failing at the same check. Either test fails
  if the answer's outcome changes.

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
   is `null`, and no property, global, slot or event exposes it. The test verifies this. The nested
   iframe does not change that on the component's side, but the platform gives code inside the iframe
   a path back to the root (`frameElement.getRootNode()`, route 4).
4. **"Non-visual semantic ARIA models"**: roles (explicit and implicit), accessible names, ARIA relationship
   attributes as relationship *types*, and landmark paths. Visible text is used only where accname takes
   it from content (for example a button's label) or as the text of a relationship anchor.
5. **"Forces an LLM"**: a prompt alone can't force anything, so it is backed by a strict schema, a
   validator and an executor that reject non-compliant answers.
6. **The snippet's `<nested-iframe src="...">`**: read as a real same-origin `<iframe>`, since it has a
   `src`, rather than as a custom element of that name. This is the harder reading: a shadow-only walker
   stops at the frame boundary. The engine handles same-origin frames. A cross-origin iframe is out of
   reach of page JS by design, and out of scope here.
7. **Model output.** The reference strategy was written by hand while building this, and its file name
   says so. The model answers in `prompt/runs/` are real: each is the CLI's result text, unedited, and
   its `meta.json` records the model that served it. The nine current runs were recorded by the runner
   just before it learnt to write `verdictWhenRecorded`, so that field was added to their `meta.json`
   afterwards by the same code (`verdictOf(validateFile(...))`) against the same inputs. It matches what
   the runner printed for each run. They were produced through the Claude Code CLI
   because no API key was available. The CLI's own ~780-token preamble is the one difference from a
   bare API call. Any other model can be tested through `llm-output.pasted.json`.

---

## Evidence from a real run

Output of `npm install && npx playwright install chromium && npm test` is in [`EVIDENCE.md`](EVIDENCE.md).

---

## Video checklist (output → source → AI prompt history)

1. **Output**
   - Run `npm test`. Point out:
     - the validator self-test table (23 rejected, reference accepted);
     - the per-load deep-query lines: new tags, IDREFs and `dyn-uuid` test ids on every load, the
       absolute paths through `#shadow-root(closed)` and `iframe/#document`, the transfer status;
     - the CDP lines (`open > closed > iframe`) and the `[frame-route]` lines (the closed root reached
       through the iframe, with no hook);
     - the **Q3 EVIDENCE SUMMARY**: `vault.shadowRoot null: 5/5`, `getByRole/XPath hits in closed root: 0`,
       `closed-root (role, name) vs Chrome AX tree`, `tier checks`;
     - the nine *real model answer* tests: six replayed at 80/80 and identical to the reference, two
       rejected for their recorded reasons, and Haiku run-2 failing on the live page where it failed before.
   - Run `npm run serve`, open http://127.0.0.1:5318 in DevTools, reload twice, and show the tag names
     changing, `#shadow-root (closed)` and the iframe's `#document` inside it, with the button's
     `data-test-id` changing too. In the console, `$0.shadowRoot` on the vault host is `null`, and
     `window.length` is 0.
   - Run `npm run validate -- prompt/examples/reference-output.handwritten.json`.
2. **Source walkthrough**, in this order:
   - `site/app.js` (randomisation, the closed root kept in a closure) → `site/confirm-frame.js` (the nested iframe)
   - `src/shadow-pierce.js` → `src/pierce-hook.min.js` + `src/pierce-query.min.js` → `src/cdpPierce.ts`
   - `prompt/locator-cot-system-prompt.md` → `prompt/locator-output.schema.json` → `scripts/validate-locators.ts`
   - `tests/framework/pierce.ts` (`inOwnFrame`) → `tests/framework/resolveStrategy.ts` → `tests/*.spec.ts`
3. **AI prompt history**
   - Show the prompts used to build this.
   - Show a live run of the CoT prompt: `npm run prompt:run -- --model sonnet` (about 35 s). The new
     `prompt/runs/.../answer.txt` and `meta.json` appear, and `npm test` picks the run up as one more
     test.
   - Show `prompt/history/v1/README.md` (v1 refused as `reasoning_extraction`, v2 asks for findings
     instead) and `prompt/history/v2/README.md` (why v3 added the iframe scope).

## Layout

```
q3/
  package.json, tsconfig.json, playwright.config.ts
  site/            index.html, page.css, app.js        the randomised micro-frontend (open shell > closed vault)
                   random.js                           random tags, ids, classes and test ids for both documents
                   confirm-frame.html/.js, frame.css   the iframe nested in the closed root (Confirm Transaction)
  src/
    shadow-pierce.js                                    attachShadow hook + role/name deep query engine
    pierce-hook.min.js, pierce-query.min.js             the one-line copy-paste hook and query string
    cdpPierce.ts                                        hook-free CDP alternative
  prompt/
    locator-cot-system-prompt.md                        the CoT system prompt
    locator-output.schema.json                          strict schema of the answer
    examples/                                           captured input, user message, reference, pasted-answer slot
    runs/<model>/run-<n>/                               real model answers (answer.txt) + provenance (meta.json)
    runs/known-replay-failures.json                     accepted answers that fail on the live page, and why
    history/v1/                                         prompt v1 runs and refusals, and why v2 replaced it
    history/v2/                                         prompt v2 runs on the component before the iframe
  scripts/
    serve.ts                                            static server (no-store)
    snapshot-component.ts                               captures a live load: declarative shadow roots, iframe #document
    validate-locators.ts                                schema + semantic validator, --self-test
    run-prompt.ts                                       runs the prompt on a real model via the Claude Code CLI
  tests/
    shadow-pierce.spec.ts                               engine and compact string over 5 reloads, oracles, README check
    cdp-pierce.spec.ts                                  CDP route over 5 reloads
    frame-route.spec.ts                                 the nested iframe as a hook-free way into the closed root
    semantic-locators.spec.ts                           prompt integrity, validator self-test, strategy execution
    framework/                                          evidence, pierce helpers, strategy resolver
  reporters/evidence-summary.ts                         end-of-run Q3 EVIDENCE SUMMARY
```
