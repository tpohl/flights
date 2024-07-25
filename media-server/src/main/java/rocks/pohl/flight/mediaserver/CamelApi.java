package rocks.pohl.flight.mediaserver;

import org.apache.camel.AggregationStrategy;
import org.apache.camel.Exchange;
import org.apache.camel.Message;
import org.apache.camel.PropertyInject;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.builder.endpoint.dsl.FileEndpointBuilderFactory;
import org.apache.camel.component.caffeine.CaffeineConstants;
import org.apache.camel.component.file.FileEndpointUriFactory;
import org.apache.camel.model.dataformat.JsonLibrary;

import java.io.File;

public class CamelApi

    extends RouteBuilder {

    @PropertyInject("google.places.api.key")
    private String googlePlacesApiKey;

    @Override
    public void configure() throws Exception {


        from("direct:getAirportImage")
            /* Removed Cafeine Cache
             .setHeader(CaffeineConstants.ACTION, constant(CaffeineConstants.ACTION_GET))
             .setHeader(CaffeineConstants.KEY, header("airportcode"))
             .toF("caffeine-cache://%s", "AirportPictureCache")
             .log("Has Result ${header.CamelCaffeineActionHasResult} ActionSucceeded ${header.CamelCaffeineActionSucceeded}")
            */
            .setHeader("airport_filename", header("airportcode"))
            .setHeader(Exchange.FILE_NAME, simple("${header.airport_filename}/"))
            .log("Loading File ${header.airport_filename}.jpg")
            .process(new org.apache.camel.Processor() {
                public void process(Exchange exchange) {
                    Message msg = exchange.getMessage();
                    File airportImage = new File("./imagecache/airports/" + msg.getHeader("airport_filename") + ".jpg");
                    if (airportImage.exists()) {
                        msg.setBody(airportImage);
                    } else {
                        msg.setBody(null);
                    }
                }
            })
            //  .log("Loaded File ${header.airport_filename}.jpg ${header.airportcode}")
            .choice()
            //.when(header(CaffeineConstants.ACTION_HAS_RESULT).isEqualTo(Boolean.FALSE))
            .when(simple("${body} == null"))
                // Write a camel route that searches for a place (using an airport three letter code) in google places API and returns a picture of the airport
                .log("File not found")
                .removeHeader(Exchange.HTTP_URI)
                .toD(
                    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
                        "?input=${header.airportcode}+airport" +
                        "&inputtype=textquery" +
                        "&fields=photos,place_id,geometry" +
                        "&key=" + googlePlacesApiKey +
                        "&httpMethod=GET")
                .choice().when().simple("${header.CamelHttpResponseCode} == 200")

                .removeHeader(Exchange.HTTP_URI)
                .unmarshal().json(JsonLibrary.Jackson)
                //.log("Got response from Google Places Search ${body}")
                .setHeader("lat").simple("${body[candidates][0][geometry][location][lat]}")
                .setHeader("lng").simple("${body[candidates][0][geometry][location][lng]}")
                .setHeader("photo_reference").simple("${body[candidates][0][photos][0][photo_reference]}")
                .setHeader("place_id").simple("${body[candidates][0][place_id]}")
                .toD("https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
                         "?rankby=prominence" +
                         "&location=${header.lat},${header.lng}" +
                         "&radius=49000" +
                         "&keyword=" +
                         // "&type=landmark" +
                         "&key=" + googlePlacesApiKey +
                         "&httpMethod=GET")
                // .log("Got response from Google Places Nearby Search ${body}")
                .choice()
                .when().simple("${header.CamelHttpResponseCode} == 200")
                    .unmarshal().json(JsonLibrary.Jackson)
                    .setHeader("photo_reference").simple("${body[results][0][photos][0][photo_reference]}")
                    .endChoice()
                    .removeHeader(Exchange.HTTP_URI)
                    .toD("https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${header.photo_reference}" +
                             "&followRedirects=true&httpMethod=GET&key=" + googlePlacesApiKey)
                    // add 12 months expires to http response
                    .setHeader("CamelHttpCacheControl", constant("max-age=31536000"))
                    //TODO crop image to 400x400
                    .log("Saving File ${header.airport_filename}.jpg")
                    .toD("file://./imagecache/airports/?fileName=${header.airport_filename}.jpg")
                .otherwise()
                    .log("Failed to get response from Google Places")
                /* Removed Cafeine Cache
                .setHeader(CaffeineConstants.ACTION, constant(CaffeineConstants.ACTION_PUT))
                .setHeader(CaffeineConstants.KEY, header("airportcode"))
                .setHeader(Exchange.FILE_NAME, simple("${header.airportcode}.jpg"))
                 .toF("caffeine-cache://%s", "AirportPictureCache")
                 */
            .otherwise()
                .log("Returning Cached Value")

        ;

        from("direct:cacheInFile")
            .log(" Saving File")
            .toD("file://./imagecache/airports/?fileName=${header.airportcode}.jpg");
    }
}
