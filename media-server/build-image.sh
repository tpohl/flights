#!/usr/bin/env bash
set -e
./mvnw clean package -Pnative -Dquarkus.native.container-build=true -Dquarkus.native.container-runtime=docker

docker build -f src/main/docker/Dockerfile.native-micro -t flights-media-server .