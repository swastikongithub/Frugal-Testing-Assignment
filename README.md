# Frugal Testing · AI-Native Software Engineer Intern · Section A

Three self-contained folders, one per question. Each one installs, runs and reports on its own. Each
README has the run commands, a spec → implementation traceability table, design decisions,
interpretations of ambiguous parts of the brief, and the video checklist. Each `EVIDENCE.md` holds
console output copied from real runs.

| | Question | Stack | Run (inside the folder) | Recorded result |
|---|---|---|---|---|
| [`q1/`](q1/README.md) | Event-loop starvation & state-drift visual regressions | TypeScript, Playwright, React, Express | `npm install && npx playwright install chromium && npm test` | 14/14 passed ([evidence](q1/EVIDENCE.md)) |
| [`q2/`](q2/README.md) | Cryptographic token chaining & dynamic replay attacks | Java 21, JUnit 5, RestAssured, Javalin | `./mvnw test` (Windows: `mvnw.cmd test`) | 22/22 passed; `-Dmode=insecure` gives 12 CRITICAL and `BUILD FAILURE`, as intended ([evidence](q2/EVIDENCE.md)) |
| [`q3/`](q3/README.md) | Dynamic micro-frontend shadow DOM piercing & semantic prompt architecture | TypeScript, Playwright, vanilla JS | `npm install && npx playwright install chromium && npm test` | 18 passed, 1 skipped (the slot for another model's answer). The demo has the brief's structure, including the iframe nested in the closed root. The CoT prompt was run on Claude Haiku, Sonnet and Opus 5.5, three times each: 6/9 answers work on 5 fresh loads, all identical to the hand-written reference, and the other 3 are caught by the validator or on the live page ([evidence](q3/EVIDENCE.md)) |

Requirements: Node.js 20+ for `q1/` and `q3/`, and a JDK 21+ for `q2/`. The Maven Wrapper downloads
Maven itself. Each suite starts the local server it needs (`q3/` reuses one already running on its
port unless `CI` is set), and every run ends with an evidence summary printed to the console.

The Section B technical article (Q21, Topic A) is in [`Q21-article.md`](Q21-article.md).

`q1/` and `q2/` test a local mock of the system the brief names; each README explains why under *Why a
local mock*. `q3/` ships its own randomised demo micro-frontend, described under *The demo
micro-frontend*.
