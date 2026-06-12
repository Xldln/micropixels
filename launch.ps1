$IMAGE_NAME = "micropixels"

# Build image if not exists
if (-not (docker images -q $IMAGE_NAME)) {
    Write-Host "Building $IMAGE_NAME image..."
    docker build -t $IMAGE_NAME .
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

docker run `
    --name micropixels-container `
    --gpus all `
    -v ${PWD}:/workspace `
    -p 9000:9000 `
    -d `
    $IMAGE_NAME
