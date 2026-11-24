# Prompt v1: what happened when it ran on real models

This folder keeps the record of the first version of the system prompt, so the change to v2 can be
checked rather than taken on trust.

- **Prompt:** `prompt/locator-cot-system-prompt.md` as of commit `33956af`
  (sha256 `b29fdcb88e52b189faadd25fda3d1bb86e75a4b61755efc9795505029c522780`).
- **What it asked for:** write out the chain of thought, step by step, in a top-level `reasoning` object,
  then the targets.
- **Runner:** `npm run prompt:run` (see `scripts/run-prompt.ts`), on 2026-11-24, via Claude Code CLI
  2.1.331 in print mode with no tools.

## Results

| Model | Outcome |
|---|---|
| Haiku 5.5 (`claude-haiku-5-5`) | 3 answers, recorded here. **2 of 3 valid** under the v1 validator. |
| Sonnet 5.5 | **Refused** before answering: safeguards flagged the request as `reasoning_extraction`. |
| Opus 5.5 | **Refused** before answering: same flag. |
| Fable 5.2 | Not run: it needs usage credits on this plan. |

### Haiku 5.5 answers

| Run | Started (UTC) | Time | Tokens in / out (thinking) | v1 validator |
|---|---|---|---|---|
| [run-1](claude-haiku-5-5/run-1/answer.txt) | 06:21:45 | 57.5 s | 12 190 / 15 481 (11 661) | VALID, 6 targets, 4 tier-2 relations |
| [run-2](claude-haiku-5-5/run-2/answer.txt) | 06:23:03 | 9.6 s | 12 187 / 3 010 (0) | INVALID, 9 schema errors |
| [run-3](claude-haiku-5-5/run-3/answer.txt) | 06:23:14 | 10.3 s | 12 190 / 3 284 (0) | VALID, 6 targets, 4 tier-2 relations |

Run-2 failed for three reasons, all caught by the schema:

- it added a `reasoning.landmarkMap` key that the schema does not define;
- it left an empty `text` on one entry of its relationship map;
- the tier 2 of `confirmTransfer` was an `aria-controls` relation to the status region, written as
  `{"relation":"aria-controls","direction":"target-to-anchor","anchor":{"role":"status","text":""},"targetRole":"button"}`.
  The anchor's empty `text` fails the relation branch of `tier2`. The other four messages on
  `/targets/4/tier2` are the `oneOf` explaining why it doesn't match the `unavailable` branch either.

The validator's output at the time:

```
prompt:run claude-haiku-5-5 run-2: 9.6 s, 12187 in / 3010 out
  answer   : prompt/runs/claude-haiku-5-5/run-2/answer.txt
  ERROR    : SCHEMA at /reasoning: must NOT have additional properties {"additionalProperty":"landmarkMap"}
  ERROR    : SCHEMA at /reasoning/relationshipMap/6/to/text: must NOT have fewer than 1 characters {"limit":1}
  ERROR    : SCHEMA at /targets/4/tier2/anchor/text: must NOT have fewer than 1 characters {"limit":1}
  ERROR    : SCHEMA at /targets/4/tier2: must have required property 'unavailable' {"missingProperty":"unavailable"}
  ERROR    : SCHEMA at /targets/4/tier2: must NOT have additional properties {"additionalProperty":"relation"}
  ERROR    : SCHEMA at /targets/4/tier2: must NOT have additional properties {"additionalProperty":"direction"}
  ERROR    : SCHEMA at /targets/4/tier2: must NOT have additional properties {"additionalProperty":"anchor"}
  ERROR    : SCHEMA at /targets/4/tier2: must NOT have additional properties {"additionalProperty":"targetRole"}
  ERROR    : SCHEMA at /targets/4/tier2: must match exactly one schema in oneOf {"passingSchemas":null}
  validator: INVALID (9 error(s))
```

(These files were written to `prompt/runs/` at the time and moved here when v2 replaced v1. Each
`meta.json` records the v1 prompt hash above.)

### The refusals, verbatim

Sonnet 5.5:

```
API Error: Sonnet 5.5's safeguards flagged this message (https://www.anthropic.com/legal/aup). This sometimes happens with safe, normal conversations. Claude Code can't respond to this message with Sonnet 5.5.
Try rephrasing the request in a new session or change your model.
Learn more: https://support.claude.com/en/articles/8106465
Details: `[reasoning_extraction]`
Request ID: req_011ChMGmwY2nutasuWVTTghG
Message ID: msg_011ChMGmwdFARsLehnN1yzmc
```

Opus 5.5:

```
API Error: Opus 5.5's safeguards flagged this message (https://www.anthropic.com/legal/aup). This sometimes happens with safe, normal conversations. Claude Code can't respond to this message with Opus 5.5.
Try rephrasing the request in a new session or change your model.
Learn more: https://support.claude.com/en/articles/8106465
Details: `[reasoning_extraction]`
Request ID: req_011ChMGnAH18Lm6FiC2pXJfy
Message ID: msg_011ChMGnANwmsnttN3QKHjd2
```

## What v2 changed, and why

The flag named the cause. v1 asked the model to transcribe its own chain of thought into the answer.
The larger models treat that as an attempt to extract their internal reasoning. v2 makes one change
of framing and none of substance:

- The model thinks privately, as it normally does.
- `reasoning` became `analysis`. It holds the **findings** of each method step: the parse tree, the
  accessibility model, the volatility scan and the relationship map.
- The eight steps, the hard rules, the schema constraints and the validator checks are the same.

This is also a better design for the brief. "Forcing" structured reasoning means making each step's
result something a program can check against the input. A transcript of thinking can't be checked;
a parse tree or a relationship map can, and `scripts/validate-locators.ts` does check them.

I made this change once. I did not try rewordings against the classifier. The v2 results are in
[`../v2/`](../v2/README.md): 9 of 9 answers valid. The current prompt is v3, which adds the iframe
scope; its results are in the Q3 README, under *Real model answers*.

## Re-checking these verdicts

The current validator expects `analysis` and so rejects these files by design. To check them with the
v1 validator:

```bash
git worktree add ../q3-v1 33956af        # the tree as it was with prompt v1
cd ../q3-v1/q3 && npm install
npx tsx scripts/validate-locators.ts <path to this folder>/claude-haiku-5-5/run-1/answer.txt
```
