docker stop flights-media-server
docker rm flights-media-server

docker run -d --name flights-media-server --restart always  \
    -e "VIRTUAL_HOST=flights-media.pohl.rocks" -e "PORT=8080" \
    -e "LETSENCRYPT_HOST=flights-media.pohl.rocks" -e "LETSENCRYPT_EMAIL=thpohl@gmail.com" \
    flights-media-server
