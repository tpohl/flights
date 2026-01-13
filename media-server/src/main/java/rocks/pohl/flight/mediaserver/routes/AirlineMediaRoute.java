package rocks.pohl.flight.mediaserver.routes;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.File;
import java.util.Map;

@ApplicationScoped
public class AirlineMediaRoute extends RouteBuilder {

    private static final Map<String, String> CARRIER_MAPPING = Map.ofEntries(
            Map.entry("LUFTHANSA", "LH"),
            Map.entry("SWISS", "LX"),
            Map.entry("SWISS INTERNATIONAL AIR LINES", "LX"),
            Map.entry("AUSTRIAN", "OS"),
            Map.entry("AUA", "OS"),
            Map.entry("BRITISH AIRWAYS", "BA"),
            Map.entry("AIR FRANCE", "AF"),
            Map.entry("AMERICAN AIRLINES", "AA"),
            Map.entry("UNITED", "UA"),
            Map.entry("UAL", "UA"),
            Map.entry("EUROWINGS", "EW"),
            Map.entry("EW", "EW"),
            Map.entry("EWG", "EW"),
            Map.entry("GERMANWINGS", "4U"),
            Map.entry("RYANAIR", "FR"),
            Map.entry("CONDOR", "DE"),
            Map.entry("CFG", "DE"),
            Map.entry("DE", "DE"),
            Map.entry("TUI FLY", "X3"),
            Map.entry("BRUSSELS", "SN"),
            Map.entry("MAERSK AIR", "DM"),
            Map.entry("SOUTHWEST AIRLINES", "WN"),
            Map.entry("TUNISAIR", "TU"),
            Map.entry("AUGSBURG AIRWAYS", "IQ"),
            Map.entry("AIR DOLOMITI", "EN"),
            Map.entry("DLA", "EN"),
            Map.entry("EUROWINGS DISCOVER", "4Y"));

    @Override
    public void configure() throws Exception {
        from("direct:getAirlineLogo")
                .routeId("getAirlineLogo")
                .process(exchange -> {
                    String input = exchange.getMessage().getHeader("airlinecode", String.class);

                    String v = input.trim().toUpperCase();
                    String normalized = CARRIER_MAPPING.getOrDefault(v, v);

                    // If it's a flight number like LH2065, extract prefix
                    if (normalized.length() > 2 && normalized.matches("^[A-Z]{1,3}\\d+.*")) {
                        normalized = normalized.replaceAll("^([A-Z]{1,3})\\d+.*", "$1");
                    }

                    // Ensure it's at most 3 chars
                    if (normalized.length() > 3) {
                        normalized = normalized.substring(0, 3);
                    }

                    exchange.getMessage().setHeader("normalized_code", normalized);
                    exchange.getMessage().setHeader("airline_filename", normalized);
                })
                .log("Loading Airline Logo: ${header.airline_filename}.png")
                .process(exchange -> {
                    String filename = exchange.getMessage().getHeader("airline_filename", String.class);
                    File file = new File("./imagecache/airlines/" + filename + ".png");
                    if (file.exists()) {
                        exchange.getMessage().setBody(file);
                    } else {
                        exchange.getMessage().setBody(null);
                    }
                })
                .choice()
                .when(body().isNull())
                .log("Airline logo not found in cache for ${header.normalized_code}, fetching from external source")
                .removeHeader(Exchange.HTTP_URI)
                .toD("https://www.gstatic.com/flights/airline_logos/70px/${header.normalized_code}.png?httpMethod=GET")
                .choice()
                .when(header(Exchange.HTTP_RESPONSE_CODE).isEqualTo(200))
                .setHeader("Cache-Control", constant("public, max-age=31536000, immutable"))
                .log("Saving Airline Logo to cache: ${header.airline_filename}.png")
                .toD("file://./imagecache/airlines/?fileName=${header.airline_filename}.png")
                .otherwise()
                .log("Failed to fetch airline logo for ${header.normalized_code}")
                .end()
                .endChoice()
                .otherwise()
                .log("Returning cached airline logo for ${header.normalized_code}")
                .end();
    }
}
