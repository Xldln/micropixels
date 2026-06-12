#!/bin/bash

IMAGE_NAME="micropixels"

# Build image if not exists
if ! docker image inspect $IMAGE_NAME > /dev/null 2>&1; then
    echo "Building $IMAGE_NAME image..."
    docker build -t $IMAGE_NAME .
fi

docker run \
    --name micropixels-container \
    --gpus all \
    -v $(pwd):/workspace \
    -p 9000:9000 \
    -d \
    $IMAGE_NAME
