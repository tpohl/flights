#!/usr/bin/env bash

docker build --platform=linux/amd64 -f src/main/docker/Dockerfile.multistage -t cloud.canister.io:5000/tpohl/flights-media-server .