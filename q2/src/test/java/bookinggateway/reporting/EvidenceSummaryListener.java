package bookinggateway.reporting;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.engine.support.descriptor.ClassSource;
import org.junit.platform.engine.support.descriptor.MethodSource;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.TestPlan;

/**
 * Prints the end-of-run evidence summary: gateway mode, each test with its outcome and the
 * metrics it recorded through {@link Evidence}, and the vulnerability count with report path.
 * Registered through META-INF/services so it runs under Surefire with no extra configuration.
 */
public final class EvidenceSummaryListener implements TestExecutionListener {

    private record Row(String container, String name, TestExecutionResult.Status status, Map<String, String> metrics) {}

    private final List<Row> rows = new ArrayList<>();
    private TestPlan plan;
    private long startedAt;

    @Override
    public void testPlanExecutionStarted(TestPlan testPlan) {
        plan = testPlan;
        rows.clear();
        startedAt = System.nanoTime();
        VulnerabilityReporter.reset();
    }

    @Override
    public void executionFinished(TestIdentifier id, TestExecutionResult result) {
        if (!id.isTest()) return;
        String name = id.getDisplayName();
        TestIdentifier parent = plan.getParent(id).orElse(null);
        // A parameterized invocation's parent is its method template: show "method [n] args".
        if (parent != null && parent.getSource().filter(MethodSource.class::isInstance).isPresent()) {
            name = parent.getDisplayName() + " " + name;
        }
        rows.add(new Row(enclosingClass(id), name, result.getStatus(), Evidence.forTest(id.getUniqueId())));
    }

    private String enclosingClass(TestIdentifier id) {
        for (TestIdentifier at = id; at != null; at = plan.getParent(at).orElse(null)) {
            if (at.getSource().filter(ClassSource.class::isInstance).isPresent()) {
                String name = ((ClassSource) at.getSource().get()).getClassName();
                return name.substring(name.lastIndexOf('.') + 1);
            }
        }
        return "";
    }

    @Override
    public void testPlanExecutionFinished(TestPlan testPlan) {
        if (rows.isEmpty()) return;
        long passed = rows.stream().filter(r -> r.status() == TestExecutionResult.Status.SUCCESSFUL).count();
        StringBuilder out = new StringBuilder("\n");
        String rule = "=".repeat(100);
        out.append(rule).append('\n')
                .append("Q2 EVIDENCE SUMMARY  -  HMAC replay gateway\n")
                .append(rule).append('\n')
                .append("gateway mode       : ").append(System.getProperty("mode", "secure")).append('\n')
                .append("tests              : ").append(passed).append('/').append(rows.size()).append(" passed")
                .append(String.format("  (%.1f s)%n", (System.nanoTime() - startedAt) / 1e9));
        String lastContainer = null;
        for (Row row : rows) {
            if (!row.container().equals(lastContainer)) {
                out.append('\n').append(row.container()).append('\n');
                lastContainer = row.container();
            }
            out.append("  ").append(symbol(row.status())).append(' ').append(row.name()).append('\n');
            row.metrics().forEach((k, v) -> out.append("      ").append(k).append(": ").append(v).append('\n'));
        }
        int findings = VulnerabilityReporter.count();
        out.append('\n')
                .append("vulnerabilities    : ").append(findings)
                .append(findings == 0 ? "  (no tampered or replayed request was accepted)" : "  CRITICAL")
                .append('\n');
        if (findings > 0) {
            out.append("report             : ").append(VulnerabilityReporter.REPORT_FILE.toAbsolutePath()).append('\n');
        }
        out.append(rule);
        System.out.println(out);
    }

    private static String symbol(TestExecutionResult.Status status) {
        return switch (status) {
            case SUCCESSFUL -> "PASS";
            case FAILED -> "FAIL";
            case ABORTED -> "SKIP";
        };
    }
}
