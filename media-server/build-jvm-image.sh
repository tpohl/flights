#!/usr/bin/env bash
set -e
./mvnw clean package

docker build -f src/main/docker/Dockerfile.jvm -t flights-media-server .