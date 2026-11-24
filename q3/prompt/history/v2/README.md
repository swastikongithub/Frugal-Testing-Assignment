# Prompt v2: runs on the component before the nested iframe

These nine answers were the recorded model runs until the demo gained the nested iframe from the Q3
brief. They stay here so the step from v2 to v3 can be checked.

- **Prompt:** v2, as of commit `1195005` (`analysis` holds each step's findings; see [`../v1/`](../v1/README.md) for why).
- **Component:** the load captured at that commit. The closed root held the whole transfer form,
  including the button, then named "Confirm transfer". There was no iframe.
- **Runner:** `npm run prompt:run`, on 2026-11-24, via Claude Code CLI 2.1.331 in print mode with no tools.

## Results (from the fresh-clone evidence run at `719bcbb`)

| Model | Answers | Validator | Replay on 5 fresh loads, every run | Locators vs the hand-written reference |
|---|---|---|---|---|
| Haiku 5.5 | 3 | 3/3 VALID, 0 warnings | 80/80 tier checks, 30/30 scope claims, 5/5 transfers | run-1 started tier 3 at the named `region`, not `main`; runs 2 and 3 identical |
| Sonnet 5.5 | 3 | 3/3 VALID, 0 warnings | same | identical, all 3 |
| Opus 5.5 | 3 | 3/3 VALID, 0 warnings | same | identical, all 3 |

## Why they were replaced

The brief's Q3 snippet nests an iframe inside the closed root:
`shell-container > #shadow-root (open) > micro-frontend-wrapper > #shadow-root (closed) > nested-iframe > button "Confirm Transaction"`.
The demo now has that iframe, so the component the model reads changed. Prompt v3 adds what the
model needs for it:

- the `iframe` scope;
- how an iframe's document is serialised (after `#document`, inside the `<iframe>`);
- that each iframe document is its own id scope;
- that iframe boundaries, like shadow boundaries, do not appear in a tier 3 path.

The new runs are in [`../../runs/`](../../runs).

Each `meta.json` here still records the hashes of the v2 prompt and of the old component, so the test
suite would report them as stale if they were moved back.

## Re-checking these runs

```bash
git worktree add ../q3-v2 1195005        # the tree as it was with prompt v2 and the old component
cd ../q3-v2/q3 && npm install && npx playwright install chromium && npm test
```

At that commit these runs were in `prompt/runs/`, so `npm test` replays all nine there.
