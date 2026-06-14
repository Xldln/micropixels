#!/bin/bash

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

IMAGE_NAME="micropixels"
CONTAINER_NAME="micropixels-container"

# Step 1: Build image if not exists
if ! docker image inspect $IMAGE_NAME > /dev/null 2>&1; then
    echo "Building $IMAGE_NAME image..."
    docker build -t $IMAGE_NAME . || exit 1
else
    echo "Image $IMAGE_NAME already exists, skipping build."
fi

# Step 2: Check container status
if docker container inspect $CONTAINER_NAME > /dev/null 2>&1; then
    RUNNING=$(docker inspect -f '{{.State.Running}}' $CONTAINER_NAME)
    if [ "$RUNNING" = "true" ]; then
        echo "Container $CONTAINER_NAME is already running."
    else
        echo "Container $CONTAINER_NAME exists but is stopped. Starting..."
        docker start $CONTAINER_NAME || exit 1
        echo "Container $CONTAINER_NAME started."
    fi
else
    echo "Creating and starting container $CONTAINER_NAME..."
    docker run \
        --name $CONTAINER_NAME \
        --gpus all \
        -v $(pwd):/workspace \
        -p 9000:9000 \
        -d \
        $IMAGE_NAME || exit 1
    echo "Container $CONTAINER_NAME created and running."
    echo "Running dl.sh for weight download..."
    docker exec -it $CONTAINER_NAME bash dl.sh
    echo "Running test.sh for verification..."
    docker exec -it $CONTAINER_NAME bash test.sh || exit 1
    echo "Test completed."
fi

# Step 3: Start React frontend (host side)
echo ""
echo "=== React Frontend ==="

# Check if port 8999 is already in use
if command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":8999 "
    PORT_IN_USE=$?
elif command -v lsof &> /dev/null; then
    lsof -i :8999 2>/dev/null | grep -q LISTEN
    PORT_IN_USE=$?
else
    PORT_IN_USE=1
fi

if [ "$PORT_IN_USE" -eq 0 ]; then
    echo "Port 8999 is already in use, React frontend appears to be running, skipping."
else
    if [ ! -d "node_modules" ]; then
        echo "First time setup: installing npm dependencies..."
        npm install || exit 1
    else
        echo "node_modules already exists, skipping npm install."
    fi
    echo "Starting React dev server on port 8999..."
    echo "🚀 You can access the micropixels server at 👾 http://localhost:8999"
    npm run dev &
    REACT_PID=$!
    echo "React dev server started (PID: $REACT_PID)."
fi

# Step 4: Exec into container and run main.py
echo ""
echo "Entering container and starting micropixels service..."
docker exec -it $CONTAINER_NAME python main.py
