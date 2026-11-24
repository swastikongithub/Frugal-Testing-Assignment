package bookinggateway.client;

/** The three auth headers of a PUT: X-Signature-Auth, X-Timestamp, X-Chain-Head. */
public record SignedRequest(String signature, long timestamp, String chainHead) {}
