FROM node:20-slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    ffmpeg \
    python3 \
    python3-pip \
    python3-pillow \
    --no-install-recommends \
    && pip3 install edge-tts --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

RUN mkdir -p output/audio output/video

EXPOSE 3000
CMD ["node", "src/index.js"]
