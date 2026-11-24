# Q2 · Evidence from real runs

Every block below is copied from a real run's console output; nothing was typed by hand. The only
edit: absolute paths are shortened to `<repo>\` (the repository folder).

Environment: Windows 11, Oracle JDK 24 (compiled with `--release 21`), Maven 3.9.16 via the wrapper.
The secure and insecure runs are on commit `21117dc`. The `mvnw.cmd` run and the stability loop ran
one commit earlier (`6089e25`). The only difference is the label `200 ACCEPTED` vs `200 null` in the
insecure summary.

---

## 1. `./mvnw clean test` (secure gateway)

```text
====================================================================================================
Q2 EVIDENCE SUMMARY  -  HMAC replay gateway
====================================================================================================
gateway mode       : secure
tests              : 22/22 passed  (14.5 s)

GatewayRejectionTest
  PASS PUT without auth headers is rejected with 400 MISSING_AUTH_HEADERS
      response: 400 MISSING_AUTH_HEADERS
  PASS same JSON with one extra space is rejected with 401 SIGNATURE_MISMATCH (raw bytes are signed)
      response: 401 SIGNATURE_MISMATCH
  PASS fresh signed PUT with a forged chain head is rejected with 409 CHAIN_BROKEN
      response: 409 CHAIN_BROKEN
  PASS replay with the signature in upper case and the current chain head is still REPLAY_DETECTED
      presented head: current head, computed offline as SHA-256(old head || body)
      response: 409 REPLAY_DETECTED
  PASS signature made for another booking is rejected with 401 SIGNATURE_MISMATCH
      response: 401 SIGNATURE_MISMATCH
  PASS exact replay of an accepted PUT is rejected with 409 REPLAY_DETECTED
      response: 409 REPLAY_DETECTED
  PASS fresh signed PUT that presents the previous chain head is rejected with 409 CHAIN_BROKEN
      response: 409 CHAIN_BROKEN
  PASS correctly signed PUT outside the freshness window is rejected with 401 TIMESTAMP_EXPIRED timestamp -120 s from now
      window: +/-30 s, skew -120 s
      response: 401 TIMESTAMP_EXPIRED
  PASS correctly signed PUT outside the freshness window is rejected with 401 TIMESTAMP_EXPIRED timestamp 120 s from now
      window: +/-30 s, skew 120 s
      response: 401 TIMESTAMP_EXPIRED

NoSleepPolicyTest
  PASS the forbidden-call pattern detects both sleep forms
  PASS no source file under src/ sleeps
      scanned: 25 .java files, 0 sleep calls

SignedChainTest
  PASS two signed PUTs are accepted and each advances the chain head to SHA-256(prev || body)
      booking: bk_fc30ac09-bd3f-420e-ae19-5133edecc5b2
      signature PUT 1: 112760c30fc180bff479a54cfd154548a2fb212116d136e3e501cd2cc47b6f41
      chain: afd5983bb964... -> 6c1e9a483599... -> e99e289f309f...
      statuses: 200, 200
  PASS POST /booking returns a unique entity id string and the genesis chain head
      ids: bk_edbee1d0-7327-4988-b4a4-43c63ad4c0f0, bk_dd5e7a04-0690-449c-a04b-f98aaed28c6b

SignerTest
  PASS signed message is rawBody || entityId || unixTimestamp, no separators
  PASS HMAC-SHA256 matches RFC 4231 test case 6
      hmac: 60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54
  PASS secrets shorter than 32 bytes are refused
  PASS signature is bound to the entity id and the timestamp
  PASS verify accepts hex in either case and rejects non-hex without throwing
  PASS changing one character of the body changes the signature and fails verification
      changed: index 51 '2' -> '3'
      signatures: a39058aaf73d5f76... vs 7fd3f5f096610733...

TamperedReplayTest
  PASS one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH replay 0 ms after the original
      tamper: body[51] '2' -> '3' (totalprice 250 -> 350), original signature + timestamp reused
      replay dispatched: +16.826 ms after first completion (target 0 ms, lateness 16.826 ms)
      replay reached gateway: +28.878 ms after first completion
      response: 401 SIGNATURE_MISMATCH
  PASS one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH replay 150 ms after the original
      tamper: body[51] '2' -> '3' (totalprice 250 -> 350), original signature + timestamp reused
      replay dispatched: +150.000 ms after first completion (target 150 ms, lateness 0.000 ms)
      replay reached gateway: +161.005 ms after first completion
      response: 401 SIGNATURE_MISMATCH
  PASS one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH replay 299 ms after the original
      tamper: body[51] '2' -> '3' (totalprice 250 -> 350), original signature + timestamp reused
      replay dispatched: +299.000 ms after first completion (target 299 ms, lateness 0.000 ms)
      replay reached gateway: +310.568 ms after first completion
      response: 401 SIGNATURE_MISMATCH

vulnerabilities    : 0  (no tampered or replayed request was accepted)
====================================================================================================
[INFO] Tests run: 22, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  27.218 s
```

## 2. `mvnw.cmd clean test` (Windows PowerShell)

The same suite through the Windows wrapper (lines filtered from the full log):

```text
tests              : 22/22 passed  (13.9 s)
      replay dispatched: +8.441 ms after first completion (target 0 ms, lateness 8.441 ms)
      replay reached gateway: +16.773 ms after first completion
      replay dispatched: +150.031 ms after first completion (target 150 ms, lateness 0.031 ms)
      replay reached gateway: +162.657 ms after first completion
      replay dispatched: +299.000 ms after first completion (target 299 ms, lateness 0.000 ms)
      replay reached gateway: +308.872 ms after first completion
vulnerabilities    : 0  (no tampered or replayed request was accepted)
[INFO] Tests run: 22, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  32.915 s
```

## 3. `./mvnw clean test -Dmode=insecure` (negative control)

Verification is switched off, and the same tests run unchanged. Every request that should be refused
gets `200`, the reporter fires 12 times and the build fails, as intended.

```text
Q2 EVIDENCE SUMMARY  -  HMAC replay gateway
====================================================================================================
gateway mode       : insecure
tests              : 10/22 passed  (15.8 s)

GatewayRejectionTest
  FAIL PUT without auth headers is rejected with 400 MISSING_AUTH_HEADERS
      response: 200 ACCEPTED
  FAIL same JSON with one extra space is rejected with 401 SIGNATURE_MISMATCH (raw bytes are signed)
      response: 200 ACCEPTED
  FAIL fresh signed PUT with a forged chain head is rejected with 409 CHAIN_BROKEN
      response: 200 ACCEPTED
  FAIL replay with the signature in upper case and the current chain head is still REPLAY_DETECTED
      presented head: current head, computed offline as SHA-256(old head || body)
      response: 200 ACCEPTED
  FAIL signature made for another booking is rejected with 401 SIGNATURE_MISMATCH
      response: 200 ACCEPTED
  FAIL exact replay of an accepted PUT is rejected with 409 REPLAY_DETECTED
      response: 200 ACCEPTED
  FAIL fresh signed PUT that presents the previous chain head is rejected with 409 CHAIN_BROKEN
      response: 200 ACCEPTED
  FAIL correctly signed PUT outside the freshness window is rejected with 401 TIMESTAMP_EXPIRED timestamp -120 s from now
      window: +/-30 s, skew -120 s
      response: 200 ACCEPTED
  FAIL correctly signed PUT outside the freshness window is rejected with 401 TIMESTAMP_EXPIRED timestamp 120 s from now
      window: +/-30 s, skew 120 s
      response: 200 ACCEPTED

NoSleepPolicyTest
  PASS the forbidden-call pattern detects both sleep forms
  PASS no source file under src/ sleeps
      scanned: 25 .java files, 0 sleep calls

SignedChainTest
  PASS two signed PUTs are accepted and each advances the chain head to SHA-256(prev || body)
      booking: bk_31539b6f-501d-4246-b88f-5cfa5045fd55
      signature PUT 1: 9805af98433f392116a285492f7016f1a574ed72a272b460cb3ae9c30e45f38e
      chain: 86111507527f... -> eb063df308df... -> e807905651ad...
      statuses: 200, 200
  PASS POST /booking returns a unique entity id string and the genesis chain head
      ids: bk_6292e322-46ef-4f22-adcc-dc8384518bdd, bk_f2313446-b4e5-4016-8cdf-c58e37ccd8ea

SignerTest
  PASS signed message is rawBody || entityId || unixTimestamp, no separators
  PASS HMAC-SHA256 matches RFC 4231 test case 6
      hmac: 60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54
  PASS secrets shorter than 32 bytes are refused
  PASS signature is bound to the entity id and the timestamp
  PASS verify accepts hex in either case and rejects non-hex without throwing
  PASS changing one character of the body changes the signature and fails verification
      changed: index 51 '2' -> '3'
      signatures: a39058aaf73d5f76... vs 7fd3f5f096610733...

TamperedReplayTest
  FAIL one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH replay 0 ms after the original
      tamper: body[51] '2' -> '3' (totalprice 250 -> 350), original signature + timestamp reused
      replay dispatched: +5.437 ms after first completion (target 0 ms, lateness 5.437 ms)
      replay reached gateway: +30.802 ms after first completion
      response: 200 ACCEPTED
  FAIL one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH replay 150 ms after the original
      tamper: body[51] '2' -> '3' (totalprice 250 -> 350), original signature + timestamp reused
      replay dispatched: +150.000 ms after first completion (target 150 ms, lateness 0.000 ms)
      replay reached gateway: +176.961 ms after first completion
      response: 200 ACCEPTED
  FAIL one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH replay 299 ms after the original
      tamper: body[51] '2' -> '3' (totalprice 250 -> 350), original signature + timestamp reused
      replay dispatched: +299.102 ms after first completion (target 299 ms, lateness 0.102 ms)
      replay reached gateway: +325.003 ms after first completion
      response: 200 ACCEPTED

vulnerabilities    : 12  CRITICAL
report             : <repo>\q2\target\reports\vulnerability-report.json
====================================================================================================
[ERROR] Tests run: 22, Failures: 12, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
[INFO] Total time:  35.631 s
```

### One CRITICAL report, as printed in the console

It is followed by the HTTP exchange dump of the failed test. The signed body has `totalprice` 250 and
the sent body has 350; both PUTs carry the same signature and timestamp.

```text
####################################################################################################
##  CRITICAL  TOKEN-VALIDATION VULNERABILITY  -  one-character tampered replay (+299 ms)
####################################################################################################
  attack        : replayed a captured PUT 299.1 ms after it completed with one body character changed, reusing its signature and timestamp
  request       : PUT /booking/bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4
  gateway mode  : INSECURE
  expected      : 401 SIGNATURE_MISMATCH
  actual        : HTTP 200  {"bookingid":"bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4","booking":{"firstname":"Jim","lastname":"Brown","totalprice":350,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"},"version":2,"chainHead":"ebf029d63192f71f932600cd103aa254dc0bcb889dbd940e12a8eb20d35fdd6e"}
  signed body   : {"firstname":"Jim","lastname":"Brown","totalprice":250,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"}
  sent body     : {"firstname":"Jim","lastname":"Brown","totalprice":350,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"}
  signature     : 32d596cf246dfb40cdd20bcb542024ac07d208ed9057cbc808e31dbf21368db5
  timestamp     : 1795498055
  evidence      : dispatched +299.102 ms, reached gateway +325.003 ms after first completion
  impact        : The gateway accepted a request its token does not authorise: captured requests can be altered or replayed.
  report file   : <repo>\q2\target\reports\vulnerability-report.json
####################################################################################################

--- HTTP exchanges of failed test 'replay 299 ms after the original' (3) ---
  > POST http://127.0.0.1:49777/booking
  > {"firstname":"Jim","lastname":"Brown","totalprice":111,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-05"},"additionalneeds":"Breakfast"}
  < 200 (25.2 ms) {"bookingid":"bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4","booking":{"firstname":"Jim","lastname":"Brown","totalprice":111,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-05"},"additionalneeds":"Breakfast"},"version":0,"chainHead":"dc817dd427a9246e38d28f7f319e826e01b6feaa4dda20ba7257454c4e6db1a6"}
  > PUT http://127.0.0.1:49777/booking/bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4
  > X-Signature-Auth: 32d596cf246dfb40cdd20bcb542024ac07d208ed9057cbc808e31dbf21368db5
  > X-Timestamp: 1795498055
  > X-Chain-Head: dc817dd427a9246e38d28f7f319e826e01b6feaa4dda20ba7257454c4e6db1a6
  > {"firstname":"Jim","lastname":"Brown","totalprice":250,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"}
  < 200 (23.9 ms) {"bookingid":"bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4","booking":{"firstname":"Jim","lastname":"Brown","totalprice":250,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"},"version":1,"chainHead":"8f1fc2afc67b7cf1779e8208b00bbfb9eac85a489e995142a9b2f285a4dd47b9"}
  > PUT http://127.0.0.1:49777/booking/bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4
  > X-Signature-Auth: 32d596cf246dfb40cdd20bcb542024ac07d208ed9057cbc808e31dbf21368db5
  > X-Timestamp: 1795498055
  > X-Chain-Head: dc817dd427a9246e38d28f7f319e826e01b6feaa4dda20ba7257454c4e6db1a6
  > {"firstname":"Jim","lastname":"Brown","totalprice":350,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"}
  < 200 (24.3 ms) {"bookingid":"bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4","booking":{"firstname":"Jim","lastname":"Brown","totalprice":350,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-07"},"additionalneeds":"Late checkout"},"version":2,"chainHead":"ebf029d63192f71f932600cd103aa254dc0bcb889dbd940e12a8eb20d35fdd6e"}
--- end of exchanges ---
```

### The same finding in `target/reports/vulnerability-report.json`

The file holds all 12 findings; this is the +299 ms one.

```json
{
  "severity": "CRITICAL",
  "attempt": {
    "title": "one-character tampered replay (+299 ms)",
    "attack": "replayed a captured PUT 299.1 ms after it completed with one body character changed, reusing its signature and timestamp",
    "request": "PUT /booking/bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4",
    "gatewayMode": "INSECURE",
    "expected": "401 SIGNATURE_MISMATCH",
    "actualStatus": 200,
    "actualBody": "{\"bookingid\":\"bk_04b4a987-15d7-4d60-b16e-012f2d33d2d4\",\"booking\":{\"firstname\":\"Jim\",\"lastname\":\"Brown\",\"totalprice\":350,\"depositpaid\":true,\"bookingdates\":{\"checkin\":\"2026-12-01\",\"checkout\":\"2026-12-07\"},\"additionalneeds\":\"Late checkout\"},\"version\":2,\"chainHead\":\"ebf029d63192f71f932600cd103aa254dc0bcb889dbd940e12a8eb20d35fdd6e\"}",
    "signedBody": "{\"firstname\":\"Jim\",\"lastname\":\"Brown\",\"totalprice\":250,\"depositpaid\":true,\"bookingdates\":{\"checkin\":\"2026-12-01\",\"checkout\":\"2026-12-07\"},\"additionalneeds\":\"Late checkout\"}",
    "sentBody": "{\"firstname\":\"Jim\",\"lastname\":\"Brown\",\"totalprice\":350,\"depositpaid\":true,\"bookingdates\":{\"checkin\":\"2026-12-01\",\"checkout\":\"2026-12-07\"},\"additionalneeds\":\"Late checkout\"}",
    "signature": "32d596cf246dfb40cdd20bcb542024ac07d208ed9057cbc808e31dbf21368db5",
    "timestamp": 1795498055,
    "evidence": "dispatched +299.102 ms, reached gateway +325.003 ms after first completion"
  },
  "impact": "The gateway accepted a request its token does not authorise: captured requests can be altered or replayed.",
  "detectedAt": "2026-11-24T05:27:36.401200900Z"
}
```

## 4. Stability: `TamperedReplayTest` × 10

Ten separate Maven runs of the replay test (30 replays). All 30 were rejected with
`401 SIGNATURE_MISMATCH`, and the dispatch assertion (`offset ≤ dispatch ≤ 300 ms`) held every time.

| run | target ms | dispatched ms | lateness ms | reached gateway ms | response |
|---|---|---|---|---|---|
| 1 | 0 | 4.887 | 4.887 | 42.006 | 401 SIGNATURE_MISMATCH |
| 1 | 150 | 150.001 | 0.000 | 183.192 | 401 SIGNATURE_MISMATCH |
| 1 | 299 | 299.073 | 0.073 | 332.770 | 401 SIGNATURE_MISMATCH |
| 2 | 0 | 3.965 | 3.965 | 47.582 | 401 SIGNATURE_MISMATCH |
| 2 | 150 | 150.000 | 0.000 | 186.546 | 401 SIGNATURE_MISMATCH |
| 2 | 299 | 299.000 | 0.000 | 337.741 | 401 SIGNATURE_MISMATCH |
| 3 | 0 | 8.061 | 8.061 | 19.071 | 401 SIGNATURE_MISMATCH |
| 3 | 150 | 150.047 | 0.047 | 166.778 | 401 SIGNATURE_MISMATCH |
| 3 | 299 | 299.000 | 0.000 | 320.220 | 401 SIGNATURE_MISMATCH |
| 4 | 0 | 17.878 | 17.878 | 36.824 | 401 SIGNATURE_MISMATCH |
| 4 | 150 | 150.042 | 0.042 | 174.246 | 401 SIGNATURE_MISMATCH |
| 4 | 299 | 299.000 | 0.000 | 321.696 | 401 SIGNATURE_MISMATCH |
| 5 | 0 | 16.979 | 16.979 | 28.893 | 401 SIGNATURE_MISMATCH |
| 5 | 150 | 150.027 | 0.027 | 166.213 | 401 SIGNATURE_MISMATCH |
| 5 | 299 | 299.000 | 0.000 | 319.814 | 401 SIGNATURE_MISMATCH |
| 6 | 0 | 4.709 | 4.709 | 37.120 | 401 SIGNATURE_MISMATCH |
| 6 | 150 | 150.001 | 0.000 | 193.158 | 401 SIGNATURE_MISMATCH |
| 6 | 299 | 299.000 | 0.000 | 334.781 | 401 SIGNATURE_MISMATCH |
| 7 | 0 | 4.095 | 4.095 | 42.636 | 401 SIGNATURE_MISMATCH |
| 7 | 150 | 150.001 | 0.000 | 186.675 | 401 SIGNATURE_MISMATCH |
| 7 | 299 | 299.364 | 0.364 | 338.522 | 401 SIGNATURE_MISMATCH |
| 8 | 0 | 16.697 | 16.697 | 36.293 | 401 SIGNATURE_MISMATCH |
| 8 | 150 | 150.036 | 0.036 | 169.394 | 401 SIGNATURE_MISMATCH |
| 8 | 299 | 299.000 | 0.000 | 317.987 | 401 SIGNATURE_MISMATCH |
| 9 | 0 | 7.094 | 7.094 | 21.514 | 401 SIGNATURE_MISMATCH |
| 9 | 150 | 150.067 | 0.067 | 168.256 | 401 SIGNATURE_MISMATCH |
| 9 | 299 | 299.000 | 0.000 | 323.252 | 401 SIGNATURE_MISMATCH |
| 10 | 0 | 18.481 | 18.481 | 40.069 | 401 SIGNATURE_MISMATCH |
| 10 | 150 | 150.041 | 0.041 | 173.430 | 401 SIGNATURE_MISMATCH |
| 10 | 299 | 299.000 | 0.000 | 326.613 | 401 SIGNATURE_MISMATCH |

| target | dispatched | reached gateway |
|---|---|---|
| 0 ms | 3.965–18.481 | 19.071–47.582 |
| 150 ms | 150.000–150.067 | 166.213–193.158 |
| 299 ms | 299.000–299.364 | 317.987–338.522 |

The 0 ms case can't be early, only late (the replay is scheduled the moment the first PUT returns). Its
lateness is the scheduler handing the task to its thread. "Reached gateway" comes from the gateway's
own audit log. The difference between it and "dispatched" is RestAssured building and sending the
request (see README, *Interpretations* 1).

---

## 5. What the runs caught while building this

- **Test work inside the window.** In the first version, the 0 ms replay went out **47.9 ms** late. The
  test parsed the first response with JsonPath and built the tampered body *after* the first PUT
  returned. Both now happen before the original is sent, and the main thread only waits during the
  window.
- **Windows timer granularity.** Once the main thread had work during the window, the 299 ms replay was
  dispatched at **305.255 ms** and the test failed. The scheduler now wakes 20 ms early and spins
  (`Thread.onSpinWait`) to the due `nanoTime`. Since then, 299 ms dispatches have been 299.000–299.364 ms.
- **Keep-alive does not help.** Reusing one HTTP client instance was tried to cut RestAssured's send
  cost. The 299 ms replay then reached the gateway at 352.1 and 336.2 ms, no better, so it was reverted.
- **A suspected replay bypass that wasn't one.** The verifier compared signatures case-insensitively but
  passed the raw header to the nonce store. I suspected an upper-cased replay could slip past it.
  `caseVariantReplay` presents the attacker-computable current chain head, so only the nonce store can
  stop the request. Run against the earlier verifier, it **still passed**, because `NonceStore` already
  lowercases its keys. The verifier's own canonicalisation (commit `fb40b04`) is therefore redundant,
  not a fix. It is kept so one canonical form is used visibly for both checks, and the test stays as a
  regression guard.
