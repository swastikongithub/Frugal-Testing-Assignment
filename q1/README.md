# Q1 · Event-Loop Starvation & State-Drift Visual Regressions

**DRIFTDESK** is a local mock crypto exchange terminal (React + canvas) plus a Playwright/TypeScript
suite that attacks it four ways:

| | What the test does |
|---|---|
| **a** | Drops every 4th WebSocket frame and delays the rest by a seeded 2000–7000 ms, while the renderer CPU is throttled 4×. |
| **b** | A multi-condition **StateGuardian** proves the UI goes `false → syncing → synchronized` through a canvas loading loop. No sleeps anywhere. |
| **c** | A triple-click / interrupted tap lands **30–120 ms** after the skeleton disappears. The stale-element and canvas-coordinate failures it causes are fixed by an exponential-backoff **circuit breaker**. The server must record exactly one trade. |
| **d** | The order's quantity string is changed in flight (`500` → `0x1F4`, `500.000001`, unquoted `0x1F4`). The test proves the strict UI falls back safely and the `?unsafe=1` build fails silently. |

---

## Run it

Needs Node 20+ only. The suite starts and stops the server itself (Playwright `webServer`).

```bash
npm install
npx playwright install chromium
npm test             # lint:no-sleep -> typecheck -> 14 Playwright tests (headless)
```

| Script | What it does |
|---|---|
| `npm test` | Static-wait lint, `tsc --noEmit`, then the full suite headless. Prints an **evidence summary** at the end. |
| `npm run test:headed` | Same suite in a visible browser. There is no slowMo; the race window is timing-sensitive. |
| `npm run report` | Opens the HTML report. Every test has a **trace, screenshot and video** (all `on`). |
| `npm start` | Builds and serves the app on <http://127.0.0.1:5317> so you can use it by hand. Add `?unsafe=1` for the negative control. |
| `CHAOS_SEED=<n> npm test` | Replays an exact fault schedule. The seed is printed by test a. In PowerShell: `$env:CHAOS_SEED=<n>; npm test`. |

All scripts are plain Node (`tsx`, `vite`, `playwright`, `node scripts/*.mjs`), so they behave the same on Windows, macOS and Linux.

---

## Why a local mock and not binance.com

The PDF allows a mock and asks the candidate to justify how it meets the spec. A live exchange cannot be used here:

- **Anti-bot and terms of service.** Exchanges sit behind bot detection and forbid automated order entry. Test d would have to place real orders with tampered quantities.
- **No control over payloads.** We cannot see what the exchange's server actually stored. So we cannot prove interception accuracy ("the server received byte-identical mutated bytes") or "exactly one transaction recorded".
- **No ground truth for drift.** Proving *zero drift* needs the server's state at a given sequence number (`/api/state/:seq`). Public feeds don't expose that.
- **Not reproducible.** A live stream changes on every run. With the mock plus a seeded fault schedule, any run can be replayed exactly.

How the mock meets the "high-frequency streaming" requirements:

| Requirement | Mock exchange (`server/`) |
|---|---|
| High-frequency stream | WebSocket `/stream`, one frame every 50–100 ms (**10–20 frames/s**) |
| Detectable loss / reordering | Every frame has `seq` increasing by exactly 1. Frames carry only the instruments that moved (deltas), so a lost frame leaves wrong prices on screen |
| Resync path | `GET /api/snapshot` returns the full state and history at the current `seq` |
| Ground truth | `GET /api/state/:seq` keeps the price at every `seq` for about 6 minutes |
| Transaction endpoint | `POST /api/orders` takes the raw text body and an `Idempotency-Key`, keeps a per-session ledger (`received` vs `recorded`), and echoes the quantity back exactly as received |

---

## How it fits together

```
 Playwright (Node)                                         Mock exchange  :5317  (Express + ws)
 ┌──────────────────────────────────────┐                  ┌──────────────────────────────────┐
 │ WebSocketChaos  (page.routeWebSocket)│◄── frames ───────│ MarketFeed  seq 1,2,3...  10-20/s │
 │   per frame: DROP / DELAY / PASS ────┼──► page         │ /api/snapshot  /api/head          │
 │ StateGuardian   (MutationObserver ───┼── exposeBinding  │ /api/state/:seq                   │
 │                  + raf waitForFunction)                 │ POST /api/orders  (ledger)        │
 │ PayloadInterceptor (page.route)  ────┼── rewrites body ─►                                  │
 │ race gate + CircuitBreaker           │                  └──────────────────────────────────┘
 └──────────────────────────────────────┘
                    ▲ window.__telemetry, data-* attributes
                    │
 ┌──────────────────┴──────────────────────────────────────────────────────────────────────────┐
 │ DRIFTDESK (React, production build)                                                          │
 │  SyncEngine:  synchronized --gap--> false --painted--> syncing --snapshot + 2 live frames--> │
 │  Skeleton + LoaderCanvas (rAF, data-frame)   rows: price chart canvas + BUY|SELL canvas      │
 │  Order strip inserted above the panel  ·  Receipt parses quantity strictly in render         │
 │  ErrorBoundary + toast + console.error  ·  ?unsafe=1 -> Number() coercion (negative control) │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Spec → implementation traceability

| PDF requirement | Implementation | Evidence in the run |
|---|---|---|
| **a.** Intercept incoming WebSocket frames with the framework's network routing | `page.routeWebSocket` + `connectToServer()` + `server.onMessage` (manual forwarding) in [`WebSocketChaos.ts`](tests/framework/fault-injection/WebSocketChaos.ts) | A per-frame log line: `#NN seq=… DROP / DELAY n ms / delivered after n ms` |
| Drop every 4th packet | `decideFrame`: `index % 4 === 0` → DROP ([`FaultProfile.ts`](tests/framework/fault-injection/FaultProfile.ts)) | Asserts dropped indices `[4,8,…,40]`, ratio **exactly 0.25** |
| Variable latency jitter 2000–7000 ms | Seeded `mulberry32` → `uniformInt(2000, 7000)`. Seed printed, replay with `CHAOS_SEED` | Asserts every scheduled delay is in [2000, 7000] and every delivery is ≥ scheduled and ≤ scheduled + 50 ms |
| "Fluctuating throttle" / event-loop starvation | Jitter plus CDP `Emulation.setCPUThrottlingRate` **4×** for the chaos window ([`cpuThrottle.ts`](tests/framework/fault-injection/cpuThrottle.ts)) | Long-task count reported |
| …or high-frequency polling API responses | The app does not poll; its only REST call is the resync snapshot. So `page.route` throttling has nothing to act on (see *Interpretations*) | — |
| Latency `setTimeout` only in the fault layer | Holding a packet *is* the injected fault. The `lint:no-sleep` script allows timers only under `tests/framework/fault-injection/` | Lint output |
| **b.** No implicit waits or static sleeps | [`scripts/lint-no-sleep.mjs`](scripts/lint-no-sleep.mjs) runs first in `npm test`. It self-tests 6 rules, then fails on `waitForTimeout`, `sleep(`, `Thread.sleep`, `time.sleep`, and `setTimeout`/`setInterval` outside the fault layer | `lint:no-sleep OK - … 0 violations` |
| Custom dynamic multi-condition state guardian | [`StateGuardian.waitForSynchronized`](tests/framework/guardian/StateGuardian.ts): `waitForFunction(…, {polling: 'raf'})` over **5 conditions in the same frame**: state is `synchronized`, skeleton gone, loader advanced while syncing, applied seq ≥ server head, and a *new* cycle (not the previous one) was observed | The condition timeline is printed |
| `data-state-sync="false"` flips to `"synchronized"` | `#terminal[data-state-sync]` ([`App.tsx`](src/App.tsx)). A MutationObserver installed via `addInitScript` records every flip and pushes it to Node via `exposeBinding` ([`observerScript.ts`](tests/framework/guardian/observerScript.ts)) | Asserts the path `false → syncing → synchronized` with increasing timestamps, and that observer, binding and app telemetry agree |
| Track it through a canvas loading loop | [`LoaderCanvas.tsx`](src/components/LoaderCanvas.tsx) bumps `data-frame` on every rAF. The observer counts frames per state | Asserts loader frames while syncing > 0 |
| (extra) The state is actually correct | `verifyNoDrift()` compares the client's prices at its seq with `/api/state/:seq` | **0 / 6 prices differ** |
| **c.** "Triple click / interrupted tap" on the first chart item's action panel | [`gestures.ts`](tests/framework/race/gestures.ts). `triple-click` = native `mouse.click(x, y, {clickCount: 3})`. `interrupted-tap` = three taps through one ElementHandle | Tap log from the app's own hit test |
| Strict window 30–120 ms after the skeleton's complete visual disappearance | [`Skeleton.tsx`](src/components/Skeleton.tsx) records `hiddenAt` in the commit that removes it. `paintSettledAt` = 2 rAFs later (the frame without the skeleton is on screen). [`raceWindow.ts`](tests/framework/race/raceWindow.ts) opens the gate on the first frame where `now − paintSettledAt ≥ 30` | Asserts `30 ≤ Δ ≤ 120`, with Δ = first `pointerdown.timeStamp − paintSettledAt` (page clock). Out-of-window attempts are logged `OUT_OF_WINDOW` and retried with a fresh session (max 3), never passed |
| Catch the StaleElementReferenceException | Playwright's `Element is not attached to the DOM` → typed `StaleElementError` ([`errors.ts`](tests/framework/resilience/errors.ts)). c0 proves the mapping on a real detached handle | `misses: STALE_ELEMENT, STALE_ELEMENT` |
| …or canvas coordinate mismatch | The canvas reports which item and zone it hit (`window.__telemetry.taps`). A tap off target → `CanvasCoordinateMismatchError(expected, actual, point)` | `misses: CANVAS_COORDINATE_MISMATCH ×2` |
| Exponential-backoff circuit breaker retry | [`CircuitBreaker.ts`](tests/framework/resilience/CircuitBreaker.ts): CLOSED/OPEN/HALF_OPEN, `base·2^(n−1)` + jitter frames, max attempts, every attempt logged. Each retry re-resolves the target via `getByRole('application', {name})` | c0 asserts backoff 2→4→8 (+jitter) frames, gives up with `CircuitOpenError`, and does not retry unknown errors |
| (extra) No double-spend | Each ticket keeps one `Idempotency-Key` and the server dedupes | **received 3 / recorded 1** |
| **d.** Move an item to the validation state | Tapping BUY puts the ticket in `data-ticket-state="validation"`. The interceptor **holds the request** until the test has asserted that state | `uiStateWhileHeld: validation` |
| Intercept the transaction payload via the automation proxy | [`PayloadInterceptor.ts`](tests/framework/payload/PayloadInterceptor.ts): `page.route` → `route.continue({postData})` | original / sent / server lines per test |
| Change the precision string (hex / float) | [`mutations.ts`](tests/framework/payload/mutations.ts): `hex-string` `"0x1F4"`, `float-string` `"500.000001"`, `raw-hex-literal` `0x1F4` unquoted, plus a `none` control | — |
| *Interception accuracy* | Asserts exactly one token changed, and that the server's stored raw body is **byte-identical** to the mutated body | Assertions in d |
| *Visual state telemetry* | Error Boundary `data-testid="error-boundary"`, toast `data-testid="validation-toast"`, tagged `console.error`, plus `pageerror` capture | Signals line per test |
| *Outcome justification* | [`outcomeClassifier.ts`](tests/framework/payload/outcomeClassifier.ts) decides from the signals alone and never sees the mode. See [`OUTCOME_JUSTIFICATION.md`](OUTCOME_JUSTIFICATION.md) | Verdict per test |

---

## Design decisions and trade-offs

- **Delta frames with a strict `seq`.** A dropped frame really corrupts prices, which is why a resync protocol has to exist at all. The engine works like an exchange's "local order book" recipe: buffer frames, fetch a snapshot, discard frames ≤ the snapshot's seq, then confirm with contiguous frames.
- **`false` is painted before syncing starts.** Store updates in React are synchronous, so the "start syncing" effect could run before the browser paints. The app waits two animation frames so the desync is really on screen. The first test run caught exactly this: `false` and `syncing` had the same timestamp.
- **Synchronized needs 2 *live* contiguous frames after the snapshot.** Frames that were buffered during the fetch don't count. So "synchronized" means the stream is flowing again, and the syncing phase always spans real loader frames.
- **Rows re-mount when data arrives** (new snapshot epoch or a new order revision), not on every tick. That is what makes stale handles and layout shifts happen reliably instead of by luck.
- **The order strip is inserted *above* the action panel.** The panel moves down 44 px on the first tap, so taps 2 and 3 of a burst land on the strip. That is a realistic canvas coordinate mismatch, and the app's own hit test detects it.
- **The server is deliberately lenient.** It stores and echoes the quantity as received, which makes the client the last line of defence. Test d measures the client. The unquoted-hex case shows the gateway catching what it *can* catch (invalid JSON).
- **Backoff is measured in rendered frames, not milliseconds.** What the retry waits for is the UI finishing a re-render, so counting `requestAnimationFrame`s is the honest unit. It uses no timer, and the time actually waited is logged.
- **The race window is anchored at paint-settled**, the moment the skeleton is *visually* gone. The delay since DOM removal is reported as well. Gate checks run once per frame, so the tap lands within roughly one frame plus one CDP round trip after the gate opens.
- **One worker** (`workers: 1`), because the tests measure timing windows. Trace, screenshot and video stay **on** for every test, as asked. Their overhead is included in every measured number.
- **The classifier sees signals, not modes.** The `none` control (CLEAN in both modes) and `raw-hex-literal` (SECURE_FALLBACK even in unsafe mode, because the gateway rejected it) show the verdict is not just a label for the mode.

## Interpretations (where the brief was ambiguous)

1. **Which frames get the jitter.** The PDF says "drops every 4th packet and adds a variable latency jitter between 2000 ms and 7000 ms". **Every frame that is not dropped** inside the chaos window gets a seeded delay in that range. (The build prompt said "every other frame"; the PDF wins.)
2. **"Packet" means one WebSocket message.** TCP-level loss is invisible to browser automation and would be retransmitted anyway.
3. **The chaos window is 40 server frames** (a multiple of 4, so the 25 % is exact). Delayed frames keep arriving for up to 7 s after the window closes. The suite waits for an event-driven `drained` promise, not for a fixed time.
4. **"client gaps" counts gap detections** (desync episodes). Once the client is desynchronised it buffers and resyncs rather than counting each missing seq again. The ledger is the place to count dropped frames: always 10.
5. **StaleElementReferenceException** is a Selenium name. The Playwright equivalent is mapped to a typed `StaleElementError`.
6. **No polling.** The app has no polling endpoint, so the "polling API responses" branch of (a) doesn't apply. The REST snapshot is a resync call, not a poll.
7. **The 4× CPU throttle is an addition**, to make "event-loop starvation" literal.

---

## Evidence from a real run

The output of the clean-install run (`npm install && npx playwright install chromium && npm test`) is in [`EVIDENCE.md`](EVIDENCE.md).

---

## Video checklist (output → source → AI prompt history)

1. **Output**
   - Run `npm test`. Point out:
     - the `lint:no-sleep` line
     - the per-frame `[chaos]` ledger and its seed
     - the guardian's condition timeline
     - the race-trap lines (Δ ms, the typed misses, the breaker attempts, received 3 / recorded 1)
     - d's *original / sent / server / ui / verdict* lines
     - the **evidence summary** table
   - Run `npm run report`. Open test **c** and play its video. Open the trace and step through the taps.
   - Run `npm start`. Show the terminal live, triple-click BUY by hand, then load `?unsafe=1`.
2. **Source walkthrough**, in this order:
   - `shared/protocol.ts` → `server/market.ts` → `src/sync/SyncEngine.ts`
   - `src/components/Skeleton.tsx` and `src/components/LoaderCanvas.tsx`
   - `tests/framework/fault-injection/` → `guardian/` → `race/` + `resilience/` → `payload/`
   - the four spec files → `reporters/evidence-summary.ts` → `scripts/lint-no-sleep.mjs`
3. **AI prompt history.** Show the prompts used to build and review this.

## Layout

```
q1/
  server/        market.ts (feed + seq ring), orders.ts (ledger), index.ts (Express + ws)
  shared/        protocol.ts (frame/snapshot/order types used by both sides)
  src/           React app: sync/SyncEngine, orders/OrderStore, lib/telemetry, components/*
  tests/         a-network-chaos, b-state-guardian, c-race-trap, d-payload-distortion
    framework/   fault-injection/, guardian/, race/, resilience/, payload/, terminal.ts, fixtures.ts, evidence.ts
  reporters/     evidence-summary.ts (end-of-run table from per-test evidence attachments)
  scripts/       lint-no-sleep.mjs
```
