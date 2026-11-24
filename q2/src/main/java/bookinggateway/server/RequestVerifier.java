package bookinggateway.server;

import bookinggateway.crypto.Signer;
import java.time.Clock;

/**
 * The PUT verification pipeline. Checks run in this order and the first failure wins:
 *
 * <ol>
 *   <li>Headers present and timestamp parseable: 400 MISSING_AUTH_HEADERS / MALFORMED_TIMESTAMP
 *   <li>Timestamp freshness (|now - ts| within the window): 401 TIMESTAMP_EXPIRED
 *   <li>HMAC over the exact raw body bytes + entity id + timestamp, constant-time compare: 401 SIGNATURE_MISMATCH
 *   <li>Single use: the signature must not have been seen before: 409 REPLAY_DETECTED
 *   <li>Hash chain: X-Chain-Head must equal the booking's current head: 409 CHAIN_BROKEN
 * </ol>
 *
 * Why this order: the cheap freshness check first. Then authenticity, so that only
 * requests signed with the key can reach (and consume) the nonce store. Then replay. The
 * chain check comes last because it is about ordering between valid requests.
 */
public final class RequestVerifier {

    public record AuthHeaders(String signature, String timestamp, String chainHead) {}

    private final Signer signer;
    private final NonceStore nonces;
    private final Clock clock;
    private final long windowSeconds;

    public RequestVerifier(Signer signer, NonceStore nonces, Clock clock, long windowSeconds) {
        this.signer = signer;
        this.nonces = nonces;
        this.clock = clock;
        this.windowSeconds = windowSeconds;
    }

    public void verify(String bookingId, byte[] rawBody, AuthHeaders headers, String currentHead) {
        if (isBlank(headers.signature()) || isBlank(headers.timestamp()) || isBlank(headers.chainHead())) {
            throw new GatewayRejection(ErrorCode.MISSING_AUTH_HEADERS, "missing signature, timestamp or chain head");
        }
        long timestamp;
        try {
            timestamp = Long.parseLong(headers.timestamp().trim());
        } catch (NumberFormatException e) {
            throw new GatewayRejection(ErrorCode.MALFORMED_TIMESTAMP, headers.timestamp());
        }

        // 1. Freshness
        long now = clock.instant().getEpochSecond();
        long skew = Math.abs(now - timestamp);
        if (skew > windowSeconds) {
            throw new GatewayRejection(ErrorCode.TIMESTAMP_EXPIRED, "skew " + skew + " s > " + windowSeconds + " s");
        }

        // 2. Authenticity of the exact bytes received
        if (!signer.verify(rawBody, bookingId, timestamp, headers.signature())) {
            throw new GatewayRejection(ErrorCode.SIGNATURE_MISMATCH, "HMAC over " + rawBody.length + " body bytes did not match");
        }

        // 3. Single use
        if (!nonces.markUsed(headers.signature(), timestamp, now)) {
            throw new GatewayRejection(ErrorCode.REPLAY_DETECTED, "signature already consumed");
        }

        // 4. Hash chain continuity
        if (!currentHead.equals(headers.chainHead().trim())) {
            throw new GatewayRejection(ErrorCode.CHAIN_BROKEN, "presented head is not the current head");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
