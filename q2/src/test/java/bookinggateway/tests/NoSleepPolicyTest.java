package bookinggateway.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bookinggateway.reporting.Evidence;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/** Timing in this suite comes from the scheduler and System.nanoTime, never from sleeping. */
@ExtendWith(Evidence.class)
class NoSleepPolicyTest {

    // Built from pieces so this file does not match its own patterns.
    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b" + "Thread" + "\\s*\\.\\s*" + "sleep" + "\\s*\\("
                    + "|\\b" + "TimeUnit" + "\\s*\\.\\s*\\w+\\s*\\.\\s*" + "sleep" + "\\s*\\(");

    @Test
    @DisplayName("the forbidden-call pattern detects both sleep forms")
    void patternSelfCheck() {
        assertTrue(FORBIDDEN.matcher("Thread" + ".sleep(10);").find());
        assertTrue(FORBIDDEN.matcher("TimeUnit" + ".MILLISECONDS.sleep(10);").find());
    }

    @Test
    @DisplayName("no source file under src/ sleeps")
    void noSleepInSources() throws IOException {
        List<String> hits = new ArrayList<>();
        List<Path> files;
        try (Stream<Path> walk = Files.walk(Path.of("src"))) {
            files = walk.filter(p -> p.toString().endsWith(".java")).toList();
        }
        for (Path file : files) {
            List<String> lines = read(file);
            for (int i = 0; i < lines.size(); i++) {
                if (FORBIDDEN.matcher(lines.get(i)).find()) hits.add(file + ":" + (i + 1) + "  " + lines.get(i).trim());
            }
        }
        Evidence.put("scanned", files.size() + " .java files, " + hits.size() + " sleep calls");
        assertEquals(List.of(), hits, "sleep calls found");
    }

    private static List<String> read(Path file) {
        try {
            return Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
