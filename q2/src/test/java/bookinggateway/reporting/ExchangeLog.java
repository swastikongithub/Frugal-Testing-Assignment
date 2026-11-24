package bookinggateway.reporting;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Every HTTP exchange of the current test, including ones sent from the replay scheduler
 * thread. Tests run one at a time, so a single list that is cleared per test is enough.
 */
public final class ExchangeLog {

    public record Exchange(
            String method,
            String uri,
            Map<String, String> authHeaders,
            String requestBody,
            int status,
            String responseBody,
            double durationMs) {

        public String render() {
            StringBuilder out = new StringBuilder();
            out.append("  > ").append(method).append(' ').append(uri).append('\n');
            authHeaders.forEach((k, v) -> out.append("  > ").append(k).append(": ").append(v).append('\n'));
            out.append("  > ").append(requestBody).append('\n');
            out.append("  < ").append(status).append(" (").append(String.format("%.1f", durationMs)).append(" ms) ")
                    .append(responseBody).append('\n');
            return out.toString();
        }
    }

    private static final List<Exchange> EXCHANGES = new CopyOnWriteArrayList<>();

    private ExchangeLog() {}

    static void record(Exchange exchange) {
        EXCHANGES.add(exchange);
    }

    public static List<Exchange> current() {
        return List.copyOf(EXCHANGES);
    }

    static void clear() {
        EXCHANGES.clear();
    }
}
