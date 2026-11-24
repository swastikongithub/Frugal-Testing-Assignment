package bookinggateway.tests;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bookinggateway.client.Payloads;
import bookinggateway.crypto.Signer;
import bookinggateway.reporting.Evidence;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/** The signing primitive on its own: a published known answer, the message layout, and tamper sensitivity. */
@ExtendWith(Evidence.class)
class SignerTest {

    private static final byte[] KEY_131_AA = filled(131, (byte) 0xaa);
    private static final Signer SIGNER = new Signer(filled(32, (byte) 0x0b));

    @Test
    @DisplayName("HMAC-SHA256 matches RFC 4231 test case 6")
    void rfc4231TestCase6() {
        String hex = new Signer(KEY_131_AA)
                .hmacHex("Test Using Larger Than Block-Size Key - Hash Key First".getBytes(StandardCharsets.US_ASCII));
        Evidence.put("hmac", hex);
        assertEquals("60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54", hex);
    }

    @Test
    @DisplayName("signed message is rawBody || entityId || unixTimestamp, no separators")
    void messageLayout() {
        byte[] message = Signer.signedMessage("{\"a\":1}".getBytes(StandardCharsets.UTF_8), "bk_42", 1767225600L);
        assertArrayEquals("{\"a\":1}bk_421767225600".getBytes(StandardCharsets.UTF_8), message);
    }

    @Test
    @DisplayName("changing one character of the body changes the signature and fails verification")
    void oneCharacterChangesTheSignature() {
        Payloads.Tamper tamper = Payloads.tamperOneCharacter(Payloads.booking(250, "2026-12-07", "Late checkout"));
        long ts = 1767225600L;
        String original = SIGNER.sign(tamper.original(), "bk_1", ts);
        String tampered = SIGNER.sign(tamper.tampered(), "bk_1", ts);
        Evidence.put("changed", "index " + tamper.index() + " '" + tamper.from() + "' -> '" + tamper.to() + "'");
        Evidence.put("signatures", original.substring(0, 16) + "... vs " + tampered.substring(0, 16) + "...");

        assertEquals(1, tamper.differingCharacters());
        assertNotEquals(original, tampered);
        assertTrue(SIGNER.verify(tamper.original().getBytes(StandardCharsets.UTF_8), "bk_1", ts, original));
        assertFalse(SIGNER.verify(tamper.tampered().getBytes(StandardCharsets.UTF_8), "bk_1", ts, original));
    }

    @Test
    @DisplayName("signature is bound to the entity id and the timestamp")
    void boundToEntityAndTimestamp() {
        byte[] body = Payloads.initialBooking().getBytes(StandardCharsets.UTF_8);
        String signature = SIGNER.sign(body, "bk_1", 1767225600L);
        assertFalse(SIGNER.verify(body, "bk_2", 1767225600L, signature), "other entity");
        assertFalse(SIGNER.verify(body, "bk_1", 1767225601L, signature), "other timestamp");
    }

    @Test
    @DisplayName("verify accepts hex in either case and rejects non-hex without throwing")
    void hexHandling() {
        byte[] body = Payloads.initialBooking().getBytes(StandardCharsets.UTF_8);
        String signature = SIGNER.sign(body, "bk_1", 1767225600L);
        assertTrue(SIGNER.verify(body, "bk_1", 1767225600L, signature.toUpperCase(Locale.ROOT)));
        assertFalse(SIGNER.verify(body, "bk_1", 1767225600L, "not-hex"));
        assertFalse(SIGNER.verify(body, "bk_1", 1767225600L, signature.substring(2)), "truncated");
    }

    @Test
    @DisplayName("secrets shorter than 32 bytes are refused")
    void shortSecretRefused() {
        assertThrows(IllegalArgumentException.class, () -> new Signer(new byte[31]));
    }

    private static byte[] filled(int length, byte value) {
        byte[] bytes = new byte[length];
        Arrays.fill(bytes, value);
        return bytes;
    }
}
