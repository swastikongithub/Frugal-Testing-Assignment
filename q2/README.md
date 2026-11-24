# Q2 · Cryptographic Token Chaining & Dynamic Replay Attacks

A local **booking gateway** (Javalin, shaped like restful-booker) that verifies HMAC-SHA256 request
signatures, plus a JUnit 5 / RestAssured suite that attacks it:

| | What the suite does |
|---|---|
| **Chaining** | `POST /booking`, pull the generated `bookingid` string out of the JSON with JsonPath, then `PUT` it with an `X-Signature-Auth` computed at runtime from the exact body text, that id and a live Unix timestamp. |
| **Replay** | Re-submits the accepted PUT **0, 150 and 299 ms** after the first one completed. One character of the body is changed (`totalprice` 250 → 350) and the original signature and timestamp are reused. It is dispatched by a `ScheduledExecutorService` and the delay is measured with `System.nanoTime`. The gateway must answer **401 `SIGNATURE_MISMATCH`**. |
| **Vulnerability report** | Any 2xx for a request that should be refused prints a **CRITICAL** report to the console, writes `target/reports/vulnerability-report.json` and fails the test. `-Dmode=insecure` turns verification off to prove it fires. |
| **Every other check** | Exact and case-variant replay (`REPLAY_DETECTED`), stale/future timestamp (`TIMESTAMP_EXPIRED`), stale and forged chain head (`CHAIN_BROKEN`), re-serialised JSON and a signature for another booking (`SIGNATURE_MISMATCH`), and missing headers. |

---

## Run it

Needs a JDK 21+ only (developed and run on JDK 24). The Maven Wrapper downloads Maven 3.9.16 and
checks its SHA-256. The gateway starts in-process on a random free port, so nothing else needs to be
running.

```bash
./mvnw test                  # macOS / Linux / Git Bash
mvnw.cmd test                # Windows cmd / PowerShell
```

| Command | What it does |
|---|---|
| `./mvnw test` | 22 tests against the secure gateway. Ends with the **Q2 EVIDENCE SUMMARY** (gateway mode, every test with its measured numbers, vulnerability count). |
| `./mvnw test -Dmode=insecure` | **Negative control.** The same suite against a gateway that skips verification. Expected result: 12 CRITICAL reports, `target/reports/vulnerability-report.json` with 12 findings, and `BUILD FAILURE`. |
| `./mvnw test -Dtest=TamperedReplayTest` | Only the 300 ms replay test. |

When a test fails, every HTTP exchange of that test (method, URI, auth headers, body, status, response,
duration) is printed by the RestAssured capture filter. A green run stays quiet.

---

## Why a local mock and not restful-booker.herokuapp.com

The PDF notes that public restful-booker does not do HMAC. [`BookingServer`](src/main/java/bookinggateway/server/BookingServer.java)
keeps restful-booker's resource shape (`/booking`, `firstname`, `totalprice`, `bookingdates`, …). It adds
the signature checks and an audit log that records when each request arrived and when its response left,
using `System.nanoTime`. The audit log lets the test read *when the replay arrived* from the gateway
itself.

| Endpoint | Behaviour |
|---|---|
| `POST /booking` | Stores the body and returns `{bookingid: "bk_<uuid>", booking, version: 0, chainHead: <genesis>}` |
| `GET /booking/{id}` | The current booking, version and chain head |
| `PUT /booking/{id}` | Verified (below), then applied: `version++` and the chain head advances |

### What gets signed

```
X-Signature-Auth = hex( HMAC-SHA256( secret, rawBodyBytes ‖ entityId ‖ unixTimestamp ) )
X-Timestamp      = unixTimestamp        (decimal seconds; the same value that was signed)
X-Chain-Head     = the booking's current chain head
```

- The client signs the **exact String it sends**. The gateway verifies `ctx.bodyAsBytes()`, the bytes
  that actually arrived, and never a re-parsed copy.
- The secret is 32 random bytes. The test passes it straight to the gateway and to the client signer
  (the out-of-band channel). It never crosses HTTP.

### Verification order (first failure wins)

Implemented in [`RequestVerifier`](src/main/java/bookinggateway/server/RequestVerifier.java):

| # | Check | Rejection |
|---|---|---|
| 0 | All three headers present, timestamp is a number | 400 `MISSING_AUTH_HEADERS` / `MALFORMED_TIMESTAMP` |
| 1 | **Freshness**: `|now − ts| ≤ 30 s` | 401 `TIMESTAMP_EXPIRED` |
| 2 | **Signature** over the raw bytes + id + ts. Compared with `MessageDigest.isEqual`, which is constant-time | 401 `SIGNATURE_MISMATCH` |
| 3 | **Single use**: signature not seen before (ConcurrentHashMap `putIfAbsent`; entries older than the window are evicted) | 409 `REPLAY_DETECTED` |
| 4 | **Hash chain**: `X-Chain-Head` equals the current head. The next head is `SHA-256(previous head ‖ body)` | 409 `CHAIN_BROKEN` |

Why this order:

- Freshness first, because it is the cheapest check.
- Authenticity next, so that only requests signed with the key can reach the nonce store, and so a forged
  request can't use up a real signature.
- Replay after that.
- The chain last, because it is about the order between requests that are already valid.

The PUT handler holds the booking's lock from check to update. Two valid requests can't both pass the
chain check against the same head.

---

## Spec → implementation traceability

| PDF requirement | Implementation | Evidence in the run |
|---|---|---|
| Local mock gateway with custom signature validation | [`server/`](src/main/java/bookinggateway/server): Javalin 6, started in `@BeforeAll` on port 0 and stopped in `@AfterAll` ([`GatewayTestBase`](src/test/java/bookinggateway/tests/GatewayTestBase.java)) | Random port in every request URI |
| **Dynamic execution chaining**: POST, capture the unique entity string from the JSON body | `createBooking()` → `response.jsonPath().getString("bookingid")` | `SignedChainTest`: two ids matching `bk_<uuid>`, different from each other |
| **Cryptographic header injection**: `X-Signature-Auth` = HMAC-SHA256(body text + entity + live Unix timestamp), computed at runtime | [`Signer`](src/main/java/bookinggateway/crypto/Signer.java) (`javax.crypto.Mac`); `sign(id, body, nowSeconds(), head)` just before each PUT | `SignedChainTest` prints the signature and statuses `200, 200`. `SignerTest` checks the RFC 4231 known answer, the exact message layout, and binding to the entity and timestamp |
| (title) **Token chaining** | `X-Chain-Head` hash chain ([`Hashes`](src/main/java/bookinggateway/crypto/Hashes.java)). The client recomputes every head independently | `chain: afd5… -> 6c1e… -> e99e…`, each asserted equal to `SHA-256(prev ‖ body)` |
| **Replay within 300 ms of the first completion** | [`TamperedReplayTest`](src/test/java/bookinggateway/tests/TamperedReplayTest.java): `@ParameterizedTest` at 0 / 150 / 299 ms. Dispatched by a `ScheduledThreadPoolExecutor` relative to the `System.nanoTime` taken when the first PUT returned | `replay dispatched: +299.000 ms (lateness 0.000 ms)`. Asserts `offset ≤ delay ≤ 300 ms` |
| …body modified by a single character | `Payloads.tamperOneCharacter`: the leading digit of `totalprice` | Asserts exactly 1 differing character: `body[51] '2' -> '3'` |
| …passing the original `X-Signature-Auth` and original timestamp | The replay reuses the captured `SignedRequest` unchanged | Shown in the failure dump: same three header values on both PUTs |
| **Assertion layer**: gateway identifies the mismatch and rejects with a documented error | `assertRejected(…, ErrorCode.SIGNATURE_MISMATCH)` checks the exact status *and* error code. `assertBookingIs` checks the stored booking, version and head did not change | `response: 401 SIGNATURE_MISMATCH` ×3 |
| **On 200 OK: log a critical token-validation vulnerability report to the console** | [`VulnerabilityReporter`](src/test/java/bookinggateway/reporting/VulnerabilityReporter.java): CRITICAL banner (attack, expected vs actual, signed vs sent body, signature, timestamp, timing) + JSON file, then `fail()` | `-Dmode=insecure`: 12 banners, `vulnerabilities: 12 CRITICAL`, report path |
| No static sleeps | Timing comes from the scheduler and `System.nanoTime`. [`NoSleepPolicyTest`](src/test/java/bookinggateway/tests/NoSleepPolicyTest.java) scans `src/` and self-checks its pattern | `scanned: 25 .java files, 0 sleep calls` |
| (extra) Exact replay, case-variant replay | Nonce store | `409 REPLAY_DETECTED` ×2 |
| (extra) Timestamp expiration | Freshness check, ±120 s | `401 TIMESTAMP_EXPIRED` ×2 |
| (extra) Out-of-order / forged chain | Chain check | `409 CHAIN_BROKEN` ×2 |
| (extra) Raw bytes are what's signed; the signature is bound to the entity | One extra space in the JSON; a signature made for another booking | `401 SIGNATURE_MISMATCH` ×2 |

---

## Design decisions and trade-offs

- **Sign and send one String.** `Payloads` builds compact JSON text and the same String goes into both
  the signature and `.body(...)`. Nothing is re-serialised in between. The re-serialised-body test shows
  that one extra space breaks the signature, so this matters.
- **The replay is fully built before the original is sent.** The tampered body and the prepared
  RestAssured request (`BookingClient.preparePut`) are ready in advance. The window then contains only
  scheduling, with no test work inside it. The main thread waits on the future during the window.
- **Coarse wait, then a spin to the exact nanosecond.** On Windows, a timed wait may wake up to one
  timer tick (~15.6 ms) late. An early run measured 305 ms for the 299 ms case. So the executor wakes
  20 ms early and the task spins with `Thread.onSpinWait()` until the due `nanoTime`. That isn't a sleep,
  and it brings the 150 and 299 ms lateness down to at most 0.364 ms across 13 runs.
- **The gateway reports when the replay arrived.** "Dispatched" is the client's clock; "reached gateway"
  comes from the gateway's audit log (same JVM, same `nanoTime` clock). Both are printed for every replay,
  so the cost of sending the request is visible, not hidden (see *Interpretations* 1).
- **Exact error codes, not "any 4xx".** Each rejection test asserts the specific code. A gateway that
  rejected the tampered replay for the *wrong* reason (e.g. `TIMESTAMP_EXPIRED` because a clock was
  off) would fail the test.
- **Rejection also checks state.** After every refused request, a GET confirms the booking's body,
  version and chain head are unchanged. A gateway that "rejects" but still applies the write would fail.
- **The case-variant replay uses an attacker-computable chain head.** The current head is
  `SHA-256(old head ‖ body)`, which anyone holding one captured request/response can compute. So the
  test presents the *current* head with the signature upper-cased. That leaves the nonce store as the
  only guard, and it proves the signature is canonicalised (trim + lowercase) before the nonce lookup.
- **The summary is a JUnit `TestExecutionListener`** registered through `META-INF/services`, so it runs
  under Surefire without extra configuration. Tests add their measured numbers with `Evidence.put`. The
  listener also clears the previous run's vulnerability report when a run starts.
- **`-Dmode=insecure` is a real negative control.** The same tests run unchanged against a gateway that
  skips verification, and the reporter has to fire. That shows the assertions tell the two modes apart
  instead of passing in both.

## Interpretations (where the brief was ambiguous)

1. **"Within exactly 300 ms of the first completion"** is read as: the replay is **re-submitted no more
   than 300 ms after the client received the complete first response**.
   - "Re-submitted" means the moment the request is handed to the HTTP client (`nanoTime` inside the
     scheduled task), and the test asserts `offset ≤ that ≤ 300 ms`.
   - Arrival at the gateway is reported as well. RestAssured needs 8–44 ms to build and send a request,
     so across 13 runs the 299 ms replay reached the gateway at **308.9–338.5 ms**.
   - I tried reusing one HTTP client instance (keep-alive) to shorten that; it made no difference.
   - The verdict doesn't depend on the timing: the timestamp is still fresh, so the only thing that can
     reject the request is the signature, and it does.
2. **"Unique entity string"**: the gateway returns a string id `bk_<uuid>` (restful-booker uses a number).
3. **"Live Unix timestamp token"**: decimal Unix seconds. They are part of the signed message and sent in
   `X-Timestamp`, because the gateway needs the value to verify the signature.
4. **"A single character"**: the leading digit of `totalprice` (250 → 350). The JSON stays valid and the
   length stays the same, so only the signature can catch it, and it is a change that matters (price).
5. **Which rejection**: the PDF allows a signature mismatch *or* a timestamp expiration. Within 300 ms the
   timestamp is fresh, so the correct and asserted answer is **401 `SIGNATURE_MISMATCH`**. Expiration is
   tested separately at ±120 s.
6. **Javalin instead of WireMock/Mockoon/Express**: the PDF lists those as examples. An in-process Java
   server keeps the run to one command, gives the test the gateway's own timing data, and puts the
   verification logic in readable code.

---

## Evidence from a real run

Output of `./mvnw test`, `mvnw.cmd test` and `./mvnw test -Dmode=insecure` is in [`EVIDENCE.md`](EVIDENCE.md).

---

## Video checklist (output → source → AI prompt history)

1. **Output**
   - Run `./mvnw test`. Point out in the **Q2 EVIDENCE SUMMARY**:
     - the chained ids and signatures
     - the three replays (`dispatched +0 / +150 / +299 ms`, `reached gateway`, `401 SIGNATURE_MISMATCH`)
     - every other rejection code
     - `vulnerabilities: 0`
   - Run `./mvnw test -Dmode=insecure`. Scroll to a **CRITICAL** banner: signed body vs sent body (250 vs
     350), `HTTP 200`. Show the HTTP exchange dump that follows it, then open
     `target/reports/vulnerability-report.json`.
2. **Source walkthrough**, in this order:
   - `crypto/Signer.java` → `server/RequestVerifier.java` (the ordered checks) → `server/BookingServer.java`
   - `tests/GatewayTestBase.java` → `TamperedReplayTest.java` (scheduler, spin, nanoTime) → `GatewayRejectionTest.java`
   - `reporting/VulnerabilityReporter.java` → `reporting/EvidenceSummaryListener.java`
3. **AI prompt history.** Show the prompts used to build and review this.

## Layout

```
q2/
  mvnw, mvnw.cmd, .mvn/wrapper/       Maven Wrapper 3.3.4 (only-script), Maven 3.9.16 pinned by SHA-256
  pom.xml                             Java 21, Javalin 6.7, Jackson, JUnit 5.14, RestAssured 5.5
  src/main/java/bookinggateway/
    crypto/       Signer (HMAC-SHA256, constant-time verify), Hashes (genesis, chain head)
    server/       BookingServer, RequestVerifier, NonceStore, ErrorCode, GatewayMode, AuditEntry
  src/test/java/bookinggateway/
    client/       ApiSpec (shared RequestSpecification), BookingClient, Payloads, SignedRequest
    reporting/    CapturingFilter, ExchangeLog, ExchangeLogOnFailure, Evidence,
                  VulnerabilityReporter, EvidenceSummaryListener
    tests/        GatewayTestBase, SignerTest, SignedChainTest, TamperedReplayTest,
                  GatewayRejectionTest, NoSleepPolicyTest
  src/test/resources/                 ServiceLoader registration, slf4j-simple at warn
```
