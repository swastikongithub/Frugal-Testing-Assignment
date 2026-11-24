# Q3 · Evidence from real runs

Everything below is copied from the logs of one session. Nothing was edited except this prose. The logs were:

- a **fresh clone** of the GitHub repository at `719bcbb Q3 README: name the metric that shows the model answers converge on the reference`;
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
  PASS  analysis step missing                        expect SCHEMA                       got SCHEMA
  PASS  duplicate target key                         expect DUPLICATE_KEY                got DUPLICATE_KEY
  PASS  scope missing from the parse tree            expect SCOPE_NOT_IN_PARSE_TREE      got SCOPE_NOT_IN_PARSE_TREE
  self-test: 23/23 cases behaved as expected
```

## 2. Test log (`Running 18 tests using 1 worker`)

For each of the nine model answers, only the first line is kept here. Its six per-target lines name
the same engines as the reference's. Its verdicts are in sections 3 and 4.

```
  [cdp] load 1: <mf-ijko0-pz68b> open > <mf-sks3m-4r5lj> closed; button backendNodeId=101 -> "Transfer of 40.40 to Savings 4821 scheduled."
  [cdp] load 2: <mf-s1qm4-o98qu> open > <mf-h0ri4-vbyt3> closed; button backendNodeId=211 -> "Transfer of 80.80 to Holiday fund 1093 scheduled."
  [cdp] load 3: <mf-3mb37-czs3w> open > <mf-siet3-7dp8e> closed; button backendNodeId=319 -> "Transfer of 121.20 to Savings 4821 scheduled."
  [cdp] load 4: <mf-btn6s-5dnpa> open > <mf-0ztf7-xqtb0> closed; button backendNodeId=433 -> "Transfer of 161.60 to Holiday fund 1093 scheduled."
  [cdp] load 5: <mf-2geb5-u0fx2> open > <mf-kloof-22aw7> closed; button backendNodeId=542 -> "Transfer of 202.00 to Savings 4821 scheduled."
  ✓   1 [chromium] › tests\cdp-pierce.spec.ts:7:3 › Q3 - CDP alternative (no script injected into the page) › DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root on 5 reloads (1.6s)
  ✓   2 [chromium] › tests\semantic-locators.spec.ts:74:3 › Q3 - ARIA-only locator strategies from the CoT prompt › the system prompt embeds the schema verbatim and its few-shot answer passes the validator (12ms)
  ✓   3 [chromium] › tests\semantic-locators.spec.ts:99:3 › Q3 - ARIA-only locator strategies from the CoT prompt › the validator rejects every known-bad strategy (self-test) (22ms)
  [hand-written] prompt/examples/reference-output.handwritten.json: VALID, 6 targets, 0 warning(s)
  [hand-written] securityTab        [open-shadow] t1 playwright getByRole | t2 shadow-pierce aria-controls | t3 playwright chained getByRole
  [hand-written] profilePanel       [open-shadow] t1 playwright getByRole | t2 shadow-pierce aria-controls | t3 playwright chained getByRole
  [hand-written] amountField        [closed-shadow] t1 shadow-pierce role+name | t2 unavailable | t3 shadow-pierce a11y path
  [hand-written] destinationAccount [closed-shadow] t1 shadow-pierce role+name | t2 unavailable | t3 shadow-pierce a11y path
  [hand-written] confirmTransfer    [closed-shadow] t1 shadow-pierce role+name | t2 shadow-pierce aria-controls | t3 shadow-pierce a11y path
  [hand-written] transferStatus     [closed-shadow] t1 shadow-pierce role+name | t2 shadow-pierce aria-controls | t3 shadow-pierce a11y path
  ✓   4 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › hand-written reference strategy: valid, and all tiers resolve to one same element on 5 reloads (3.5s)
  [claude-haiku-5-5 #1] prompt/runs/claude-haiku-5-5/run-1/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓   5 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-haiku-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.6s)
  [claude-haiku-5-5 #2] prompt/runs/claude-haiku-5-5/run-2/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓   6 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-haiku-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.2s)
  [claude-haiku-5-5 #3] prompt/runs/claude-haiku-5-5/run-3/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓   7 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-haiku-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.2s)
  [claude-opus-5-5 #1] prompt/runs/claude-opus-5-5/run-1/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓   8 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-opus-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.5s)
  [claude-opus-5-5 #2] prompt/runs/claude-opus-5-5/run-2/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓   9 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-opus-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.3s)
  [claude-opus-5-5 #3] prompt/runs/claude-opus-5-5/run-3/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  10 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-opus-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.5s)
  [claude-sonnet-5-5 #1] prompt/runs/claude-sonnet-5-5/run-1/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  11 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-sonnet-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.3s)
  [claude-sonnet-5-5 #2] prompt/runs/claude-sonnet-5-5/run-2/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  12 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-sonnet-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.4s)
  [claude-sonnet-5-5 #3] prompt/runs/claude-sonnet-5-5/run-3/answer.txt: VALID, 6 targets, 0 warning(s)
  ✓  13 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › claude-sonnet-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads (3.6s)
  -  14 [chromium] › tests\semantic-locators.spec.ts:120:5 › Q3 - ARIA-only locator strategies from the CoT prompt › pasted LLM answer: valid, and all tiers resolve to one same element on 5 reloads
  [deep-query] load 1: <mf-alcci-pjqfu> (open) > <mf-fuycg-bt4vv> (closed)  aria-controls=nzc5e34d20f  -> "Transfer of 125.25 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-alcci-pjqfu/#shadow-root(open)/section[2]/div/mf-fuycg-bt4vv/#shadow-root(closed)/form/button
  [deep-query] load 2: <mf-bnjm9-mite5> (open) > <mf-eh32t-a8952> (closed)  aria-controls=xnh6gmnox15  -> "Transfer of 250.50 to Savings 4821 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-bnjm9-mite5/#shadow-root(open)/section[2]/mf-eh32t-a8952/#shadow-root(closed)/form/div[3]/button
  [deep-query] load 3: <mf-tgdjr-o13g7> (open) > <mf-nub9n-3n65i> (closed)  aria-controls=vkcgbun9ga9  -> "Transfer of 375.75 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-tgdjr-o13g7/#shadow-root(open)/section[2]/div/div/mf-nub9n-3n65i/#shadow-root(closed)/form/div[3]/button
  [deep-query] load 4: <mf-isuvl-f7bor> (open) > <mf-o2tpn-m2jp5> (closed)  aria-controls=jhhrzb0ica4  -> "Transfer of 501.00 to Savings 4821 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-isuvl-f7bor/#shadow-root(open)/section[2]/mf-o2tpn-m2jp5/#shadow-root(closed)/form/div[3]/div/button
  [deep-query] load 5: <mf-tvilp-dos4g> (open) > <mf-73tc1-thz6e> (closed)  aria-controls=veayuuz9l5d  -> "Transfer of 626.25 to Holiday fund 1093 scheduled."
  [deep-query]         absolute path: /html/body/main/mf-tvilp-dos4g/#shadow-root(open)/section[2]/div/mf-73tc1-thz6e/#shadow-root(closed)/form/button
  ✓  15 [chromium] › tests\shadow-pierce.spec.ts:30:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › reaches the closed root nested in the open shell and drives its form on 5 reloads (1.5s)
  [agreement] 19 document/open-root elements: deep query and getByRole returned the same node
  [agreement] closed root, deep query : form "New transfer", heading "New transfer", textbox "Amount", combobox "To account", button "Confirm transfer", status ""
  [agreement] closed root, Chrome AX  : form "New transfer", heading "New transfer", textbox "Amount", combobox "To account", button "Confirm transfer", status ""
  ✓  16 [chromium] › tests\shadow-pierce.spec.ts:129:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › agrees with getByRole where Playwright can see, and with Chrome's AX tree inside the closed root (1.3s)
  [compact] compact hook + query alone drove the closed-root form on 5/5 loads
  [compact] 11/11 targets: compact query and full engine returned the same node
  ✓  17 [chromium] › tests\shadow-pierce.spec.ts:189:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › the compact copy-paste strings work alone and match the full engine (2.1s)
  ✓  18 [chromium] › tests\shadow-pierce.spec.ts:242:3 › Q3 - vanilla JS deep query through an unlinked closed shadow root › README carries the exact compact strings (5ms)
```

Read the `[deep-query]` lines as follows:

- On every load, both host tags and the `aria-controls` IDREF are new.
- Each absolute path crosses `#shadow-root(open)` and then `#shadow-root(closed)`. Its shape depends on
  how many wrapper divs `app.js` drew, so some loads share a shape and others do not
  (4 distinct shapes in this run once tag names are masked).
- The accessibility path stays the same: `main > region "Transfer funds" > form "New transfer"`.

## 3. Real model answers

The prompt was run on Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5, three times each, on 2026-11-24,
with `npm run prompt:run` and Claude Code CLI 2.1.331. Below is the command recorded for the first row
of the table; the other runs differ only in `--model`:

```
claude -p --model haiku --system-prompt-file prompt/locator-cot-system-prompt.md --tools "" --strict-mcp-config --no-session-persistence --output-format json < prompt/examples/user-message.txt
```

- **Where the columns come from.** Provenance comes from each run's committed `meta.json`. The
  verdicts come from the summary of the `npm test` run above.
- **What was replayed.** Each answer was generated once, from the captured load in
  `prompt/examples/input-component.html`. It is replayed here on 5 fresh randomised loads.
- **Cost and stop reason.** Cost is `total_cost_usd` as the CLI reported it. Every run stopped with
  `end_turn`.

| Model served | Run | Started (UTC) | Time | Tokens in / out (thinking) | Cost | Test | Tier checks | Scope claims | Transfers via tier 3 | Locators vs hand-written reference |
|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | run-1 | 08:25:24 | 49.3 s | 12270 / 13475 (8939) | $0.0092 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 0/6 targets identical (differs in tier 3, on every target) |
| claude-haiku-5-5 | run-2 | 08:26:15 | 41.6 s | 12270 / 11410 (7721) | $0.0059 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-haiku-5-5 | run-3 | 08:26:57 | 53.1 s | 12270 / 14180 (9825) | $0.0073 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-opus-5-5 | run-1 | 08:25:24 | 79.3 s | 12246 / 10117 (6154) | $0.3003 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-opus-5-5 | run-2 | 08:26:45 | 70.5 s | 12243 / 9151 (5066) | $0.1885 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-opus-5-5 | run-3 | 08:27:56 | 79.4 s | 12246 / 10330 (6063) | $0.2122 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-sonnet-5-5 | run-1 | 08:25:24 | 32.6 s | 12249 / 6114 (2155) | $0.1101 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-sonnet-5-5 | run-2 | 08:25:58 | 38.6 s | 12249 / 6848 (3026) | $0.0713 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |
| claude-sonnet-5-5 | run-3 | 08:26:38 | 35.0 s | 12249 / 6567 (2747) | $0.0685 | PASS, VALID (0 warnings) | 80/80 | 30/30 | 5/5 | 6/6 targets identical |

`inputs unchanged since run` for these nine answers: `yes (prompt, user message, component)`.

Haiku run-1 is the one answer that differs from the reference. Its tier 3 paths start at the named
`region` landmark instead of `main`. They are still landmark-first and resolve on every load.

The first prompt version (v1) is not in this table. Sonnet and Opus refused it as
`reasoning_extraction`, and Haiku gave 2 valid answers out of 3. That record is in
[`prompt/history/v1/`](prompt/history/v1/README.md).

## 4. End-of-run summary

```
========================================================================================================
 Q3 EVIDENCE SUMMARY - closed shadow DOM piercing + ARIA-only locator strategies (all values measured in this run)
========================================================================================================
 PASS     DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root on 5 reloads  (1.6 s)
          reloads: 5 | page hook injected: no | boundaries per load: open > closed
          distinct host tags: 10/10 | transfers verified via CDP: 5/5
 PASS     the system prompt embeds the schema verbatim and its few-shot answer passes the validator  (0.0 s)
          schema embedded verbatim: yes | few-shot answer: VALID (0 errors, 0 warnings)
          method steps: 8 | hard rules: 8 | prompt words: 3132
 PASS     the validator rejects every known-bad strategy (self-test)  (0.0 s)
          reference accepted: yes | known-bad strategies rejected: 22/22 | codes covered: 13
 PASS     hand-written reference strategy: valid, and all tiers resolve to one same element on 5 reloads  (3.5 s)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5
 PASS     claude-haiku-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.6 s)
          model served: claude-haiku-5-5 | answer: 13475 tokens out (8939 thinking), 49 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5
          locators vs hand-written reference: 0/6 targets identical (differs in tier 3, on every target)
 PASS     claude-haiku-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.2 s)
          model served: claude-haiku-5-5 | answer: 11410 tokens out (7721 thinking), 42 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-haiku-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.2 s)
          model served: claude-haiku-5-5 | answer: 14180 tokens out (9825 thinking), 53 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-opus-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.5 s)
          model served: claude-opus-5-5 | answer: 10117 tokens out (6154 thinking), 79 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-opus-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.3 s)
          model served: claude-opus-5-5 | answer: 9151 tokens out (5066 thinking), 70 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-opus-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.5 s)
          model served: claude-opus-5-5 | answer: 10330 tokens out (6063 thinking), 79 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-sonnet-5-5 run-1 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.3 s)
          model served: claude-sonnet-5-5 | answer: 6114 tokens out (2155 thinking), 33 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-sonnet-5-5 run-2 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.4 s)
          model served: claude-sonnet-5-5 | answer: 6848 tokens out (3026 thinking), 39 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 PASS     claude-sonnet-5-5 run-3 (real model answer): valid, and all tiers resolve to one same element on 5 reloads  (3.6 s)
          model served: claude-sonnet-5-5 | answer: 6567 tokens out (2747 thinking), 35 s
          inputs unchanged since run: yes (prompt, user message, component)
          validator: VALID (0 warnings) | targets: 6 | scopes: open-shadow, closed-shadow
          tier 2 relations: 4 | reloads: 5 | tier checks (same single element): 80/80
          scope claims matching the page: 30/30 | getByRole hits for closed-shadow targets: 0
          transfer driven via tier 3: 5/5 | locators vs hand-written reference: 6/6 targets identical
 SKIPPED  pasted LLM answer: valid, and all tiers resolve to one same element on 5 reloads  (0.2 s)
          reason: prompt/examples/llm-output.pasted.json is still the placeholder: paste a real model answer into it to run this test
 PASS     reaches the closed root nested in the open shell and drives its form on 5 reloads  (1.5 s)
          reloads: 5 | closed root reached: 5/5 | nesting: document > open > closed
          distinct shell/vault tags: 5/5 | distinct IDREFs: 5 | distinct classes: 5
          distinct absolute XPaths: 5 | distinct shapes (tags masked): 4 | vault.shadowRoot null: 5/5
          refs to closed root on host/window: 0 | getByRole/XPath hits in closed root: 0
          transfers verified via deep query: 5/5 | max deep query ms: 0.20
          a11y path: main > region "Transfer funds" > form "New transfer"
 PASS     agrees with getByRole where Playwright can see, and with Chrome's AX tree inside the closed root  (1.3 s)
          getByRole comparisons (same node): 19/19
          hidden tabpanel content: excluded by both until shown
          closed-root (role, name) vs Chrome AX tree: 6/6 equal
 PASS     the compact copy-paste strings work alone and match the full engine  (2.1 s)
          compact strings: hook 259 chars, query 1018 chars
          closed-root transfers via compact query: 5/5 | same node as full engine: 11/11
 PASS     README carries the exact compact strings  (0.0 s)
          README embeds hook + query verbatim: yes
--------------------------------------------------------------------------------------------------------
 17 passed, 1 skipped, 0 failed (of 18), overall PASSED
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

| Run | Result | Closed root reached | getByRole/XPath hits in closed root | Engine vs Chrome AX (closed root) | Model answers passing | Strategies at full tier checks | Distinct path shapes, tags masked (of 5) | Max deep query ms |
|---|---|---|---|---|---|---|---|---|
| npm test (fresh clone) | 17 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 9/9 | 10/10 | 4 | 0.20 |
| npx playwright test #1 | 17 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 9/9 | 10/10 | 3 | 0.20 |
| npx playwright test #2 | 17 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 9/9 | 10/10 | 4 | 0.30 |
| npx playwright test #3 | 17 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 9/9 | 10/10 | 5 | 0.20 |
| npx playwright test #4 | 17 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 9/9 | 10/10 | 4 | 0.20 |
| npx playwright test #5 | 17 passed, 1 skipped, 0 failed | 5/5 | 0 | 6/6 | 9/9 | 10/10 | 4 | 0.20 |

- **Constant in every run:**
  - the pass/skip verdicts;
  - 0 hits for `getByRole`/XPath inside the closed root;
  - the AX-tree agreement;
  - every strategy (the reference and the nine model answers) at full tier checks on 5 new loads.
- **Varies, as designed:** the number of distinct structural shapes once tag names are masked. It
  depends on how many wrapper divs `app.js` drew on each load.
- **Timing resolution:** query time is measured with `performance.now()`, which is coarsened to 0.1 ms
  in a page that is not cross-origin isolated.

## 7. What this evidence does not show

- **Only Claude models.** No other vendor's model was run. The `llm-output.pasted.json` slot and its test
  are there for that. Fable 5.2 was not run, because on this plan it needs usage credits.
- **Through the Claude Code CLI, not a bare API call.** The CLI adds a preamble of about 780 tokens. No
  tools, MCP servers or project files were available to the model (see the command above).
- **Three runs per model, on one captured load.** That is enough to see the models converge, not to put
  a number on how often they fail. On v1, one Haiku answer in three was invalid.
- **One demo, written alongside the prompt.** The prompt's few-shot example is a different component,
  and the models never saw the reference. But the demo, the prompt and the validator come from the
  same author, so this is not a test on an independent production site.
