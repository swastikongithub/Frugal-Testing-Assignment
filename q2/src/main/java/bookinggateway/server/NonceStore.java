package bookinggateway.server;

import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Remembers every signature that has passed verification, so each signed request can be used
 * exactly once. Entries only need to live as long as their timestamp is still fresh: after
 * that, the freshness check rejects a replay anyway, so the map stays bounded.
 */
public final class NonceStore {

    /** signature (lower-case hex) -> the request's Unix timestamp */
    private final ConcurrentHashMap<String, Long> used = new ConcurrentHashMap<>();
    private final long windowSeconds;

    public NonceStore(long windowSeconds) {
        this.windowSeconds = windowSeconds;
    }

    /** @return true if this is the first use of the signature; false means replay. Atomic. */
    public boolean markUsed(String signatureHex, long timestamp, long nowSeconds) {
        used.values().removeIf(ts -> ts < nowSeconds - windowSeconds);
        return used.putIfAbsent(signatureHex.trim().toLowerCase(Locale.ROOT), timestamp) == null;
    }

    public int size() {
        return used.size();
    }
}
