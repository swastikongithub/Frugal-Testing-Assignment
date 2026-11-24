package bookinggateway.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bookinggateway.client.Payloads;
import bookinggateway.client.SignedRequest;
import bookinggateway.crypto.Hashes;
import bookinggateway.reporting.Evidence;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The happy path: POST, take the id from the response, then signed PUTs that walk the hash chain. */
class SignedChainTest extends GatewayTestBase {

    private static final String ID_PATTERN = "bk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    @Test
    @DisplayName("POST /booking returns a unique entity id string and the genesis chain head")
    void createReturnsUniqueId() {
        Created first = createBooking();
        Created second = createBooking();
        Evidence.put("ids", first.id() + ", " + second.id());

        assertTrue(first.id().matches(ID_PATTERN), first.id());
        assertNotEquals(first.id(), second.id());
        assertEquals(Hashes.genesis(first.id()), first.chainHead());
    }

    @Test
    @DisplayName("two signed PUTs are accepted and each advances the chain head to SHA-256(prev || body)")
    void signedPutsAdvanceTheChain() {
        Created booking = createBooking();

        String body1 = Payloads.booking(250, "2026-12-07", "Late checkout");
        SignedRequest auth1 = sign(booking.id(), body1, nowSeconds(), booking.chainHead());
        Response put1 = api.put(booking.id(), body1, auth1);
        assertEquals(200, put1.statusCode(), "first signed PUT");
        String head1 = put1.jsonPath().getString("chainHead");
        assertEquals(Hashes.nextHead(booking.chainHead(), body1), head1, "head after PUT 1");
        assertEquals(1, put1.jsonPath().getInt("version"));
        assertEquals(250, put1.jsonPath().getInt("booking.totalprice"));

        String body2 = Payloads.booking(275, "2026-12-08", "Airport transfer");
        SignedRequest auth2 = sign(booking.id(), body2, nowSeconds(), head1);
        Response put2 = api.put(booking.id(), body2, auth2);
        assertEquals(200, put2.statusCode(), "second signed PUT");
        String head2 = put2.jsonPath().getString("chainHead");
        assertEquals(Hashes.nextHead(head1, body2), head2, "head after PUT 2");
        assertEquals(2, put2.jsonPath().getInt("version"));

        assertBookingIs(booking.id(), body2, 2, head2);

        Evidence.put("booking", booking.id());
        Evidence.put("signature PUT 1", auth1.signature());
        Evidence.put("chain", shortHex(booking.chainHead()) + " -> " + shortHex(head1) + " -> " + shortHex(head2));
        Evidence.put("statuses", put1.statusCode() + ", " + put2.statusCode());
    }

    private static String shortHex(String hex) {
        return hex.substring(0, 12) + "...";
    }
}
