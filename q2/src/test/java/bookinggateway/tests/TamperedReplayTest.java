package bookinggateway.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import bookinggateway.client.Payloads;
import bookinggateway.client.SignedRequest;
import bookinggateway.reporting.Evidence;
import bookinggateway.server.AuditEntry;
import bookinggateway.server.ErrorCode;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * A captured, valid PUT is replayed with exactly one character of the body changed, reusing the
 * original signature and timestamp, inside the 300 ms window after the original completed. The
 * replay is dispatched by a ScheduledExecutorService (no sleeping); its real dispatch delay is
 * measured with System.nanoTime and asserted to be inside the window. Arrival at the gateway is
 * read from the gateway's own audit log and reported next to it.
 */
class TamperedReplayTest extends GatewayTestBase {

    private static final long WINDOW_MS = 300;
    /** Longer than one default Windows timer tick (15.6 ms): the scheduler wakes before the due time. */
    private static final long SPIN_LEAD_NANOS = TimeUnit.MILLISECONDS.toNanos(20);

    private static ScheduledThreadPoolExecutor replayScheduler;

    private record Dispatch(long dispatchedAt, Response response) {}

    @BeforeAll
    static void startReplayScheduler() {
        replayScheduler = new ScheduledThreadPoolExecutor(1, task -> {
            Thread thread = new Thread(task, "replay-scheduler");
            thread.setDaemon(true);
            return thread;
        });
        replayScheduler.prestartAllCoreThreads(); // thread start-up is not part of the measured delay

        // Warm RestAssured's request path so the replay's send cost is not first-call class loading.
        for (int i = 0; i < 5; i++) {
            api.send(api.preparePut("{}", new SignedRequest("00", 0, "00")), "bk_warm-up").jsonPath().getString("error");
        }
    }

    /**
     * The scheduler waits until shortly before {@code dueAt}, then the task spins to the exact
     * instant, so the dispatch time does not depend on the OS timer resolution.
     */
    private static ScheduledFuture<Dispatch> dispatchAt(long dueAt, Callable<Response> send) {
        return replayScheduler.schedule(() -> {
            while (System.nanoTime() < dueAt) Thread.onSpinWait();
            long dispatchedAt = System.nanoTime();
            return new Dispatch(dispatchedAt, send.call());
        }, dueAt - SPIN_LEAD_NANOS - System.nanoTime(), TimeUnit.NANOSECONDS);
    }

    @AfterAll
    static void stopReplayScheduler() {
        replayScheduler.shutdownNow();
    }

    @ParameterizedTest(name = "replay {0} ms after the original")
    @ValueSource(longs = {0, 150, 299})
    @DisplayName("one-character tampered replay with the original signature is rejected with 401 SIGNATURE_MISMATCH")
    void tamperedReplayInsideWindowIsRejected(long offsetMs) throws Exception {
        Created booking = createBooking();
        String body = Payloads.booking(250, "2026-12-07", "Late checkout");
        SignedRequest captured = sign(booking.id(), body, nowSeconds(), booking.chainHead());

        // Everything the replay needs is built before the original goes out, so the measured
        // delay is scheduling only: one character changed, original signature and timestamp.
        Payloads.Tamper tamper = Payloads.tamperOneCharacter(body);
        assertEquals(1, tamper.differingCharacters(), "exactly one character changed");
        RequestSpecification replayRequest = api.preparePut(tamper.tampered(), captured);

        Response original = api.put(booking.id(), body, captured);
        long originalCompletedAt = System.nanoTime();
        ScheduledFuture<Dispatch> pending = dispatchAt(
                originalCompletedAt + TimeUnit.MILLISECONDS.toNanos(offsetMs), () -> api.send(replayRequest, booking.id()));
        if (original.statusCode() != 200) {
            pending.cancel(false);
            fail("original signed PUT was not accepted: " + original.statusCode() + " " + original.asString());
        }
        Dispatch replay = pending.get(WINDOW_MS + 10_000, TimeUnit.MILLISECONDS); // main thread idle during the window
        String headAfterOriginal = original.jsonPath().getString("chainHead");

        double dispatchMs = (replay.dispatchedAt() - originalCompletedAt) / 1e6;
        double arrivalMs = (replayReceivedAt(booking.id()) - originalCompletedAt) / 1e6;
        Evidence.put("tamper", "body[" + tamper.index() + "] '" + tamper.from() + "' -> '" + tamper.to()
                + "' (totalprice 250 -> " + tamper.to() + "50), original signature + timestamp reused");
        Evidence.put("replay dispatched", String.format("+%.3f ms after first completion (target %d ms, lateness %.3f ms)",
                dispatchMs, offsetMs, dispatchMs - offsetMs));
        Evidence.put("replay reached gateway", String.format("+%.3f ms after first completion", arrivalMs));

        assertTrue(dispatchMs >= offsetMs, "replay dispatched before its target offset: " + dispatchMs);
        assertTrue(dispatchMs <= WINDOW_MS, "replay must go out within " + WINDOW_MS + " ms, took " + dispatchMs);

        assertRejected(
                new Attack("one-character tampered replay (+" + offsetMs + " ms)",
                        String.format("replayed a captured PUT %.1f ms after it completed with one body character"
                                + " changed, reusing its signature and timestamp", dispatchMs),
                        booking.id(), body, tamper.tampered(), captured),
                replay.response(),
                ErrorCode.SIGNATURE_MISMATCH,
                String.format("dispatched +%.3f ms, reached gateway +%.3f ms after first completion", dispatchMs, arrivalMs));
        assertBookingIs(booking.id(), body, 1, headAfterOriginal);
    }

    /** From the gateway's audit log: when the replayed (second) PUT for this booking arrived. */
    private static long replayReceivedAt(String bookingId) {
        List<AuditEntry> puts = server.auditLog().stream()
                .filter(e -> e.method().equals("PUT") && e.path().endsWith(bookingId))
                .toList();
        assertEquals(2, puts.size(), "gateway saw the original and the replay");
        return puts.get(1).receivedAtNanos();
    }
}
