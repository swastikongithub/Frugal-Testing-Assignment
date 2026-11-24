package bookinggateway.reporting;

import java.util.List;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestWatcher;

/** Clears the capture before each test and prints every request/response if the test fails. */
public final class ExchangeLogOnFailure implements BeforeEachCallback, TestWatcher {

    @Override
    public void beforeEach(ExtensionContext context) {
        ExchangeLog.clear();
    }

    @Override
    public void testFailed(ExtensionContext context, Throwable cause) {
        List<ExchangeLog.Exchange> exchanges = ExchangeLog.current();
        StringBuilder out = new StringBuilder("\n--- HTTP exchanges of failed test '")
                .append(context.getDisplayName()).append("' (").append(exchanges.size()).append(") ---\n");
        exchanges.forEach(e -> out.append(e.render()));
        System.out.println(out.append("--- end of exchanges ---"));
    }
}
