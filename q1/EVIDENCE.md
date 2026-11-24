# Q1 evidence (real run output, copied verbatim)

**Run:** clean install on Windows 11 / Node 22.13.1 / Playwright 1.65.1 / headless Chromium. Trace, screenshot and video were on for every test.
**Command:** `npm install && npx playwright install chromium && npm test`
**Result:** `lint:no-sleep OK`, typecheck OK, **14 passed (36.6 s)**.

Every run prints a fresh seed and fresh timings, so your numbers will differ slightly. The assertions are what stay fixed.

## End-of-run evidence summary (custom reporter)

```
 Q1 EVIDENCE SUMMARY - every value below was measured in this run
========================================================================================================
 PASS     a: chaos - drop every 4th WebSocket frame + 2000-7000 ms jitter under 4x CPU throttle  (10.3 s)
          seed: 604380569 | dropped: 10/40 (25.0%) | scheduled delay: 2244-6966 ms
          delivered delay: 2258-6979 ms | max timer lateness: 15.1 ms | client gaps: 1
          out-of-order: 29 | max frame age: 6987 ms | long tasks: 12 | drift after heal: 0
 PASS     b1: guardian - one dropped frame heals through false -> syncing -> synchronized  (1.1 s)
          path: false -> syncing -> synchronized | false->syncing: 18.2 ms
          syncing->synchronized: 181.0 ms | loader frames while syncing: 10 | drift: 0/6
 PASS     b2: guardian - heals after the full chaos profile  (11.0 s)
          desync cycles during chaos: 1 | path: false -> syncing -> synchronized
          false->syncing: 13.9 ms | syncing->synchronized: 834.7 ms | loader frames while syncing: 49
          drift: 0/6
 PASS     c: race trap - triple-click 30-120 ms after the skeleton disappears  (1.2 s)
          first tap after paint-settled: 47.8 ms | after DOM removal: 70.3 ms | scenario attempts: 1
          misses: CANVAS_COORDINATE_MISMATCH, CANVAS_COORDINATE_MISMATCH | breaker trials: 2
          backoff frames: 3/3 | server received/recorded: 3/1
 PASS     c: race trap - interrupted-tap 30-120 ms after the skeleton disappears  (1.2 s)
          first tap after paint-settled: 53.6 ms | after DOM removal: 80.1 ms | scenario attempts: 1
          misses: STALE_ELEMENT, STALE_ELEMENT | breaker trials: 2 | backoff frames: 2/2
          server received/recorded: 3/1
 PASS     c0: circuit breaker self-check - exponential backoff, half-open trials, give-up  (0.6 s)
          backoff frames: 2 -> 4 -> 9 | give-up after: 3 attempts
          detached handle maps to: StaleElementError
 PASS     d: none vs strict parser  (0.7 s)
          verdict: CLEAN | sent quantity: "500" | server: RECORDED "500" | boundary/toast/log: 0/0/0
          receipt shows: 500
 PASS     d: none vs unsafe parser  (0.7 s)
          verdict: CLEAN | sent quantity: "500" | server: RECORDED "500" | boundary/toast/log: 0/0/0
          receipt shows: 500
 PASS     d: hex-string vs strict parser  (0.8 s)
          verdict: SECURE_FALLBACK | sent quantity: "0x1F4" | server: RECORDED "0x1F4"
          boundary/toast/log: 1/1/1 | receipt shows: -
 PASS     d: hex-string vs unsafe parser  (0.7 s)
          verdict: SILENT_FAILURE | sent quantity: "0x1F4" | server: RECORDED "0x1F4"
          boundary/toast/log: 0/0/0 | receipt shows: 500
 PASS     d: float-string vs strict parser  (0.9 s)
          verdict: SECURE_FALLBACK | sent quantity: "500.000001" | server: RECORDED "500.000001"
          boundary/toast/log: 1/1/1 | receipt shows: -
 PASS     d: float-string vs unsafe parser  (0.8 s)
          verdict: SILENT_FAILURE | sent quantity: "500.000001" | server: RECORDED "500.000001"
          boundary/toast/log: 0/0/0 | receipt shows: 500.000001
 PASS     d: raw-hex-literal vs strict parser  (0.7 s)
          verdict: SECURE_FALLBACK | sent quantity: 0x1F4 | server: REJECTED INVALID_JSON
          boundary/toast/log: 0/1/1 | receipt shows: -
 PASS     d: raw-hex-literal vs unsafe parser  (0.6 s)
          verdict: SECURE_FALLBACK | sent quantity: 0x1F4 | server: REJECTED INVALID_JSON
          boundary/toast/log: 0/1/1 | receipt shows: -
--------------------------------------------------------------------------------------------------------
 14/14 passed, overall PASSED
========================================================================================================
```

## Log excerpts from the same run

**a. Fault ledger** (first 8 of 40 frames shown; every frame gets a line):

```
[a] seed 604380569  (replay this exact schedule with CHAOS_SEED=604380569)
[chaos] #01 seq=19 DELAY 3452 ms
[chaos] #02 seq=20 DELAY 2959 ms
[chaos] #03 seq=21 DELAY 6966 ms
[chaos] #04 seq=22 DROP  (every 4th frame)
...
[chaos] #03 seq=21 delivered after 6979.0 ms
[a] dropped 10/40 (25.0%) at 4,8,12,16,20,24,28,32,36,40; scheduled 2244-6966 ms, delivered 2257.6-6979.0 ms
[a] client: gaps 1, out-of-order 29, stale discarded 31, max frame age 6987 ms, long tasks 12
[a] healed at seq 129; drift check at seq 129: 0 of 6 prices differ
```

**b1. StateGuardian condition timeline.** All five conditions must hold in the same animation frame:

```
[guardian] path (cycle 1): false@+0.0ms -> syncing@+18.2ms -> synchronized@+199.2ms
[guardian] loader canvas advanced 10 frames while syncing
[guardian]   conditions at 471.8: newCycleObserved
[guardian]   conditions at 506.8: seqCaughtUp, newCycleObserved
[guardian]   conditions at 521.7: loaderAdvancedWhileSyncing, seqCaughtUp, newCycleObserved
[guardian]   conditions at 671.9: stateSynchronized, skeletonGone, loaderAdvancedWhileSyncing, seqCaughtUp, newCycleObserved
[guardian] all conditions held at 671.9 (seq 146); drift check seq 146: 0/6 prices differ
```

**c. Race trap, triple-click:**

```
[c] attempt 1: first tap landed 47.8 ms after paint-settled (70.3 ms after the skeleton left the DOM) -> IN WINDOW
[c] tap 1: hit BTC-USD/BUY
[c] tap 2: CANVAS_COORDINATE_MISMATCH - tap at (906, 100) hit "order-strip:BTC-USD", expected "action-panel:BTC-USD/BUY"
[c] tap 3: CANVAS_COORDINATE_MISMATCH - tap at (906, 100) hit "order-strip:BTC-USD", expected "action-panel:BTC-USD/BUY"
[breaker] tap-recovery tap 2 observed miss: CLOSED -> OPEN FAIL [CANVAS_COORDINATE_MISMATCH] ...
[breaker] tap-recovery tap 2 attempt 1/5 after backoff 3 frames (44.7 ms): HALF_OPEN -> CLOSED OK
[breaker] tap-recovery tap 3 observed miss: CLOSED -> OPEN FAIL [CANVAS_COORDINATE_MISMATCH] ...
[breaker] tap-recovery tap 3 attempt 1/5 after backoff 3 frames (38.7 ms): HALF_OPEN -> CLOSED OK
[c] server: received 3 requests, recorded 1 transaction (RECORDED, DUPLICATE, DUPLICATE)
```

**c. Race trap, interrupted tap:**

```
[c] attempt 1: first tap landed 53.6 ms after paint-settled (80.1 ms after the skeleton left the DOM) -> IN WINDOW
[c] tap 2: STALE_ELEMENT - interrupted tap 2: element reference is stale (detached from the DOM)
[breaker] tap-recovery tap 2 observed miss: CLOSED -> OPEN FAIL [STALE_ELEMENT] ... elementHandle.click: Element is not attached to the DOM
[breaker] tap-recovery tap 2 attempt 1/5 after backoff 2 frames (27.9 ms): HALF_OPEN -> CLOSED OK
[c] server: received 3 requests, recorded 1 transaction (RECORDED, DUPLICATE, DUPLICATE)
```

**d. Payload distortion, hex string vs strict and unsafe:**

```
[d] original : {"sessionId":"20bce782-…","symbol":"BTC-USD","side":"BUY","quantity":"500","limitPrice":"64452.00"}
[d] sent     : {"sessionId":"20bce782-…","symbol":"BTC-USD","side":"BUY","quantity":"0x1F4","limitPrice":"64452.00"}
[d] server   : RECORDED, quantity stored as "0x1F4"
[d] ui       : boundary=true toast=true tagged console errors=1 page errors=0 receipt=false
[d] verdict  : SECURE_FALLBACK (no success receipt rendered; error boundary mounted; validation toast shown; error logged)

[d] sent     : {"sessionId":"8b5f798c-…", ... "quantity":"0x1F4", ...}        (?unsafe=1)
[d] server   : RECORDED, quantity stored as "0x1F4"
[d] ui       : boundary=false toast=false tagged console errors=0 page errors=0 receipt=true showing 500
[d] verdict  : SILENT_FAILURE (receipt rendered quantity 500 for a tampered order; no boundary, no toast, nothing logged)
```

## Stability of the timing-sensitive test (c)

`npx playwright test tests/c-race-trap.spec.ts -g "race trap" --repeat-each=10` (same code, before the clean install):
**20 / 20 passed, all on scenario attempt 1** (no `OUT_OF_WINDOW` retries). The first tap landed
**48.3 – 88.0 ms** after paint-settled, inside the required 30–120 ms.

## Bugs the suite caught while it was being built

- The guardian first timed out because its MutationObserver was attached to `document.documentElement`, which is still `null` when init scripts run. It now observes `document`.
- b1 then failed `syncing after false: expected > 526, received 526`. React ran the "start syncing" effect in the same task as the `false` commit, so the desync was never painted. The app now waits two animation frames before syncing.
