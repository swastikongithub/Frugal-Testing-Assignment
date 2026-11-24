package bookinggateway.server;

/** Documented gateway error responses. Body shape: {"error": CODE, "status": n, "message": "..."} */
public enum ErrorCode {
    MISSING_AUTH_HEADERS(400, "X-Signature-Auth, X-Timestamp and X-Chain-Head are all required"),
    MALFORMED_TIMESTAMP(400, "X-Timestamp must be a Unix timestamp in seconds"),
    TIMESTAMP_EXPIRED(401, "X-Timestamp is outside the freshness window"),
    SIGNATURE_MISMATCH(401, "X-Signature-Auth does not match the exact request bytes"),
    REPLAY_DETECTED(409, "this signature has already been used"),
    CHAIN_BROKEN(409, "X-Chain-Head is not the current head of this booking's hash chain"),
    INVALID_BODY(400, "body must be a JSON object"),
    BOOKING_NOT_FOUND(404, "no booking with this id");

    private final int status;
    private final String message;

    ErrorCode(int status, String message) {
        this.status = status;
        this.message = message;
    }

    public int status() {
        return status;
    }

    public String message() {
        return message;
    }
}
