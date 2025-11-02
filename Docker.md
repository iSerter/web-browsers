# Docker Guide

This guide covers building and publishing the `iserter/web-browsers` Docker image.

## Prerequisites

- Docker installed on your system
- Docker Hub account (for publishing)
- Logged into Docker Hub: `docker login`

## Building the Image

### Build for local development

```bash
docker build -t iserter/web-browsers .
```

### Build with a specific tag

```bash
docker build -t iserter/web-browsers:latest .
docker build -t iserter/web-browsers:v0.0.2 .
```

### Build with build arguments (if needed)

```bash
docker build --build-arg NODE_VERSION=22 -t iserter/web-browsers .
```

## Running the Container

### Basic run

```bash
docker run -d -p 3030:3030 --name wb-app iserter/web-browsers
```

### Run with environment variables

```bash
docker run -d -p 3030:3030 \
  -e LOG_CLEAN_INTERVAL_MS=600000 \
  -e LOG_CLEAN_STRATEGY=truncate \
  --name wb-app \
  iserter/web-browsers
```

### Run with volume mounts

```bash
docker run -d -p 3030:3030 \
  -v $(pwd)/logs:/tmp \
  --name wb-app \
  iserter/web-browsers
```

## Publishing to Docker Hub

### Login to Docker Hub

```bash
docker login
```

Enter your Docker Hub username and password when prompted.

### Tag the image

If you built without the registry prefix, tag it:

```bash
docker tag web-browsers iserter/web-browsers:latest
docker tag web-browsers iserter/web-browsers:v0.0.2
```

### Push to Docker Hub

#### Push latest tag

```bash
docker push iserter/web-browsers:latest
```

#### Push specific version

```bash
docker push iserter/web-browsers:v0.0.2
```

#### Push all tags

```bash
docker push iserter/web-browsers --all-tags
```

## Multi-Architecture Builds (Optional)

For building images that work on multiple architectures (amd64, arm64):

### Create a buildx builder

```bash
docker buildx create --name multiarch-builder --use
docker buildx inspect --bootstrap
```

### Build and push multi-architecture image

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t iserter/web-browsers:latest \
  --push \
  .
```

## Complete Workflow

Here's a complete workflow for building and publishing:

```bash
# 1. Build the image with proper tag
docker build -t iserter/web-browsers:latest -t iserter/web-browsers:v0.0.2 .

# 2. Test the image locally
docker run -d -p 3030:3030 --name wb-test iserter/web-browsers:latest

# 3. Verify it's working
curl http://127.0.0.1:3030/

# 4. Stop and remove test container
docker stop wb-test && docker rm wb-test

# 5. Login to Docker Hub (if not already logged in)
docker login

# 6. Push all tags
docker push iserter/web-browsers:latest
docker push iserter/web-browsers:v1.0.0
```

## Pulling the Image

Once published, others can pull and use the image:

```bash
docker pull iserter/web-browsers:latest
docker pull iserter/web-browsers:v1.0.0
```

## Useful Commands

### View local images

```bash
docker images | grep iserter/web-browsers
```

### Remove local image

```bash
docker rmi iserter/web-browsers:latest
```

### View image layers and size

```bash
docker history iserter/web-browsers:latest
```

### Inspect image details

```bash
docker inspect iserter/web-browsers:latest
```

### Check image vulnerabilities (if Docker Scout is available)

```bash
docker scout cves iserter/web-browsers:latest
```

## Automated Builds (CI/CD)

For automated builds in CI/CD pipelines, consider using GitHub Actions or similar:

```yaml
# Example GitHub Actions workflow
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: |
      iserter/web-browsers:latest
      iserter/web-browsers:${{ github.sha }}
```

## Troubleshooting

### Build fails due to network issues

```bash
docker build --network=host -t iserter/web-browsers .
```

### Clear build cache

```bash
docker builder prune
```

### Rebuild without cache

```bash
docker build --no-cache -t iserter/web-browsers .
```

### Check build logs

```bash
docker build --progress=plain -t iserter/web-browsers .
```

### SG setup


```
docker network create sg-network
docker network connect sg-network iserter.web-browsers
```