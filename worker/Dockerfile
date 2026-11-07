# Worker service: renders MP4 exports with headless Chromium + ffmpeg, and runs cleanup jobs.
# On Railway, create a second service from this repo and set RAILWAY_DOCKERFILE_PATH=worker/Dockerfile.
# The Playwright image version must match the playwright-core version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild sharp
COPY . .

ENV NODE_ENV=production
CMD ["npm", "run", "worker"]
