package bookinggateway.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.fail;

import bookinggateway.client.ApiSpec;
import bookinggateway.client.BookingClient;
import bookinggateway.client.Payloads;
import bookinggateway.client.SignedRequest;
import bookinggateway.crypto.Signer;
import bookinggateway.reporting.Evidence;
import bookinggateway.reporting.ExchangeLogOnFailure;
import bookinggateway.reporting.VulnerabilityReporter;
import bookinggateway.server.BookingServer;
import bookinggateway.server.ErrorCode;
import bookinggateway.server.GatewayMode;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import java.security.SecureRandom;
import java.time.Instant;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * Starts the gateway in-process on a random free port before a test class and stops it after.
 * The HMAC secret is 32 random bytes handed to both sides directly (the "out-of-band" channel);
 * it never travels over HTTP.
 */
@ExtendWith({Evidence.class, ExchangeLogOnFailure.class})
abstract class GatewayTestBase {

    protected static BookingServer server;
    protected static Signer signer;
    protected static BookingClient api;

    /** A booking as returned by POST /booking. */
    protected record Created(String id, String body, String chainHead) {}

    @BeforeAll
    static void startGateway() {
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        server = BookingServer.start(GatewayMode.fromSystemProperty(), secret);
        signer = new Signer(secret);
        api = new BookingClient(ApiSpec.forGateway(server.port()));
    }

    @AfterAll
    static void stopGateway() {
        if (server != null) server.close();
    }

    protected static long nowSeconds() {
        return Instant.now().getEpochSecond();
    }

    /** POST a booking and pull the generated id out of the response with JsonPath. */
    protected static Created createBooking() {
        String body = Payloads.initialBooking();
        Response response = api.create(body);
        assertEquals(200, response.statusCode(), "POST /booking");
        String id = response.jsonPath().getString("bookingid");
        String head = response.jsonPath().getString("chainHead");
        assertNotNull(id, "bookingid in POST response");
        assertNotNull(head, "chainHead in POST response");
        return new Created(id, body, head);
    }

    /** Sign the exact String that will be sent, at runtime, for this booking. */
    protected static SignedRequest sign(String bookingId, String body, long timestamp, String chainHead) {
        return new SignedRequest(signer.sign(body, bookingId, timestamp), timestamp, chainHead);
    }

    /** Everything a rejection check needs to write a useful vulnerability report. */
    protected record Attack(String title, String description, String bookingId, String signedBody, String sentBody,
            SignedRequest auth) {}

    /**
     * The gateway must refuse this request with {@code expected}. A 2xx answer is a security
     * failure: report it as CRITICAL (console + JSON file) and fail the test.
     */
    protected static void assertRejected(Attack attack, Response response, ErrorCode expected, String evidence) {
        int status = response.statusCode();
        String error = response.jsonPath().getString("error");
        Evidence.put("response", status + " " + (error == null ? "ACCEPTED" : error));
        if (status >= 200 && status < 300) {
            VulnerabilityReporter.report(new VulnerabilityReporter.Attempt(
                    attack.title(),
                    attack.description(),
                    "PUT /booking/" + attack.bookingId(),
                    server.mode().name(),
                    expected.status() + " " + expected.name(),
                    status,
                    response.asString(),
                    attack.signedBody(),
                    attack.sentBody(),
                    attack.auth() == null ? "(none)" : attack.auth().signature(),
                    attack.auth() == null ? 0 : attack.auth().timestamp(),
                    evidence));
            fail("CRITICAL: gateway accepted " + attack.title() + " with HTTP " + status + " (expected "
                    + expected.status() + " " + expected.name() + "); see " + VulnerabilityReporter.REPORT_FILE);
        }
        assertEquals(expected.status(), status, "HTTP status for " + attack.title());
        assertEquals(expected.name(), response.jsonPath().getString("error"), "error code for " + attack.title());
    }

    /** The stored booking still holds {@code body} at {@code version} with head {@code head}. */
    protected static void assertBookingIs(String bookingId, String body, int version, String head) {
        Response stored = api.get(bookingId);
        assertEquals(200, stored.statusCode(), "GET /booking/" + bookingId);
        assertEquals(version, stored.jsonPath().getInt("version"), "stored version");
        assertEquals(head, stored.jsonPath().getString("chainHead"), "stored chain head");
        assertEquals(
                JsonPath.from(body).getMap("$"),
                stored.jsonPath().getMap("booking"),
                "stored booking body");
    }
}
