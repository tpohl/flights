docker stop flights-media-server
docker rm flights-media-server

mkdir -p airport-cache
mkdir -p airline-cache
chown -R 185:root airport-cache airline-cache
chmod -R 777 airport-cache airline-cache

docker run -d --name flights-media-server --restart always  \
    -v /home/th0r5ti/software/flights-media-server/airport-cache:/deployments/imagecache/airports \
    -v /home/th0r5ti/software/flights-media-server/airline-cache:/deployments/imagecache/airlines \
    -e "VIRTUAL_HOST=flights-media.pohl.rocks" -e "PORT=8080" -e "VIRTUAL_PORT=8080" \
    -e "LETSENCRYPT_HOST=flights-media.pohl.rocks" -e "LETSENCRYPT_EMAIL=thpohl@gmail.com" \
    -e "GOOGLE_PLACES_API_KEY=AIzaSyCSYwK2nL-Snh3w6ZVkI6IW3OdfRjuiEFc" \
    flights-media-server
