package rocks.pohl.flight.mediaserver;

import org.apache.camel.Exchange;
import org.apache.camel.Headers;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.caffeine.CaffeineConstants;
import org.apache.camel.spi.HeaderFilterStrategy;
import org.apache.http.Header;

public class CamelApi

    extends RouteBuilder {

    @Override
    public void configure() throws Exception {

        from("direct:getAirportImage")
            .setHeader(CaffeineConstants.ACTION, constant(CaffeineConstants.ACTION_GET))
            .setHeader(CaffeineConstants.KEY, header("airportcode"))
            .toF("caffeine-cache://%s", "AirportPictureCache")
            .log("Has Result ${header.CamelCaffeineActionHasResult} ActionSucceeded ${header.CamelCaffeineActionSucceeded}")
            .choice().when(header(CaffeineConstants.ACTION_HAS_RESULT).isEqualTo(Boolean.FALSE))
                .removeHeader(Exchange.HTTP_URI)
                .toD("https://flightsearch.app/assets/images/airport/airport_${header.airportcode}.jpg" +
                         "?httpMethod=GET")
                .setHeader(CaffeineConstants.ACTION, constant(CaffeineConstants.ACTION_PUT))
                .setHeader(CaffeineConstants.KEY, header("airportcode"))
                .toF("caffeine-cache://%s", "AirportPictureCache")
            .otherwise()
                .log("Returning Cached Value")

        ;
    }
}
