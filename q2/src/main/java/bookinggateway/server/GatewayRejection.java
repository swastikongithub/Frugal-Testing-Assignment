package bookinggateway.server;

/** Thrown by a verification step; the gateway turns it into the documented JSON error. */
public final class GatewayRejection extends RuntimeException {

    private final ErrorCode code;

    public GatewayRejection(ErrorCode code, String detail) {
        super(code.name() + ": " + detail);
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }
}
