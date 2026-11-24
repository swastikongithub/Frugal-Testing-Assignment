package bookinggateway.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;

import bookinggateway.client.Payloads;
import bookinggateway.client.SignedRequest;
import bookinggateway.crypto.Hashes;
import bookinggateway.reporting.Evidence;
import bookinggateway.server.BookingServer;
import bookinggateway.server.ErrorCode;
import io.restassured.response.Response;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Each verification step on its own: replay, freshness, hash chain, raw-byte signing, entity binding, headers. */
class GatewayRejectionTest extends GatewayTestBase {

    private static final String UPDATE = Payloads.booking(250, "2026-12-07", "Late checkout");

    /** A booking with one accepted signed PUT, as an attacker would have observed it. */
    private record Accepted(Created booking, SignedRequest auth, String head) {}

    private static Accepted acceptedUpdate() {
        Created booking = createBooking();
        SignedRequest auth = sign(booking.id(), UPDATE, nowSeconds(), booking.chainHead());
        Response response = api.put(booking.id(), UPDATE, auth);
        assertEquals(200, response.statusCode(), "signed PUT");
        return new Accepted(booking, auth, response.jsonPath().getString("chainHead"));
    }

    @Test
    @DisplayName("exact replay of an accepted PUT is rejected with 409 REPLAY_DETECTED")
    void exactReplay() {
        Accepted first = acceptedUpdate();

        Response replay = api.put(first.booking().id(), UPDATE, first.auth());

        assertRejected(new Attack("exact replay", "re-sent an accepted PUT byte for byte, same headers",
                first.booking().id(), UPDATE, UPDATE, first.auth()), replay, ErrorCode.REPLAY_DETECTED,
                "signature already consumed by the accepted PUT");
        assertBookingIs(first.booking().id(), UPDATE, 1, first.head());
    }

    @Test
    @DisplayName("replay with the signature in upper case and the current chain head is still REPLAY_DETECTED")
    void caseVariantReplay() {
        Accepted first = acceptedUpdate();
        // Everything here is computable from one captured request/response: the same signature
        // re-cased, and the current head = SHA-256(old head || body). Only the nonce store can stop it.
        SignedRequest variant = new SignedRequest(
                first.auth().signature().toUpperCase(Locale.ROOT), first.auth().timestamp(),
                Hashes.nextHead(first.booking().chainHead(), UPDATE));
        assertEquals(first.head(), variant.chainHead(), "attacker-computed head is the current head");
        Evidence.put("presented head", "current head, computed offline as SHA-256(old head || body)");

        Response replay = api.put(first.booking().id(), UPDATE, variant);

        assertRejected(new Attack("case-variant replay", "re-sent an accepted PUT with its signature upper-cased and the"
                        + " chain head advanced to the current value", first.booking().id(), UPDATE, UPDATE, variant),
                replay, ErrorCode.REPLAY_DETECTED, "same HMAC, different spelling of the hex");
        assertBookingIs(first.booking().id(), UPDATE, 1, first.head());
    }

    @ParameterizedTest(name = "timestamp {0} s from now")
    @ValueSource(longs = {-120, 120})
    @DisplayName("correctly signed PUT outside the freshness window is rejected with 401 TIMESTAMP_EXPIRED")
    void timestampOutsideWindow(long skewSeconds) {
        Created booking = createBooking();
        SignedRequest stale = sign(booking.id(), UPDATE, nowSeconds() + skewSeconds, booking.chainHead());
        Evidence.put("window", "+/-" + BookingServer.FRESHNESS_WINDOW_SECONDS + " s, skew " + skewSeconds + " s");

        Response response = api.put(booking.id(), UPDATE, stale);

        assertRejected(new Attack("timestamp " + skewSeconds + " s", "signed correctly but with a timestamp outside the"
                        + " window", booking.id(), UPDATE, UPDATE, stale), response, ErrorCode.TIMESTAMP_EXPIRED,
                "skew " + skewSeconds + " s");
        assertBookingIs(booking.id(), booking.body(), 0, booking.chainHead());
    }

    @Test
    @DisplayName("fresh signed PUT that presents the previous chain head is rejected with 409 CHAIN_BROKEN")
    void staleChainHead() {
        Accepted first = acceptedUpdate();
        String next = Payloads.booking(275, "2026-12-08", "Airport transfer");
        SignedRequest staleHead = sign(first.booking().id(), next, nowSeconds(), first.booking().chainHead());

        Response response = api.put(first.booking().id(), next, staleHead);

        assertRejected(new Attack("stale chain head", "valid new signature, but built on the genesis head instead of"
                        + " the current one", first.booking().id(), next, next, staleHead), response,
                ErrorCode.CHAIN_BROKEN, "presented genesis, current head is " + first.head());
        assertBookingIs(first.booking().id(), UPDATE, 1, first.head());
    }

    @Test
    @DisplayName("fresh signed PUT with a forged chain head is rejected with 409 CHAIN_BROKEN")
    void forgedChainHead() {
        Created booking = createBooking();
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        SignedRequest forged = sign(booking.id(), UPDATE, nowSeconds(), HexFormat.of().formatHex(random));

        Response response = api.put(booking.id(), UPDATE, forged);

        assertRejected(new Attack("forged chain head", "valid signature, random 32-byte chain head", booking.id(),
                UPDATE, UPDATE, forged), response, ErrorCode.CHAIN_BROKEN, "head never issued by the gateway");
        assertBookingIs(booking.id(), booking.body(), 0, booking.chainHead());
    }

    @Test
    @DisplayName("same JSON with one extra space is rejected with 401 SIGNATURE_MISMATCH (raw bytes are signed)")
    void reformattedBody() {
        Created booking = createBooking();
        SignedRequest auth = sign(booking.id(), UPDATE, nowSeconds(), booking.chainHead());
        String reformatted = Payloads.reformatted(UPDATE);

        Response response = api.put(booking.id(), reformatted, auth);

        assertRejected(new Attack("re-serialised body", "sent the signed JSON with one extra space (same value,"
                        + " different bytes)", booking.id(), UPDATE, reformatted, auth), response,
                ErrorCode.SIGNATURE_MISMATCH, "body " + UPDATE.length() + " -> " + reformatted.length() + " bytes");
        assertBookingIs(booking.id(), booking.body(), 0, booking.chainHead());
    }

    @Test
    @DisplayName("signature made for another booking is rejected with 401 SIGNATURE_MISMATCH")
    void signatureForAnotherEntity() {
        Created victim = createBooking();
        Created other = createBooking();
        SignedRequest forOther = sign(other.id(), UPDATE, nowSeconds(), victim.chainHead());

        Response response = api.put(victim.id(), UPDATE, forOther);

        assertRejected(new Attack("cross-entity signature", "used a signature computed for " + other.id(),
                victim.id(), UPDATE, UPDATE, forOther), response, ErrorCode.SIGNATURE_MISMATCH,
                "entity id is part of the signed message");
        assertBookingIs(victim.id(), victim.body(), 0, victim.chainHead());
    }

    @Test
    @DisplayName("PUT without auth headers is rejected with 400 MISSING_AUTH_HEADERS")
    void missingHeaders() {
        Created booking = createBooking();

        Response response = api.unsignedPut(booking.id(), UPDATE);

        assertRejected(new Attack("unsigned write", "PUT with no signature, timestamp or chain head", booking.id(),
                "(nothing signed)", UPDATE, null), response, ErrorCode.MISSING_AUTH_HEADERS, "no auth headers");
        assertBookingIs(booking.id(), booking.body(), 0, booking.chainHead());
    }
}
