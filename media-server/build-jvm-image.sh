#!/usr/bin/env bash
./mvnw package

docker build -f src/main/docker/Dockerfile.jvm -t flights-media-server .