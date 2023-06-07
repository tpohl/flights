#!/usr/bin/env bash
./mvnw package -Pnative -Dquarkus.native.container-build=true

docker build -f src/main/docker/Dockerfile.native -t flights-media-server .