docker stop flights-media-server
docker rm flights-media-server

mkdir -p airport-cache
chown -R 1000:1000 airport-cache
chmod -R 777 airport-cache

docker run -d --name flights-media-server --restart always  \
    -v /home/th0r5ti/software/flights-media-server/airport-cache:/deployments/imagecache/airports \
    -e "VIRTUAL_HOST=flights-media.pohl.rocks" -e "PORT=8080" -e "VIRTUAL_PORT=8080" \
    -e "LETSENCRYPT_HOST=flights-media.pohl.rocks" -e "LETSENCRYPT_EMAIL=thpohl@gmail.com" \
    -e "GOOGLE_PLACES_API_KEY=" \
    flights-media-server
