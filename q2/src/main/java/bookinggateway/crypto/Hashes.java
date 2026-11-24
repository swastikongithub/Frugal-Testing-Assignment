package bookinggateway.crypto;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** SHA-256 helpers for the booking hash chain. */
public final class Hashes {

    private static final HexFormat HEX = HexFormat.of();

    private Hashes() {}

    /** Head of a brand-new booking's chain. */
    public static String genesis(String entityId) {
        return sha256Hex(("genesis:" + entityId).getBytes(StandardCharsets.UTF_8));
    }

    /** Next head = SHA-256( previousHead (hex text) || raw body bytes of the accepted update ). */
    public static String nextHead(String previousHead, byte[] rawBody) {
        byte[] prev = previousHead.getBytes(StandardCharsets.UTF_8);
        byte[] message = new byte[prev.length + rawBody.length];
        System.arraycopy(prev, 0, message, 0, prev.length);
        System.arraycopy(rawBody, 0, message, prev.length, rawBody.length);
        return sha256Hex(message);
    }

    public static String nextHead(String previousHead, String rawBody) {
        return nextHead(previousHead, rawBody.getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256Hex(byte[] data) {
        try {
            return HEX.formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
