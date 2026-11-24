package bookinggateway.server;

import java.util.Locale;

/**
 * SECURE runs every verification step. INSECURE skips them all: it is the negative control
 * that proves the suite notices when a tampered request is accepted.
 */
public enum GatewayMode {
    SECURE,
    INSECURE;

    /** Reads -Dmode=secure|insecure (Surefire passes it through from the Maven command line). */
    public static GatewayMode fromSystemProperty() {
        String raw = System.getProperty("mode", "secure").trim().toUpperCase(Locale.ROOT);
        return raw.isEmpty() ? SECURE : GatewayMode.valueOf(raw);
    }
}
