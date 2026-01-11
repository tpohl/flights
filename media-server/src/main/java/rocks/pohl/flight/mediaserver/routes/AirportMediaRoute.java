package rocks.pohl.flight.mediaserver.routes;

import org.apache.camel.Exchange;
import org.apache.camel.PropertyInject;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.File;

@ApplicationScoped
public class AirportMediaRoute extends RouteBuilder {

    @PropertyInject("google.places.api.key")
    private String googlePlacesApiKey;

    @Override
    public void configure() throws Exception {
        from("direct:getAirportImage")
                .routeId("getAirportImage")
                .setHeader("airport_filename", header("airportcode"))
                .log("Loading Airport Image: ${header.airport_filename}.jpg")
                .process(exchange -> {
                    String filename = exchange.getMessage().getHeader("airport_filename", String.class);
                    File file = new File("./imagecache/airports/" + filename + ".jpg");
                    if (file.exists()) {
                        exchange.getMessage().setBody(file);
                    } else {
                        exchange.getMessage().setBody(null);
                    }
                })
                .choice()
                .when(body().isNull())
                .log("Airport image not found in cache for ${header.airportcode}, fetching from Google Places")
                .removeHeader(Exchange.HTTP_URI)
                .toD("https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
                        "?input=${header.airportcode}+airport&inputtype=textquery" +
                        "&fields=photos,place_id,geometry&key=" + googlePlacesApiKey + "&httpMethod=GET")
                .choice()
                .when(header(Exchange.HTTP_RESPONSE_CODE).isEqualTo(200))
                .unmarshal().json(JsonLibrary.Jackson)
                .setHeader("lat", simple("${body[candidates][0][geometry][location][lat]}"))
                .setHeader("lng", simple("${body[candidates][0][geometry][location][lng]}"))
                .setHeader("photo_reference", simple("${body[candidates][0][photos][0][photo_reference]}"))
                .setHeader("place_id", simple("${body[candidates][0][place_id]}"))
                .removeHeader(Exchange.HTTP_URI)
                .toD("https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
                        "?rankby=prominence&location=${header.lat},${header.lng}" +
                        "&radius=49000&key=" + googlePlacesApiKey + "&httpMethod=GET")
                .choice()
                .when(header(Exchange.HTTP_RESPONSE_CODE).isEqualTo(200))
                .unmarshal().json(JsonLibrary.Jackson)
                .setHeader("photo_reference", simple("${body[results][0][photos][0][photo_reference]}"))
                .end()
                .endChoice()
                .removeHeader(Exchange.HTTP_URI)
                .toD("https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${header.photo_reference}"
                        +
                        "&followRedirects=true&key=" + googlePlacesApiKey + "&httpMethod=GET")
                .setHeader("Cache-Control", constant("public, max-age=31536000, immutable"))
                .log("Saving Airport Image to cache: ${header.airport_filename}.jpg")
                .toD("file://./imagecache/airports/?fileName=${header.airport_filename}.jpg")
                .endChoice()
                .otherwise()
                .log("Failed to fetch image from Google Places API for ${header.airportcode}")
                .end()
                .endChoice()
                .otherwise()
                .log("Returning cached airport image for ${header.airportcode}")
                .end();

        from("direct:cacheInFile")
                .routeId("cacheInFile")
                .log("Caching file for airport: ${header.airportcode}")
                .toD("file://./imagecache/airports/?fileName=${header.airportcode}.jpg");
    }
}
