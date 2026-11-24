package bookinggateway.client;

import bookinggateway.reporting.CapturingFilter;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.config.EncoderConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;

/** The one RequestSpecification every call goes through: base URI, JSON, and the capture filter. */
public final class ApiSpec {

    private ApiSpec() {}

    public static RequestSpecification forGateway(int port) {
        return new RequestSpecBuilder()
                .setBaseUri("http://127.0.0.1")
                .setPort(port)
                .setContentType(ContentType.JSON)
                .setAccept(ContentType.JSON)
                // Send the body String byte-for-byte; never let the client rewrite what was signed.
                .setConfig(RestAssuredConfig.config()
                        .encoderConfig(EncoderConfig.encoderConfig().defaultContentCharset("UTF-8")))
                .addFilter(new CapturingFilter())
                .build();
    }
}
