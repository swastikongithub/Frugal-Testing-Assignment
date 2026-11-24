# Q3 · Evidence from real runs

Everything below is copied from the logs of one session. Nothing was edited except this prose. The logs were:

- a **fresh clone** of the GitHub repository at `bb8ae82 Q3: singular 'error' in the rejected-answer evidence line`;
- the documented commands: `npm install && npx playwright install chromium && npm test`;
- `npm run validate` on the reference, on one recorded model answer and on the placeholder;
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
  PASS  class selector as a name                     expect FORBIDDEN_CSS                got FORBIDDEN_CSS, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  id selector as an anchor                     expect FORBIDDEN_CSS                got FORBIDDEN_CSS, NAME_NOT_IN_INPUT
  PASS  attribute selector                           expect FORBIDDEN_CSS                got FORBIDDEN_CSS, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  shadow-piercing CSS combinator               expect FORBIDDEN_CSS                got FORBIDDEN_CSS, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  absolute XPath in a tier 3 step              expect FORBIDDEN_XPATH              got FORBIDDEN_CSS, FORBIDDEN_XPATH, NAME_NOT_IN_INPUT
  PASS  relative XPath with text()                   expect FORBIDDEN_XPATH              got FORBIDDEN_XPATH, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  raw class string                             expect FORBIDDEN_CLASS_OR_ID        got FORBIDDEN_CLASS_OR_ID, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  data-testid                                  expect FORBIDDEN_DATA_OR_STYLE      got FORBIDDEN_DATA_OR_STYLE, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  inline style                                 expect FORBIDDEN_DATA_OR_STYLE      got FORBIDDEN_DATA_OR_STYLE, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  random id from the input as a name           expect VOLATILE_TOKEN               got VOLATILE_TOKEN, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  custom-element tag from the input in a path  expect VOLATILE_TOKEN               got VOLATILE_TOKEN, NAME_NOT_IN_INPUT
  PASS  data-test-id value from the input as a name  expect VOLATILE_TOKEN               got VOLATILE_TOKEN, TIER3_END_MISMATCH, NAME_NOT_IN_INPUT
  PASS  tier 3 starts below a landmark               expect TIER3_NOT_LANDMARK           got TIER3_NOT_LANDMARK
  PASS  tier 3 ends at another element               expect TIER3_END_MISMATCH           got TIER3_END_MISMATCH
  PASS  tier 2 lands on another role                 expect TIER2_ROLE_MISMATCH          got TIER2_ROLE_MISMATCH
  PASS  tier 2 relation absent from input            expect TIER2_RELATION_NOT_IN_INPUT  got TIER2_RELATION_NOT_IN_INPUT
  PASS  invented accessible name                     expect NAME_NOT_IN_INPUT            got NAME_NOT_IN_INPUT
  PASS  unknown role                                 expect SCHEMA                       got SCHEMA
  PASS  extra "css" property                         expect SCHEMA                       got SCHEMA
  PASS  self-check reports false                     expect SCHEMA                       got SCHEMA
  PASS  analysis step missing                        expect SCHEMA                       got SCHEMA
  PASS  duplicate target key                         expect DUPLICATE_KEY                got DUPLICATE_KEY
  PASS  scope missing from the parse tree            expect SCOPE_NOT_IN_PARSE_TREE      got SCOPE_NOT_IN_PARSE_TREE
  self-test: 24/24 cases behaved as expected
```

## 2. Test log (`Running 19 tests using 1 worker`)

For each of the nine model answers, only the first line is kept here. Its six per-target lines name
the same engines as the reference's. Its verdicts are in sections 3 and 4.

```
  [cdp] load 1: <mf-s0zil-nppnr> open > <mf-g2a7p-8c6sx> closed > iframe; button backendNodeId=114 -> "Transfer of 40.40 to Savings 4821 scheduled."
  [cdp] load 2: <mf-a2usp-vedgm> open > <mf-2rg7m-ogv0x> closed > iframe; button backendNodeId=237 -> "Transfer of 80.80 to Holiday fund 1093 scheduled."
  [cdp] load 3: <mf-rxl3r-aostm> open > <mf-bfvtk-u72wk> closed > iframe; button backendNodeId=365 -> "Transfer of 121.20 to Savings 4821 scheduled."
  [cdp] load 4: <mf-yq037-zh2rh> open > <mf-nkuyu-wsl5l> closed > iframe; button backendNodeId=490 -> "Transfer of 161.60 to Holiday fund 1093 scheduled."
  [cdp] load 5: <mf-mdizh-lzx7l> open > <mf-dbt33-erya8> closed > iframe; button backendNodeId=609 -> "Transfer of 202.00 to Savings 4821 scheduled."
  ✓   1 [chromium] › tests\cdp-pierce.spec.ts:7:3 › Q3 - CDP alternative (no script injected into the page) › DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root and its nested iframe on 5 reloads (1.9s)
  [frame-route] load 1: frame tree -> iframe -> frameElement.getRootNode() = closed root of <mf-gf2q3-dnwbk> -> "Transfer of 33.30 to Savings 4821 scheduled."
  [frame-route] load 2: frame tree -> iframe -> frameElement.getRootNode() = closed root of <mf-p0646-yrlv4> -> "Transfer of 66.60 to Savings 4821 scheduled."
  [frame-route] load 3: frame tree -> iframe -> frameElement.getRootNode() = closed root of <mf-r29ed-mvo5i> -> "Transfer of 99.90 to Savings 4821 scheduled."
  [frame-route] load 4: frame tree -> iframe -> frameElement.getRootNode() = closed root of <mf-k8jnc-m3wzg> -> "Transfer of 133.20 to Savings 4821 scheduled."
  [frame-route] load 5: frame tree -> iframe -> frameElement.getRootNode() = closed root of <mf-hblav-fg18e> -> "Transfer of 166.50 to Savings 4821 scheduled."
  ✓   2 [chromium] › tests\frame-route.spec.ts:27:3 › Q3 - the nested iframe as a hook-free way into the closed root › Playwright's frame tree + frameElement.getRootNode() reach the closed root and drive the transfer on 5 reloads (3.3s)
  ✓   3 [chromium] › tests\semantic-locators.spec.ts:102:3 › Q3 - ARIA-only locator strategies from the CoT prompt › the system prompt embeds the schema verbatim and its few-shot answer passes the validator (50ms)
  ✓   4 [chromium] › tests\semantic-locators.spec.ts:127:3 › Q3 - ARIA-only locator strategies from the CoT prompt › the validator rejects every known-bad strategy (self-test) (108ms)
  [claude-haiku-5-5 #1] rejected: SCHEMA at /analysis/relationshipMap/7/to/name: must NOT have fewer than 1 characters {"limit":1}
  [claude-haiku-5-5 #1] rejected: SCHEMA at /targets/4/tier3/path: must NOT have fewer than 2 items {"limit":2}
  [claude-haiku-5-5 #1] rejected: SCHEMA at /targets/5/tier3/path: must NOT have fewer than 2 items {"limit":2}
  [claude-haiku-5-5 #1] rejected: SCHEMA at /selfCheck/everyTier3StartsAtLandmark: must be equal to constant {"allowedValue":true}
  ✓   5 [chromium] › tests\semantic-locators.spec.ts:142:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-haiku-5-5 run-1 (real model answer): rejected by the validator, for the reasons recorded with it (16ms)
  [claude-opus-5-5 #2] rejected: SCHEMA at /analysis/volatilityScan/volatileTokensSeen/37: must NOT have more than 80 characters {"limit":80}
  ✓   6 [chromium] › tests\semantic-locators.spec.ts:142:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-opus-5-5 run-2 (real model answer): rejected by the validator, for the reasons recorded with it (44ms)
  [hand-written] prompt/examples/reference-output.handwritten.json: VALID, 6 targets, 0 warning(s)
  [hand-written] securityTab        [open-shadow] t1 playwright getByRole | t2 shadow-pierce aria-controls | t3 playwright chained getByRole
  [hand-written] profilePanel       [open-shadow] t1 playwright getByRole | t2 shadow-pierce aria-controls | t3 playwright chained getByRole
  [hand-written] amountField        [closed-shadow] t1 shadow-pierce role+name | t2 unavailable | t3 shadow-pierce a11y path
  [hand-written] destinationAccount [closed-shadow] t1 shadow-pierce role+name | t2 unavailable | t3 shadow-pierce a11y path
  [hand-written] confirmTransfer    [iframe] t1 shadow-pierce role+name | t2 shadow-pierce aria-controls | t3 shadow-pierce a11y path
  [hand-written] transferStatus     [iframe] t1 shadow-pierce role+name | t2 shadow-pierce aria-controls | t3 shadow-pierce a11y path
  ✓   7 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › hand-written reference strategy: valid, and all tiers resolve to one same element on 5 reloads (8.6s)
  [claude-haiku-5-5 #2] prompt/runs/claude-haiku-5-5/run-2/answer.txt: VALID, 6 targets, 0 warning(s)
  [claude-haiku-5-5 #2] replay failed: load 1, amountField: tier 3 (shadow-pierce a11y path) matches one element
  ✓   8 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-haiku-5-5 run-2 (real model answer): valid, but fails on the live page where it failed when first replayed (1.3s)
  [claude-haiku-5-5 #3] prompt/runs/claude-haiku-5-5/run-3/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓   9 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-haiku-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (8.5s)
  [claude-opus-5-5 #1] prompt/runs/claude-opus-5-5/run-1/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  10 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-opus-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (8.7s)
  [claude-opus-5-5 #3] prompt/runs/claude-opus-5-5/run-3/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  11 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-opus-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (8.5s)
  [claude-sonnet-5-5 #1] prompt/runs/claude-sonnet-5-5/run-1/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  12 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-sonnet-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (8.4s)
  [claude-sonnet-5-5 #2] prompt/runs/claude-sonnet-5-5/run-2/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  13 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-sonnet-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (8.5s)
  [claude-sonnet-5-5 #3] prompt/runs/claude-sonnet-5-5/run-3/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  14 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-sonnet-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (8.4s)
  -  15 [chromium] › tests\semantic-locators.spec.ts:174:5 › Q3 - ARIA-only locator strategies from the CoT prompt › pasted LLM answer: valid, and all tiers resolve to one same element on 5 reloads
  [deep-query] load 1: <mf-y63il-fvs3l> (open) > <mf-vjcnl-w1pit> (closed) > iframe  data-test-id=dyn-uuid-1248  aria-controls=imyjajo687b  -> "Transfer of 125.25 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-y63il-fvs3l/#shadow-root(open)/section[2]/div/mf-vjcnl-w1pit/#shadow-root(closed)/form/iframe/#document/html/body/div/div/div/button
  [deep-query] load 2: <mf-7gk9f-wzwy8> (open) > <mf-y6zik-ctrhv> (closed) > iframe  data-test-id=dyn-uuid-2262  aria-controls=w2j2jpadyzp  -> "Transfer of 250.50 to Savings 4821 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-7gk9f-wzwy8/#shadow-root(open)/section[2]/mf-y6zik-ctrhv/#shadow-root(closed)/form/div[3]/div/iframe/#document/html/body/div/div/button
  [deep-query] load 3: <mf-zk9w4-folq1> (open) > <mf-5jy22-riy77> (closed) > iframe  data-test-id=dyn-uuid-3228  aria-controls=jsxavvp5s9b  -> "Transfer of 375.75 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-zk9w4-folq1/#shadow-root(open)/section[2]/div/mf-5jy22-riy77/#shadow-root(closed)/form/div[3]/iframe/#document/html/body/div/div/div/div/div/button
  [deep-query] load 4: <mf-pc1v2-9dljn> (open) > <mf-j5fnc-1533y> (closed) > iframe  data-test-id=dyn-uuid-3321  aria-controls=rpc4a8vq0l5  -> "Transfer of 501.00 to Savings 4821 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-pc1v2-9dljn/#shadow-root(open)/section[2]/div/mf-j5fnc-1533y/#shadow-root(closed)/form/div[3]/div/iframe/#document/html/body/div/div/div/button
  [deep-query] load 5: <mf-ab5l8-3a4s1> (open) > <mf-fqfby-ala7w> (closed) > iframe  data-test-id=dyn-uuid-5986  aria-controls=wfo8w4j3cul  -> "Transfer of 626.25 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-ab5l8-3a4s1/#shadow-root(open)/section[2]/div/div/mf-fqfby-ala7w/#shadow-root(closed)/form/div[3]/div/iframe/#document/html/body/div/div/div/div/button
  ✓  16 [chromium] › tests\shadow-pierce.spec.ts:33:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › reaches the iframe in the closed root nested in the open shell and drives the transfer on 5 reloads (4.4s)
  [agreement] 19 document/open-root elements: deep query and getByRole returned the same node
  [agreement] closed root + iframe, deep query : form "New transfer", heading "New transfer", textbox "Amount", combobox "To account", button "Confirm Transaction", status ""
  [agreement] closed root + iframe, Chrome AX  : form "New transfer", heading "New transfer", textbox "Amount", combobox "To account", button "Confirm Transaction", status ""
  ✓  17 [chromium] › tests\shadow-pierce.spec.ts:146:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › agrees with getByRole where Playwright can see, and with Chrome's AX tree inside the closed root (2.9s)
  [compact] compact hook + query alone drove the closed root and its iframe on 5/5 loads
  [compact] 11/11 targets: compact query and full engine returned the same node
  ✓  18 [chromium] › tests\shadow-pierce.spec.ts:207:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › the compact copy-paste strings work alone and match the full engine (4.8s)
  ✓  19 [chromium] › tests\shadow-pierce.spec.ts:262:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › README carries the exact compact strings (20ms)
```

Read the `[deep-query]` lines as follows:

- On every load, both host tags, the button's `data-test-id` and the `aria-controls` IDREF are new.
- Each absolute path crosses `#shadow-root(open)`, then `#shadow-root(closed)`, then the iframe's
  `#document`: the structure of the brief's snippet. Its shape depends on
  how many wrapper divs `app.js` drew, so some loads share a shape and others do not
  (5 distinct shapes in this run once tag names are masked).
- The accessibility path stays the same: `main > region "Transfer funds" > form "New transfer"`.

## 3. Real model answers

The prompt (v3) was run on Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5, three times each, on 2026-11-24,
with `npm run prompt:run` and Claude Code CLI 2.1.331. Below is the command recorded for the first row
of the table; the other runs differ only in `--model`:

```
claude -p --model haiku --system-prompt-file prompt/locator-cot-system-prompt.md --tools "" --strict-mcp-config --no-session-persistence --output-format json < prompt/examples/user-message.txt
```

- **Where the columns come from.** Provenance comes from each run's committed `meta.json`. Outcomes
  and checks come from the summary of the `npm test` run above.
- **What was replayed.** Each answer was generated once, from the captured load in
  `prompt/examples/input-component.html`. Accepted answers are replayed on 5 fresh randomised loads.
- **Cost and stop reason.** Cost is `total_cost_usd` as the CLI reported it. Every run stopped with
  `end_turn`.

| Model served | Run | Started (UTC) | Time | Tokens in / out (thinking) | Cost | Test | Outcome | Tier checks | Scope claims | Transfers via tier 3 | Locators vs hand-written reference |
|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | run-1 | 09:07:46 | 11.3 s | 12766 / 3415 (0) | $0.0043 | PASS | rejected by the validator (4 errors: SCHEMA), as recorded | — | — | — | — |
| claude-haiku-5-5 | run-2 | 09:07:59 | 12.1 s | 12766 / 3401 (0) | $0.0019 | PASS | accepted, but on the live page it fails the check "load 1, amountField: tier 3 (shadow-pierce a11y path) matches one element", as first observed | — | — | — | — |
| claude-haiku-5-5 | run-3 | 09:08:12 | 55.3 s | 12767 / 14797 (10406) | $0.0076 | PASS | accepted and works (VALID (0 warnings)) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-opus-5-5 | run-1 | 09:07:47 | 83.6 s | 12742 / 10416 (6197) | $0.3102 | PASS | accepted and works (VALID (0 warnings)) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-opus-5-5 | run-2 | 09:09:11 | 91.8 s | 12741 / 10188 (5980) | $0.2094 | PASS | rejected by the validator (1 error: SCHEMA), as recorded | — | — | — | — |
| claude-opus-5-5 | run-3 | 09:10:44 | 74.0 s | 12742 / 9173 (5129) | $0.1891 | PASS | accepted and works (VALID (0 warnings)) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-sonnet-5-5 | run-1 | 09:07:46 | 35.6 s | 12744 / 6313 (2388) | $0.1141 | PASS | accepted and works (VALID (0 warnings)) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-sonnet-5-5 | run-2 | 09:08:23 | 36.5 s | 12745 / 6432 (2642) | $0.0672 | PASS | accepted and works (VALID (0 warnings)) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-sonnet-5-5 | run-3 | 09:09:01 | 33.2 s | 12744 / 6071 (2301) | $0.0635 | PASS | accepted and works (VALID (0 warnings)) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |

`inputs unchanged since run` for these nine answers: `yes (prompt, user message, component)`.

- **Six answers work, and all six are identical to the hand-written reference,** including the path
  through the iframe boundary, `main > region "Transfer funds" > form "New transfer" > button "Confirm Transaction"`.
- **The other three are caught.** Haiku run-1 and Opus run-2 are rejected by the validator; their
  test checks that the rejection and its error codes are unchanged. Haiku run-2 is accepted by the
  validator but fails on the live page (a wrong role, `spinbutton`, for the amount field). Its test
  checks that it still fails at the same check.
- **Thinking.** Both failing Haiku runs used 0 thinking tokens. The Haiku run that worked used 10 406.

The earlier prompt versions are not in this table:

- **v1:** Sonnet and Opus refused it as `reasoning_extraction`. Haiku gave 2/3 valid answers.
  ([`prompt/history/v1/`](prompt/history/v1/README.md))
- **v2:** 9/9 valid on the component before the iframe. ([`prompt/history/v2/`](prompt/history/v2/README.md))

## 4. End-of-run summary

```
========================================================================================================
 Q3 EVIDENCE SUMMARY - closed shadow DOM piercing + ARIA-only locator strategies (all values measured in this run)
========================================================================================================
 PASS     DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root and its nested iframe on 5 reloads  (1.9 s)
          reloads: 5 | page hook injected: no | boundaries per load: open > closed > iframe
          AX queries per load: one per document (top + iframe) | distinct host tags: 10/10
          transfers verified via CDP: 5/5
 PASS     Playwright's frame tree + frameElement.getRootNode() reach the closed root and drive the transfer on 5 reloads  (3.3 s)
          reloads: 5 | hook or deep query injected: no
          window.frames lists the iframe: no (window.length 0)
          iframe found via Playwright frame tree (by role): 5/5
          closed root via frameElement.getRootNode(): 5/5 | transfers driven this way: 5/5
 PASS     the system prompt embeds the schema verbatim and its few-shot answer passes the validator  (0.1 s)
          schema embedded verbatim: yes | few-shot answer: VALID (0 errors, 0 warnings)
          method steps: 8 | hard rules: 8 | prompt words: 3275
 PASS     the validator rejects every known-bad strategy (self-test)  (0.1 s)
          reference accepted: yes | known-bad strategies rejected: 23/23 | codes covered: 13
 PASS     claude-haiku-5-5 run-1 (real model answer): rejected by the validator, for the reasons recorded with it  (0.0 s)
          model served: claude-haiku-5-5 | answer: 3415 tokens out (0 thinking), 11 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: INVALID (4 errors: SCHEMA), as recorded
          replayed on the live page: no (rejected answers are not executed)
 PASS     claude-opus-5-5 run-2 (real model answer): rejected by the validator, for the reasons recorded with it  (0.0 s)
          model served: claude-opus-5-5 | answer: 10188 tokens out (5980 thinking), 92 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: INVALID (1 error: SCHEMA), as recorded
          replayed on the live page: no (rejected answers are not executed)
 PASS     hand-written reference strategy: valid, and all tiers resolve to one same element on 5 reloads  (8.6 s)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5
 PASS     claude-haiku-5-5 run-2 (real model answer): valid, but fails on the live page where it failed when first replayed  (1.3 s)
          model served: claude-haiku-5-5 | answer: 3401 tokens out (0 thinking), 12 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings)
          replay on the live page: FAILS, as first observed: load 1, amountField: tier 3 (shadow-pierce a11y path) matches one element
          why: The answer gives the amount input the role spinbutton, from inputmode="decimal". An input without a type attribute is a textbox whatever its inputmode, so nothing on the page matches spinbutton "Amount". The validator cannot see this (spinbutton is a valid role and "Amount" is in the input); running the strategy does.
 PASS     claude-haiku-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (8.5 s)
          model served: claude-haiku-5-5 | answer: 14797 tokens out (10406 thinking), 55 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-opus-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (8.7 s)
          model served: claude-opus-5-5 | answer: 10416 tokens out (6197 thinking), 84 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-opus-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (8.5 s)
          model served: claude-opus-5-5 | answer: 9173 tokens out (5129 thinking), 74 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-sonnet-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (8.4 s)
          model served: claude-sonnet-5-5 | answer: 6313 tokens out (2388 thinking), 36 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-sonnet-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (8.5 s)
          model served: claude-sonnet-5-5 | answer: 6432 tokens out (2642 thinking), 37 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-sonnet-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (8.4 s)
          model served: claude-sonnet-5-5 | answer: 6071 tokens out (2301 thinking), 33 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow, iframe
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for targets behind the closed root: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 SKIPPED  pasted LLM answer: valid, and all tiers resolve to one same element on 5 reloads  (0.4 s)
          reason: prompt/examples/llm-output.pasted.json is still the placeholder: paste a real model answer into it to run this test
 PASS     reaches the iframe in the closed root nested in the open shell and drives the transfer on 5 reloads  (4.4 s)
          reloads: 5 | closed root reached: 5/5 | nesting: document > open > closed > iframe
          distinct shell/vault tags: 5/5 | distinct IDREFs: 5 | distinct classes: 5
          distinct test ids: 5 | distinct iframe src: 5 | window.frames lists the iframe: no (0 frames)
          distinct absolute XPaths: 5 | distinct shapes (tags masked): 5 | vault.shadowRoot null: 5/5
          refs to closed root on host/window: 0 | getByRole/XPath hits in closed root: 0
          transfers verified via deep query: 5/5 | max deep query ms: 0.70
          a11y path: main > region "Transfer funds" > form "New transfer"
 PASS     agrees with getByRole where Playwright can see, and with Chrome's AX tree inside the closed root  (2.9 s)
          getByRole comparisons (same node): 19/19
          hidden tabpanel content: excluded by both until shown
          closed-root (role, name) vs Chrome AX tree: 6/6 equal
 PASS     the compact copy-paste strings work alone and match the full engine  (4.8 s)
          compact strings: hook 259 chars, query 1089 chars
          closed-root transfers via compact query: 5/5 | same node as full engine: 11/11
 PASS     README carries the exact compact strings  (0.0 s)
          README embeds hook + query verbatim: yes
--------------------------------------------------------------------------------------------------------
 18 passed, 1 skipped, 0 failed (of 19), overall PASSED
========================================================================================================
```

The one skipped test is the slot for an answer from any other model,
`prompt/examples/llm-output.pasted.json`. It still holds its placeholder, so the test is skipped with that
reason.

## 5. Validator CLI

```
$ npm run validate -- prompt/examples/reference-output.handwritten.json      (exit 0)
validate-locators: prompt\examples\reference-output.handwritten.json
  input   : prompt\examples\input-component.html
  targets : 6 (tier 2 relation: 4, tier 2 unavailable: 2)
  RESULT  : VALID

$ npm run validate -- prompt/runs/claude-sonnet-5-5/run-1/answer.txt         (exit 0)
validate-locators: prompt\runs\claude-sonnet-5-5\run-1\answer.txt
  input   : prompt\examples\input-component.html
  targets : 6 (tier 2 relation: 4, tier 2 unavailable: 2)
  RESULT  : VALID

$ npm run validate -- prompt/examples/llm-output.pasted.json                 (exit 1)
validate-locators: prompt\examples\llm-output.pasted.json
  input   : prompt\examples\input-component.html
  ERROR   : PLACEHOLDER at $: placeholder file: paste a real model answer first
  RESULT  : INVALID (1 error(s))
```

## 6. Repeatability (6 runs, same clone)

| Run | Result | Closed root + iframe reached (deep query) | Closed root via the iframe, no hook | getByRole/XPath hits in closed root | Engine vs Chrome AX (closed root + iframe) | Model answers | Strategies at full tier checks | Distinct path shapes, tags masked (of 5) | Max deep query ms |
|---|---|---|---|---|---|---|---|---|---|
| npm test (fresh clone) | 18 passed, 1 skipped, 0 failed | 5/5 | 5/5 | 0 | 6/6 | 6/6 work, 3/3 caught as recorded | 7/7 | 5 | 0.70 |
| npx playwright test #1 | 18 passed, 1 skipped, 0 failed | 5/5 | 5/5 | 0 | 6/6 | 6/6 work, 3/3 caught as recorded | 7/7 | 5 | 0.30 |
| npx playwright test #2 | 18 passed, 1 skipped, 0 failed | 5/5 | 5/5 | 0 | 6/6 | 6/6 work, 3/3 caught as recorded | 7/7 | 5 | 0.20 |
| npx playwright test #3 | 18 passed, 1 skipped, 0 failed | 5/5 | 5/5 | 0 | 6/6 | 6/6 work, 3/3 caught as recorded | 7/7 | 5 | 0.50 |
| npx playwright test #4 | 18 passed, 1 skipped, 0 failed | 5/5 | 5/5 | 0 | 6/6 | 6/6 work, 3/3 caught as recorded | 7/7 | 5 | 0.60 |
| npx playwright test #5 | 18 passed, 1 skipped, 0 failed | 5/5 | 5/5 | 0 | 6/6 | 6/6 work, 3/3 caught as recorded | 7/7 | 5 | 0.50 |

- **Constant in every run:**
  - the pass/skip verdicts;
  - 0 hits for `getByRole`/XPath inside the closed root;
  - the AX-tree agreement;
  - every replayed strategy (the reference and the six working model answers) at full tier checks on
    5 new loads;
  - the three failing model answers caught as recorded.
- **Varies, as designed:** the number of distinct structural shapes once tag names are masked. It
  depends on how many wrapper divs `app.js` drew on each load.
- **Timing resolution:** query time is measured with `performance.now()`, which is coarsened to 0.1 ms
  in a page that is not cross-origin isolated.

## 7. What this evidence does not show

- **Only Claude models.** No other vendor's model was run. The `llm-output.pasted.json` slot and its test
  are there for that. Fable 5.2 was not run, because on this plan it needs usage credits.
- **Through the Claude Code CLI, not a bare API call.** The CLI adds a preamble of about 780 tokens. No
  tools, MCP servers or project files were available to the model (see the command above).
- **Three runs per model, on one captured load.** That is enough to see what works and how the rest
  fails, not to put a number on failure rates.
- **`verdictWhenRecorded` was added after the runs.** These nine runs were recorded just before the runner
  learnt to write that field. It was added afterwards, by the same code against the same inputs, and it
  matches what the runner printed for each run.
- **One demo, written alongside the prompt.** The prompt's few-shot example is a different component,
  and the models never saw the reference. But the demo, the prompt and the validator come from the
  same author, so this is not a test on an independent production site.
- **Same-origin iframe only.** The engine walks same-origin frames. A cross-origin iframe is out of reach
  of page JS by design, and was not tested.
