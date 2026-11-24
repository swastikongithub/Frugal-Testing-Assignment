package bookinggateway.client;

/**
 * restful-booker shaped bodies, built as exact compact JSON text. The text is what gets
 * signed, so it is never re-serialised between signing and sending.
 */
public final class Payloads {

    private static final String TOTAL_PRICE = "\"totalprice\":";

    private Payloads() {}

    public static String booking(int totalPrice, String checkout, String additionalNeeds) {
        return ("{\"firstname\":\"Jim\",\"lastname\":\"Brown\",\"totalprice\":%d,\"depositpaid\":true,"
                        + "\"bookingdates\":{\"checkin\":\"2026-12-01\",\"checkout\":\"%s\"},\"additionalneeds\":\"%s\"}")
                .formatted(totalPrice, checkout, additionalNeeds);
    }

    public static String initialBooking() {
        return booking(111, "2026-12-05", "Breakfast");
    }

    /** The same JSON value with one extra space: semantically equal, byte-wise different. */
    public static String reformatted(String compactJson) {
        return compactJson.replaceFirst("\":", "\": ");
    }

    public record Tamper(String original, String tampered, int index, char from, char to) {
        public long differingCharacters() {
            if (original.length() != tampered.length()) return Long.MAX_VALUE;
            return java.util.stream.IntStream.range(0, original.length())
                    .filter(i -> original.charAt(i) != tampered.charAt(i))
                    .count();
        }
    }

    /** Change exactly one character: the leading digit of totalprice (e.g. 250 -> 350). */
    public static Tamper tamperOneCharacter(String body) {
        int index = body.indexOf(TOTAL_PRICE);
        if (index < 0) throw new IllegalArgumentException("no totalprice in " + body);
        index += TOTAL_PRICE.length();
        char from = body.charAt(index);
        if (!Character.isDigit(from)) throw new IllegalArgumentException("totalprice does not start with a digit");
        char to = from == '9' ? '1' : (char) (from + 1);
        String tampered = body.substring(0, index) + to + body.substring(index + 1);
        return new Tamper(body, tampered, index, from, to);
    }
}
