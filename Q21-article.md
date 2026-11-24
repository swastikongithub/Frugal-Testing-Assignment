# Architectural Chaos: Engineering Asynchronous Network Interception and Fault-Injection Frameworks inside Playwright CI/CD Pipelines
> Topic A. The examples and measurements come from the fault-injection suite I built for Q1 of this assignment.

## Why put chaos inside the test runner?
Most end-to-end suites test against a network that never misbehaves. Real users sit behind mobile links that drop packets, reorder frames and stall for seconds. The defects that hurt most, such as stale prices, double submissions and silently corrupted values, appear only under those conditions. Infrastructure chaos tools such as service-mesh fault injection, Chaos Mesh or Toxiproxy are excellent at breaking services, but they cannot see what the browser renders. A fault layer inside the Playwright runner joins the two halves: the same process that injects a fault also watches the UI react and decides whether that reaction is acceptable.

That power has a cost. A chaos suite that is itself non-deterministic is just a flaky suite with a better name. The architecture below is built around one rule: **every injected fault must be reproducible, measured and proven to have happened.**

## 1. Choosing the interception layer
| Layer | Example | Strengths | Weaknesses |
|---|---|---|---|
| In-browser routing | `page.route`, `page.routeWebSocket` | Per-test, per-frame control; no shared state between parallel workers; sees decoded payloads | Only that page's traffic; delay timers run in the test process |
| DevTools Protocol | `Network.emulateNetworkConditions` | Realistic bandwidth and latency shaping | Chromium-only; whole-connection, no per-frame decisions |
| Proxy | Toxiproxy, mitmproxy | Protocol-agnostic; covers non-browser clients | Shared across workers unless one proxy per worker; TLS handling |
| Platform | Istio fault injection, Chaos Mesh | Exercises the real service topology | Cannot assert on the UI; needs a cluster; larger blast radius |

For UI resilience I chose in-browser routing. `page.routeWebSocket` (Playwright 1.48+) puts the test between the page and the server, so every server frame can be dropped, delayed or rewritten individually, and every Playwright worker owns its own route. The other layers stay valuable, but in a different stage of the pipeline.

```ts
await page.routeWebSocket(/\/stream$/, (pageSide) => {
  const serverSide = pageSide.connectToServer();
  serverSide.onMessage((frame) => {
    const decision = decideFrame(profile, ++index, rng);    // seeded: same seed, same schedule
    ledger.push({ index, action: decision.action, receivedAt: performance.now() });
    if (decision.action === 'DROP') return;                 // every 4th frame
    setTimeout(() => pageSide.send(frame), decision.delayMs); // the injected fault, not a wait
  });
});
```

## 2. Determinism: seeds, ledgers and proof
Randomness is essential to chaos, and fatal to debugging, unless it is seeded. My fault layer draws every decision from a seeded generator (mulberry32) and prints the seed, so `CHAOS_SEED=604380569` replays a failure exactly. It also keeps a ledger: one entry per frame with the decision, the scheduled delay and the measured delivery time.

The ledger lets the test assert that the chaos really happened. A fault you cannot prove you injected is noise; a mistyped route pattern would otherwise give a perfectly green run with no chaos at all. In the clean-install run, the 40-frame window dropped exactly 10 frames (25.0%). Scheduled delays ranged from 2244 to 6966 ms, and delivered delays from 2258 to 6979 ms, all inside the required 2000–7000 ms.

## 3. Timers belong to the fault, never to the test
The only `setTimeout` in the suite holds a packet; it is the fault, not a wait. A lint gate runs before any test, self-tests its six rules, and fails the build if `waitForTimeout`, `sleep`, `Thread.sleep`, `time.sleep` or a timer appears outside the fault-injection folder.

Tests therefore synchronise on state, not time. A state guardian waits until several conditions hold at once: a new sync cycle observed, `data-state-sync="synchronized"`, the skeleton gone, the canvas loader advanced while syncing, and the applied sequence number caught up with the server's. It combines a `MutationObserver` init script, an `exposeBinding` bridge and `requestAnimationFrame` polling, and it also asserts the transition path false → syncing → synchronized with timestamps.

The trade-off is a design contract: the application must expose its state through data attributes and telemetry. I treat that as a feature. Testability that has to be designed in is cheaper than visual heuristics that have to be maintained forever.

## 4. Making the harness itself resilient
Under chaos the test meets the same races users do: element handles that go stale when a row re-mounts, and canvas coordinates that shift between measuring and clicking. Retrying blindly hides real defects, so the harness raises typed errors (`STALE_ELEMENT`, `CANVAS_COORDINATE_MISMATCH`) and recovers through a circuit breaker: CLOSED → OPEN → HALF_OPEN, with exponential backoff counted in animation frames, not milliseconds, so it adapts to slow runners. A self-check proves the breaker gives up after its attempt limit.

Retries are only safe if the system under test is idempotent, so assert that too. In my race test, a triple-click landing 47.8 ms after the skeleton left produced "server received 3 requests, recorded 1 transaction".

## 5. Pipeline architecture
- **Tiered seeds.** Pull requests run fixed seeds: the known-good set plus every seed that ever failed, as a regression corpus. Nightly runs draw fresh random seeds, and any failing seed is promoted to the pull-request set.
- **Isolation over parallelism for timing tests.** Per-worker routes scale cleanly, but timing assertions are sensitive to CPU contention. My suite runs timing tests on one worker and applies a 4× CDP CPU throttle (`Emulation.setCPUThrottlingRate`) so local runs are as pessimistic as a cheap CI runner. Even then, the worst timer lateness was 15.1 ms, far below the tolerances asserted.
- **Evidence, not just a verdict.** A custom reporter prints the measured values (drop ratio, delay range, transition times), and failures keep the seed, the ledger, the Playwright trace and the video.
- **Negative controls.** A deliberately unsafe build (`?unsafe=1`) must be classified as SILENT_FAILURE. If the suite cannot fail on a known-bad build, a green run proves nothing.
- **A flake budget with owners.** Track each test's nightly pass rate, and quarantine above a threshold, but with an owner and an expiry date, never silently.

## 6. Trade-offs and pitfalls
- **Realism vs determinism.** Seeded schedules are reproducible but cover a finite set of interleavings; nightly random seeds widen the search.
- **In-process timers vs network-level delay.** Delays implemented in the test process inherit its event-loop lateness under load. Measure it, and keep it an order of magnitude below your assertions.
- **Mocks vs production.** I ran Q1 against a local mock exchange because public exchanges block automation and do not allow payload tampering. Mocks drift, so contract tests against the real API schema keep them honest.
- **Cost.** Chaos tests are slow by design (2–7 s delays), so keep chaos windows short (40 frames), keep the pull-request tier small and push breadth to nightly runs.

## Conclusion
Browser-level chaos testing pays off when it is engineered like production code: deterministic, measured, self-verifying and wired into tiered pipelines. The goal is not to make tests survive chaos but to prove the application does, and to make every failure reproducible from one printed seed.

*References: Playwright documentation (WebSocketRoute, CDP sessions); Principles of Chaos Engineering (principlesofchaos.org); Toxiproxy (Shopify); Chaos Mesh (CNCF). Measurements are from my own Q1 runs.*
