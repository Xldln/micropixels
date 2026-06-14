$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$IMAGE_NAME = "micropixels"
$CONTAINER_NAME = "micropixels-container"

# Step 1: Build image if not exists
$img = docker images -q $IMAGE_NAME
if (-not $img) {
    Write-Host "Building $IMAGE_NAME image..."
    docker build -t $IMAGE_NAME .
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "Image $IMAGE_NAME already exists, skipping build."
}

# Step 2: Check container status
$ctr = docker container inspect $CONTAINER_NAME 2>$null
if ($ctr) {
    $running = docker inspect -f '{{.State.Running}}' $CONTAINER_NAME
    if ($running -eq "true") {
        Write-Host "Container $CONTAINER_NAME is already running."
    } else {
        Write-Host "Container $CONTAINER_NAME exists but is stopped. Starting..."
        docker start $CONTAINER_NAME
        if ($LASTEXITCODE -ne 0) { exit 1 }
        Write-Host "Container $CONTAINER_NAME started."
    }
} else {
    Write-Host "Creating and starting container $CONTAINER_NAME..."
    docker run `
        --name $CONTAINER_NAME `
        --gpus all `
        -v ${PWD}:/workspace `
        -p 9000:9000 `
        -d `
        $IMAGE_NAME
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "Container $CONTAINER_NAME created and running."
    Write-Host "Running test.sh for weight download and verification..."
    docker exec -it $CONTAINER_NAME bash test.sh
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "Test completed."
}

# Step 3: Start React frontend (host side)
Write-Host ""
Write-Host "=== React Frontend ==="
if (-not (Test-Path "node_modules")) {
    Write-Host "First time setup: installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "node_modules already exists, skipping npm install."
}
Write-Host "Starting React dev server on port 8999..."
Write-Host "🚀 You can access the micropixels server at 👾 http://localhost:8999"
$reactJob = Start-Job -Name "ReactDevServer" -ArgumentList $PWD -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev
}
Write-Host "React dev server started (Job ID: $($reactJob.Id))."

# Step 4: Exec into container and run main.py
Write-Host ""
Write-Host "Entering container and starting micropixels service..."
docker exec -it $CONTAINER_NAME python main.py
