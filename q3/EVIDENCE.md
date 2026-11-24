# Q3 · Evidence from real runs

Everything below is copied from the logs of one session. Nothing was edited except this prose. The logs were:

- a **fresh clone** of the GitHub repository at `28f5df4 Q3: summary counts skipped tests separately and prints the skip reason`;
- the documented commands: `npm install && npx playwright install chromium && npm test`;
- `npm run validate` on the reference and on the placeholder;
- 5 more `npx playwright test` runs in the same clone.

Environment: Windows 11, Node.js v22.13.1, Playwright 1.65.1 (Chromium), one worker.

`PORT=5322 CI=1` was set for these runs because a copy of the demo was already running on the default
port 5318. `CI=1` makes Playwright start its own fresh server instead of reusing one. Without them, the
same commands run on 5318.

Tag names, ids and classes in these logs are random per load. Re-running gives different values, but the
same verdicts.

---

## 1. Validator self-test (first step of `npm test`)

```
validate-locators self-test: each known-bad strategy must be rejected with the expected code
  PASS  hand-written reference as-is                 expect VALID                        got VALID
  PASS  class selector as a name                     expect FORBIDDEN_CSS                got FORBIDDEN_CSS, VOLATILE_TOKEN, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  id selector as an anchor                     expect FORBIDDEN_CSS                got FORBIDDEN_CSS, VOLATILE_TOKEN, NAME_NOT_IN_INPUT
  PASS  attribute selector                           expect FORBIDDEN_CSS                got FORBIDDEN_CSS, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  shadow-piercing CSS combinator               expect FORBIDDEN_CSS                got FORBIDDEN_CSS, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  absolute XPath in a tier 3 step              expect FORBIDDEN_XPATH              got FORBIDDEN_CSS, FORBIDDEN_XPATH, NAME_NOT_IN_INPUT
  PASS  relative XPath with text()                   expect FORBIDDEN_XPATH              got FORBIDDEN_XPATH, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  raw class string                             expect FORBIDDEN_CLASS_OR_ID        got FORBIDDEN_CLASS_OR_ID, VOLATILE_TOKEN, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  data-testid                                  expect FORBIDDEN_DATA_OR_STYLE      got FORBIDDEN_DATA_OR_STYLE, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  inline style                                 expect FORBIDDEN_DATA_OR_STYLE      got FORBIDDEN_DATA_OR_STYLE, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  random id from the input as a name           expect VOLATILE_TOKEN               got VOLATILE_TOKEN, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  custom-element tag from the input in a path  expect VOLATILE_TOKEN               got VOLATILE_TOKEN, NAME_NOT_IN_INPUT
  PASS  tier 3 starts below a landmark               expect TIER3_NOT_LANDMARK           got TIER3_NOT_LANDMARK
  PASS  tier 3 ends at another element               expect TIER3_END_MISMATCH           got TIER3_END_MISMATCH
  PASS  tier 2 lands on another role                 expect TIER2_ROLE_MISMATCH          got TIER2_ROLE_MISMATCH
  PASS  tier 2 relation absent from input            expect TIER2_RELATION_NOT_IN_INPUT  got TIER2_RELATION_NOT_IN_INPUT
  PASS  invented accessible name                     expect NAME_NOT_IN_INPUT            got NAME_NOT_IN_INPUT
  PASS  unknown role                                 expect SCHEMA                       got SCHEMA
  PASS  extra "css" property                         expect SCHEMA                       got SCHEMA
  PASS  self-check reports false                     expect SCHEMA                       got SCHEMA
  PASS  reasoning step missing                       expect SCHEMA                       got SCHEMA
  PASS  duplicate target key                         expect DUPLICATE_KEY                got DUPLICATE_KEY
  PASS  scope missing from the parse tree            expect SCOPE_NOT_IN_PARSE_TREE      got SCOPE_NOT_IN_PARSE_TREE
  self-test: 23/23 cases behaved as expected
```

## 2. Test log (`Running 9 tests using 1 worker`)

```
  [cdp] load 1: <mf-xt4gt-vmlze> open > <mf-gvpqb-npbk0> closed; button backendNodeId=103 -> "Transfer of 40.40 to Savings 4821 scheduled."
  [cdp] load 2: <mf-6ab4x-fni4s> open > <mf-oxgcb-rxpcy> closed; button backendNodeId=211 -> "Transfer of 80.80 to Holiday fund 1093 scheduled."
  [cdp] load 3: <mf-8v65w-6gh12> open > <mf-drlnb-r9d8s> closed; button backendNodeId=322 -> "Transfer of 121.20 to Savings 4821 scheduled."
  [cdp] load 4: <mf-dozpi-ho9ta> open > <mf-35ex5-t6d76> closed; button backendNodeId=435 -> "Transfer of 161.60 to Holiday fund 1093 scheduled."
  [cdp] load 5: <mf-md4ht-0de59> open > <mf-qep7c-q6wez> closed; button backendNodeId=544 -> "Transfer of 202.00 to Savings 4821 scheduled."
  ✓  1 [chromium] › tests\cdp-pierce.spec.ts:7:3 › Q3 - CDP alternative (no script injected into the page) › DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root on 5 reloads (1.1s)
  ✓  2 [chromium] › tests\semantic-locators.spec.ts:29:3 › Q3 - ARIA-only locator strategies from the CoT prompt › the system prompt embeds the schema verbatim and its few-shot answer passes the validator (9ms)
  ✓  3 [chromium] › tests\semantic-locators.spec.ts:54:3 › Q3 - ARIA-only locator strategies from the CoT prompt › the validator rejects every known-bad strategy (self-test) (18ms)
  [hand-written] prompt/examples/reference-output.handwritten.json: VALID, 6 targets, 0 warning(s)
  [hand-written] securityTab        [open-shadow] t1 playwright getByRole | t2 shadow-pierce aria-controls | t3 playwright chained getByRole
  [hand-written] profilePanel       [open-shadow] t1 playwright getByRole | t2 shadow-pierce aria-controls | t3 playwright chained getByRole
  [hand-written] amountField        [closed-shadow] t1 shadow-pierce role+name | t2 unavailable | t3 shadow-pierce a11y path
  [hand-written] destinationAccount [closed-shadow] t1 shadow-pierce role+name | t2 unavailable | t3 shadow-pierce a11y path
  [hand-written] confirmTransfer    [closed-shadow] t1 shadow-pierce role+name | t2 shadow-pierce aria-controls | t3 shadow-pierce a11y path
  [hand-written] transferStatus     [closed-shadow] t1 shadow-pierce role+name | t2 shadow-pierce aria-controls | t3 shadow-pierce a11y path
  ✓  4 [chromium] › tests\semantic-locators.spec.ts:72:5 › Q3 - ARIA-only locator strategies from the CoT prompt › hand-written reference strategy: valid, and all tiers resolve to one same element on 5 reloads (1.4s)
  -  5 [chromium] › tests\semantic-locators.spec.ts:72:5 › Q3 - ARIA-only locator strategies from the CoT prompt › pasted LLM answer: valid, and all tiers resolve to one same element on 5 reloads
  [deep-query] load 1: <mf-i04ri-d3p2f> (open) > <mf-fzu2d-gesgg> (closed)  aria-controls=itohh5zhuzq  -> "Transfer of 125.25 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-i04ri-d3p2f/#shadow-root(open)/section[2]/div/mf-fzu2d-gesgg/#shadow-root(closed)/form/div[3]/button
  [deep-query] load 2: <mf-9qaiq-z4tsa> (open) > <mf-hpqs3-0n106> (closed)  aria-controls=ejmmypms4gf  -> "Transfer of 250.50 to Savings 4821 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-9qaiq-z4tsa/#shadow-root(open)/section[2]/div/mf-hpqs3-0n106/#shadow-root(closed)/form/div[3]/button
  [deep-query] load 3: <mf-uq8c5-65ogd> (open) > <mf-eaqfq-gqvv7> (closed)  aria-controls=pjn2p4jxfb7  -> "Transfer of 375.75 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-uq8c5-65ogd/#shadow-root(open)/section[2]/mf-eaqfq-gqvv7/#shadow-root(closed)/form/div[3]/button
  [deep-query] load 4: <mf-9o08g-vksmc> (open) > <mf-t466b-x6y58> (closed)  aria-controls=spwd6roapdh  -> "Transfer of 501.00 to Savings 4821 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-9o08g-vksmc/#shadow-root(open)/section[2]/div/mf-t466b-x6y58/#shadow-root(closed)/form/button
  [deep-query] load 5: <mf-ggy3x-6qv4x> (open) > <mf-0gjr8-f3rnh> (closed)  aria-controls=wz8q1sweeif  -> "Transfer of 626.25 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-ggy3x-6qv4x/#shadow-root(open)/section[2]/div/mf-0gjr8-f3rnh/#shadow-root(closed)/form/button
  ✓  6 [chromium] › tests\shadow-pierce.spec.ts:30:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › reaches the closed root nested in the open shell and drives its form on 5 reloads (827ms)
  [agreement] 19 document/open-root elements: deep query and getByRole returned the same node
  [agreement] closed root, deep query : form "New transfer", heading "New transfer", textbox "Amount", combobox "To account", button "Confirm transfer", status ""
  [agreement] closed root, Chrome AX  : form "New transfer", heading "New transfer", textbox "Amount", combobox "To account", button "Confirm transfer", status ""
  ✓  7 [chromium] › tests\shadow-pierce.spec.ts:129:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › agrees with getByRole where Playwright can see, and with Chrome's AX tree inside the closed root (634ms)
  [compact] compact hook + query alone drove the closed-root form on 5/5 loads
  [compact] 11/11 targets: compact query and full engine returned the same node
  ✓  8 [chromium] › tests\shadow-pierce.spec.ts:189:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › the compact copy-paste strings work alone and match the full engine (912ms)
  ✓  9 [chromium] › tests\shadow-pierce.spec.ts:242:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › README carries the exact compact strings (2ms)
```

Read the `[deep-query]` lines as follows:

- On every load, both host tags and the `aria-controls` IDREF are new.
- Each absolute path crosses `#shadow-root(open)` and then `#shadow-root(closed)`. Its shape depends on
  how many wrapper divs `app.js` drew, so some loads share a shape and others do not
  (3 distinct shapes in this run once tag names are masked).
- The accessibility path stays the same: `main > region "Transfer funds" > form "New transfer"`.

## 3. End-of-run summary

```
========================================================================================================
 Q3 EVIDENCE SUMMARY - closed shadow DOM piercing + ARIA-only locator strategies (all values measured in this run)
========================================================================================================
 PASS     DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root on 5 reloads  (1.1 s)
          reloads: 5 | page hook injected: no | boundaries per load: open > closed
          distinct host tags: 10/10 | transfers verified via CDP: 5/5
 PASS     the system prompt embeds the schema verbatim and its few-shot answer passes the validator  (0.0 s)
          schema embedded verbatim: yes | few-shot answer: VALID (0 errors, 0 warnings)
          reasoning steps: 8 | hard rules: 8 | prompt words: 3087
 PASS     the validator rejects every known-bad strategy (self-test)  (0.0 s)
          reference accepted: yes | known-bad strategies rejected: 22/22 | codes covered: 13
 PASS     hand-written reference strategy: valid, and all tiers resolve to one same element on 5 reloads  (1.4 s)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5
 SKIPPED  pasted LLM answer: valid, and all tiers resolve to one same element on 5 reloads  (0.1 s)
          reason: prompt/examples/llm-output.pasted.json is still the placeholder: paste a real model answer into it to run this test
 PASS     reaches the closed root nested in the open shell and drives its form on 5 reloads  (0.8 s)
          reloads: 5 | closed root reached: 5/5 | nesting: document > open > closed
          distinct shell/vault tags: 5/5 | distinct IDREFs: 5 | distinct classes: 5
          distinct absolute XPaths: 5 | distinct shapes (tags masked): 3 | vault.shadowRoot null: 5/5
          refs to closed root on host/window: 0 | getByRole/XPath hits in closed root: 0
          transfers verified via deep query: 5/5 | max deep query ms: 0.10
          a11y path: main > region "Transfer funds" > form "New transfer"
 PASS     agrees with getByRole where Playwright can see, and with Chrome's AX tree inside the closed root  (0.6 s)
          getByRole comparisons (same node): 19/19
          hidden tabpanel content: excluded by both until shown
          closed-root (role, name) vs Chrome AX tree: 6/6 equal
 PASS     the compact copy-paste strings work alone and match the full engine  (0.9 s)
          compact strings: hook 259 chars, query 1018 chars
          closed-root transfers via compact query: 5/5 | same node as full engine: 11/11
 PASS     README carries the exact compact strings  (0.0 s)
          README embeds hook + query verbatim: yes
--------------------------------------------------------------------------------------------------------
 8 passed, 1 skipped, 0 failed (of 9), overall PASSED
========================================================================================================
```

The one skipped test is the slot for a **real** LLM answer, `prompt/examples/llm-output.pasted.json`. It
still holds its placeholder, so the test is skipped with that reason, and none of the numbers above come
from a model run.

## 4. Validator CLI

```
$ npm run validate -- prompt/examples/reference-output.handwritten.json      (exit 0)
validate-locators: prompt\examples\reference-output.handwritten.json
  input   : prompt\examples\input-component.html
  targets : 6 (tier 2 relation: 4, tier 2 unavailable: 2)
  RESULT  : VALID

$ npm run validate -- prompt/examples/llm-output.pasted.json                 (exit 1)
validate-locators: prompt\examples\llm-output.pasted.json
  input   : prompt\examples\input-component.html
  ERROR   : PLACEHOLDER at $: placeholder file: paste a real model answer first
  RESULT  : INVALID (1 error(s))
```

## 5. Repeatability (6 runs, same clone)

| Run | Result | Closed root reached | getByRole/XPath hits in closed root | Engine vs Chrome AX (closed root) | Strategy tier checks | Distinct path shapes, tags masked (of 5) | Max deep query ms |
|---|---|---|---|---|---|---|---|
| npm test (fresh clone) | 8 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 80/80 | 3 | 0.10 |
| npx playwright test #1 | 8 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 80/80 | 3 | 0.10 |
| npx playwright test #2 | 8 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 80/80 | 4 | 0.20 |
| npx playwright test #3 | 8 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 80/80 | 2 | 0.20 |
| npx playwright test #4 | 8 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 80/80 | 3 | 0.20 |
| npx playwright test #5 | 8 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 80/80 | 5 | 0.10 |

- **Constant in every run:** the pass/skip verdicts, 0 hits for `getByRole`/XPath inside the closed root,
  the AX-tree agreement and all 80 tier checks.
- **Varies, as designed:** the number of distinct structural shapes once tag names are masked. It
  depends on how many wrapper divs `app.js` drew on each load, so it differs from run to run.
- **Timing resolution:** query time is measured with `performance.now()`, which is coarsened to 0.1 ms
  in a page that is not cross-origin isolated.

## 6. What this evidence does not show

- **No real model answer has been run through the prompt yet.** The reference strategy was written by
  hand while building the validator and resolver (see the README, *Interpretations* 6). To close this
  gap, follow *Running the prompt on a real model* in the README. The skipped test then runs on that
  answer.
