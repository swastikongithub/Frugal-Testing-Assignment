# Outcome justification (Q1 d)

The classifier sees only UI signals: receipt, error boundary, toast and tagged error log. It never sees the parser mode. Results from the clean-install run (boundary/toast/log):

- **Control `"500"`:** CLEAN in both modes (0/0/0, receipt 500). Strict parsing blocks nothing valid.
- **`"0x1F4"`, strict:** the server stored `"0x1F4"`. Signals 1/1/1, no receipt → **SECURE_FALLBACK**.
- **`"0x1F4"`, `?unsafe=1`:** identical stored bytes, but the receipt shows **500** with 0/0/0 → **SILENT_FAILURE**.
- **`"500.000001"`:** strict 1/1/1 → SECURE_FALLBACK. Unsafe shows 500.000001 with 0/0/0 → SILENT_FAILURE.
- **Unquoted `0x1F4`:** the gateway returned 400 INVALID_JSON in both modes (0/1/1) → SECURE_FALLBACK, even unsafe.

The same server-side bytes produced opposite verdicts. Each verdict followed the signals rather than the mode. So the assertions tell a secure fallback apart from a silent failure.
