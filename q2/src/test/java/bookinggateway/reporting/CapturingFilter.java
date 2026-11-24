package bookinggateway.reporting;

import io.restassured.filter.Filter;
import io.restassured.filter.FilterContext;
import io.restassured.response.Response;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.FilterableResponseSpecification;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * RestAssured filter that records each request/response pair. Nothing is printed here;
 * {@link ExchangeLogOnFailure} prints the pairs only when a test fails, so a green run stays quiet.
 */
public final class CapturingFilter implements Filter {

    private static final String[] AUTH_HEADERS = {"X-Signature-Auth", "X-Timestamp", "X-Chain-Head"};

    @Override
    public Response filter(
            FilterableRequestSpecification request, FilterableResponseSpecification responseSpec, FilterContext ctx) {
        long start = System.nanoTime();
        Response response = ctx.next(request, responseSpec);
        Map<String, String> auth = new LinkedHashMap<>();
        for (String name : AUTH_HEADERS) {
            if (request.getHeaders().hasHeaderWithName(name)) auth.put(name, request.getHeaders().getValue(name));
        }
        Object body = request.getBody();
        ExchangeLog.record(new ExchangeLog.Exchange(
                request.getMethod(),
                request.getURI(),
                auth,
                body == null ? "" : body.toString(),
                response.statusCode(),
                response.asString(),
                (System.nanoTime() - start) / 1e6));
        return response;
    }
}
