package bookinggateway.server;

import bookinggateway.crypto.Hashes;
import bookinggateway.crypto.Signer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import io.javalin.http.Context;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * restful-booker-shaped mock gateway (POST/GET/PUT /booking) with HMAC request signing,
 * single-use signatures and a per-booking SHA-256 hash chain. Starts in-process on a free port.
 */
public final class BookingServer implements AutoCloseable {

    public static final long FRESHNESS_WINDOW_SECONDS = 30;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String RECEIVED_AT = "receivedAtNanos";
    private static final String ERROR_CODE = "errorCode";

    private final GatewayMode mode;
    private final RequestVerifier verifier;
    private final NonceStore nonces = new NonceStore(FRESHNESS_WINDOW_SECONDS);
    private final Map<String, Booking> bookings = new ConcurrentHashMap<>();
    private final List<AuditEntry> audit = new CopyOnWriteArrayList<>();
    private final Javalin app;

    private BookingServer(GatewayMode mode, byte[] sharedSecret, Clock clock) {
        this.mode = mode;
        this.verifier = new RequestVerifier(new Signer(sharedSecret), nonces, clock, FRESHNESS_WINDOW_SECONDS);
        this.app = Javalin.create(config -> config.showJavalinBanner = false);

        app.before(ctx -> ctx.attribute(RECEIVED_AT, System.nanoTime()));
        app.after(this::audit);
        app.post("/booking", this::create);
        app.get("/booking/{id}", this::read);
        app.put("/booking/{id}", this::update);
        app.exception(GatewayRejection.class, (rejection, ctx) -> {
            ErrorCode code = rejection.code();
            ctx.attribute(ERROR_CODE, code.name());
            ctx.status(code.status()).json(Map.of("error", code.name(), "status", code.status(), "message", code.message()));
        });
    }

    public static BookingServer start(GatewayMode mode, byte[] sharedSecret) {
        BookingServer server = new BookingServer(mode, sharedSecret, Clock.systemUTC());
        server.app.start("127.0.0.1", 0);
        return server;
    }

    public int port() {
        return app.port();
    }

    public GatewayMode mode() {
        return mode;
    }

    public List<AuditEntry> auditLog() {
        return List.copyOf(audit);
    }

    public int noncesInUse() {
        return nonces.size();
    }

    @Override
    public void close() {
        app.stop();
    }

    // POST /booking -> {"bookingid": "bk_...", "booking": {...}, "chainHead": "<genesis>"}
    private void create(Context ctx) {
        byte[] raw = ctx.bodyAsBytes();
        JsonNode booking = parseObject(raw);
        String id = "bk_" + UUID.randomUUID();
        Booking record = new Booking(id, new String(raw, StandardCharsets.UTF_8), Hashes.genesis(id));
        bookings.put(id, record);
        ctx.json(view(record, booking));
    }

    // GET /booking/{id}
    private void read(Context ctx) {
        Booking record = find(ctx.pathParam("id"));
        synchronized (record) {
            ctx.json(view(record, parseObject(record.body.getBytes(StandardCharsets.UTF_8))));
        }
    }

    // PUT /booking/{id}: verify, then apply and advance the hash chain
    private void update(Context ctx) {
        Booking record = find(ctx.pathParam("id"));
        byte[] raw = ctx.bodyAsBytes();
        synchronized (record) { // check-and-advance of the chain head must be atomic per booking
            if (mode == GatewayMode.SECURE) {
                var headers = new RequestVerifier.AuthHeaders(
                        ctx.header("X-Signature-Auth"), ctx.header("X-Timestamp"), ctx.header("X-Chain-Head"));
                verifier.verify(record.id, raw, headers, record.head);
            }
            JsonNode booking = parseObject(raw);
            record.body = new String(raw, StandardCharsets.UTF_8);
            record.head = Hashes.nextHead(record.head, raw);
            record.version++;
            ctx.json(view(record, booking));
        }
    }

    private Booking find(String id) {
        Booking record = bookings.get(id);
        if (record == null) throw new GatewayRejection(ErrorCode.BOOKING_NOT_FOUND, id);
        return record;
    }

    private static JsonNode parseObject(byte[] raw) {
        try {
            JsonNode node = JSON.readTree(raw);
            if (node == null || !node.isObject()) throw new GatewayRejection(ErrorCode.INVALID_BODY, "not a JSON object");
            return node;
        } catch (IOException e) {
            throw new GatewayRejection(ErrorCode.INVALID_BODY, e.getMessage());
        }
    }

    private static Map<String, Object> view(Booking record, JsonNode booking) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("bookingid", record.id);
        out.put("booking", booking);
        out.put("version", record.version);
        out.put("chainHead", record.head);
        return out;
    }

    private void audit(Context ctx) {
        Long receivedAt = ctx.attribute(RECEIVED_AT);
        audit.add(new AuditEntry(
                receivedAt == null ? System.nanoTime() : receivedAt,
                System.nanoTime(),
                ctx.method().name(),
                ctx.path(),
                ctx.statusCode(),
                ctx.attribute(ERROR_CODE)));
    }

    /** Mutable state of one booking; always accessed while holding its monitor. */
    private static final class Booking {
        final String id;
        String body;
        String head;
        int version;

        Booking(String id, String body, String head) {
            this.id = id;
            this.body = body;
            this.head = head;
        }
    }
}
