package bookinggateway.client;

import static io.restassured.RestAssured.given;

import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;

/** Thin client over the shared spec. Bodies are passed as the exact String that was signed. */
public final class BookingClient {

    public static final String SIGNATURE_HEADER = "X-Signature-Auth";
    public static final String TIMESTAMP_HEADER = "X-Timestamp";
    public static final String CHAIN_HEADER = "X-Chain-Head";

    private final RequestSpecification spec;

    public BookingClient(RequestSpecification spec) {
        this.spec = spec;
    }

    public Response create(String body) {
        return given().spec(spec).body(body).when().post("/booking");
    }

    public Response get(String bookingId) {
        return given().spec(spec).when().get("/booking/{id}", bookingId);
    }

    public Response put(String bookingId, String body, SignedRequest auth) {
        return send(preparePut(body, auth), bookingId);
    }

    /** A signed PUT built ahead of time, so sending it later does no request-building work. */
    public RequestSpecification preparePut(String body, SignedRequest auth) {
        return given().spec(spec)
                .header(SIGNATURE_HEADER, auth.signature())
                .header(TIMESTAMP_HEADER, Long.toString(auth.timestamp()))
                .header(CHAIN_HEADER, auth.chainHead())
                .body(body);
    }

    /** Send a PUT prepared with {@link #preparePut}. */
    public Response send(RequestSpecification preparedPut, String bookingId) {
        return preparedPut.when().put("/booking/{id}", bookingId);
    }

    /** A PUT with no auth headers at all. */
    public Response unsignedPut(String bookingId, String body) {
        return given().spec(spec).body(body).when().put("/booking/{id}", bookingId);
    }
}
