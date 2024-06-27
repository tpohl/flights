package rocks.pohl.flight.mediaserver;

import org.apache.camel.Exchange;
import org.apache.camel.PropertyInject;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.caffeine.CaffeineConstants;
import org.apache.camel.model.dataformat.JsonLibrary;

public class CamelApi

    extends RouteBuilder {

    @PropertyInject("google.places.api.key")
    private String googlePlacesApiKey;

    @Override
    public void configure() throws Exception {

        // Write a camel route that searches for a place (using an airport three letter code) in google places API and returns a picture of the airport
        from("direct:searchAirportImage")
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
            .log("Got response from Google Places Search ${body}")
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
            .log("Got response from Google Places Nearby Search ${body}")
            .choice().when().simple("${header.CamelHttpResponseCode} == 200")
            .unmarshal().json(JsonLibrary.Jackson)
            .setHeader("photo_reference").simple("${body[results][0][photos][0][photo_reference]}")
            /*
            .toD(
                "https://maps.googleapis.com/maps/api/place/details/json" +
                    "?place_id=${header.place_id}" +
                    "&fields=photos" +
                    "&key=" + googlePlacesApiKey +
                    "&httpMethod=GET")
            .unmarshal().json(JsonLibrary.Jackson)
            .log("Got response from Google Places Details ${body}")
             */
            .endChoice()
            .removeHeader(Exchange.HTTP_URI)
            .toD("https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${header.photo_reference}" +
                     "&followRedirects=true&httpMethod=GET&key=" + googlePlacesApiKey)

            //crop image to 400x400
            .otherwise()
            .log("Failed to get response from Google Places")
        ;


        from("direct:getAirportImage")
            .setHeader(CaffeineConstants.ACTION, constant(CaffeineConstants.ACTION_GET))
            .setHeader(CaffeineConstants.KEY, header("airportcode"))
            .toF("caffeine-cache://%s", "AirportPictureCache")
            .log("Has Result ${header.CamelCaffeineActionHasResult} ActionSucceeded ${header.CamelCaffeineActionSucceeded}")
            .choice()
                .when(header(CaffeineConstants.ACTION_HAS_RESULT).isEqualTo(Boolean.FALSE))
                // Write a camel route that searches for a place (using an airport three letter code) in google places API and returns a picture of the airport
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
                .log("Got response from Google Places Search ${body}")
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
                .log("Got response from Google Places Nearby Search ${body}")
                .choice().when().simple("${header.CamelHttpResponseCode} == 200")
                .unmarshal().json(JsonLibrary.Jackson)
                .setHeader("photo_reference").simple("${body[results][0][photos][0][photo_reference]}")
                /*
                .toD(
                    "https://maps.googleapis.com/maps/api/place/details/json" +
                        "?place_id=${header.place_id}" +
                        "&fields=photos" +
                        "&key=" + googlePlacesApiKey +
                        "&httpMethod=GET")
                .unmarshal().json(JsonLibrary.Jackson)
                .log("Got response from Google Places Details ${body}")
                 */
                .endChoice()
                .removeHeader(Exchange.HTTP_URI)
                .toD("https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${header.photo_reference}" +
                         "&followRedirects=true&httpMethod=GET&key=" + googlePlacesApiKey)

                //crop image to 400x400
            .otherwise()
            .log("Failed to get response from Google Places")

            .setHeader(CaffeineConstants.ACTION, constant(CaffeineConstants.ACTION_PUT))
            .setHeader(CaffeineConstants.KEY, header("airportcode"))
            .toF("caffeine-cache://%s", "AirportPictureCache")
            .otherwise()
            .log("Returning Cached Value")

        ;
    }
}
