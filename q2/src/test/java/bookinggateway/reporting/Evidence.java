package bookinggateway.reporting;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * Key/value evidence a test records about itself (measured delays, status codes...). The
 * summary listener prints it at the end of the run, keyed by the JUnit unique id.
 */
public final class Evidence implements BeforeEachCallback, AfterEachCallback {

    private static final Map<String, Map<String, String>> BY_TEST = new ConcurrentHashMap<>();
    private static volatile String currentTest = "unknown";

    @Override
    public void beforeEach(ExtensionContext context) {
        currentTest = context.getUniqueId();
    }

    @Override
    public void afterEach(ExtensionContext context) {
        currentTest = "unknown";
    }

    /** Record a metric for the running test. Safe to call from the replay scheduler thread. */
    public static void put(String key, Object value) {
        BY_TEST.computeIfAbsent(currentTest, id -> Collections.synchronizedMap(new LinkedHashMap<>()))
                .put(key, String.valueOf(value));
    }

    static Map<String, String> forTest(String uniqueId) {
        Map<String, String> found = BY_TEST.get(uniqueId);
        if (found == null) return Map.of();
        synchronized (found) {
            return new LinkedHashMap<>(found);
        }
    }
}
