package rocks.pohl.flight.mediaserver.routes;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.apache.camel.CamelContext;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.AdviceWith;
import org.apache.camel.component.mock.MockEndpoint;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class AirlineMediaRouteTest {

    @Inject
    CamelContext camelContext;

    @Inject
    ProducerTemplate producerTemplate;

    @Test
    public void testAirlineCodeNormalization() throws Exception {
        AdviceWith.adviceWith(camelContext, "getAirlineLogo", a -> {
            a.replaceFromWith("direct:testStart");
            // Mock out the file and http calls
            a.weaveByToUri("file://./imagecache/airlines/.*").replace().to("mock:file");
            a.weaveByToUri("https://www.gstatic.com/.*").replace().to("mock:http");
            // Add a mock at the end to capture results
            a.weaveAddLast().to("mock:result");
        });

        MockEndpoint resultEndpoint = camelContext.getEndpoint("mock:result", MockEndpoint.class);

        // Test LH2065 -> LH
        testAndVerify(resultEndpoint, "LH2065", "LH");

        // Test X35436 -> X3
        testAndVerify(resultEndpoint, "X35436", "X3");

        // Test DLH123 -> DLH
        testAndVerify(resultEndpoint, "DLH123", "DLH");

        // Test 4Y102 -> 4Y
        testAndVerify(resultEndpoint, "4Y102", "4Y");

        // Test LUFTHANSA -> LH (Mapping)
        testAndVerify(resultEndpoint, "LUFTHANSA", "LH");

        // Test TUI FLY -> X3 (Mapping)
        testAndVerify(resultEndpoint, "TUI FLY", "X3");
    }

    private void testAndVerify(MockEndpoint mock, String input, String expected) throws InterruptedException {
        mock.reset();
        mock.expectedHeaderReceived("normalized_code", expected);

        producerTemplate.sendBodyAndHeader("direct:testStart", null, "airlinecode", input);

        mock.assertIsSatisfied();
    }
}
