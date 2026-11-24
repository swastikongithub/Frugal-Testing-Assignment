package bookinggateway.server;

/**
 * One request as the gateway saw it. Times are System.nanoTime() values. The server runs
 * in the same JVM as the tests, so they can be compared with the test's own nanoTime stamps.
 */
public record AuditEntry(
        long receivedAtNanos,
        long respondedAtNanos,
        String method,
        String path,
        int status,
        String errorCode) {}
