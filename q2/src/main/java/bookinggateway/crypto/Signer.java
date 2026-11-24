package bookinggateway.crypto;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * X-Signature-Auth = hex( HMAC-SHA256( secret, rawBody || entityId || unixTimestamp ) ).
 *
 * <p>The signed message is built from raw bytes, not from a parsed or re-serialised body, so
 * the client and the gateway must agree on the exact text that went over the wire. Changing a
 * single byte, even whitespace, changes the signature.
 */
public final class Signer {

    private static final String ALGORITHM = "HmacSHA256";
    private static final HexFormat HEX = HexFormat.of();

    private final SecretKeySpec key;

    public Signer(byte[] secret) {
        if (secret == null || secret.length < 32) {
            throw new IllegalArgumentException("HMAC-SHA256 secret must be at least 32 bytes");
        }
        this.key = new SecretKeySpec(secret.clone(), ALGORITHM);
    }

    /** Client side: sign the exact body String that will be sent. */
    public String sign(String rawBody, String entityId, long unixTimestamp) {
        return sign(rawBody.getBytes(StandardCharsets.UTF_8), entityId, unixTimestamp);
    }

    /** Gateway side: sign the exact bytes that arrived. */
    public String sign(byte[] rawBody, String entityId, long unixTimestamp) {
        return hmacHex(signedMessage(rawBody, entityId, unixTimestamp));
    }

    /** Plain HMAC-SHA256 of a message, hex encoded (used by the RFC 4231 known-answer test). */
    public String hmacHex(byte[] message) {
        return HEX.formatHex(mac(message));
    }

    /** Constant-time check of a hex signature against the expected one. */
    public boolean verify(byte[] rawBody, String entityId, long unixTimestamp, String presentedHex) {
        byte[] presented;
        try {
            presented = HEX.parseHex(presentedHex.trim().toLowerCase());
        } catch (IllegalArgumentException notHex) {
            return false;
        }
        byte[] expected = mac(signedMessage(rawBody, entityId, unixTimestamp));
        return MessageDigest.isEqual(expected, presented);
    }

    /** rawBody bytes, then entityId (UTF-8), then the decimal timestamp (UTF-8), with no separators. */
    public static byte[] signedMessage(byte[] rawBody, String entityId, long unixTimestamp) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(rawBody.length + 64);
        out.writeBytes(rawBody);
        out.writeBytes(entityId.getBytes(StandardCharsets.UTF_8));
        out.writeBytes(Long.toString(unixTimestamp).getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    private byte[] mac(byte[] message) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            return mac.doFinal(message);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
