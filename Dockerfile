# Production Dockerfile for social app with cron scheduler
FROM node:20-bullseye

# Install system dependencies: ffmpeg and python/pip for yt-dlp
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip
RUN pip3 install --no-cache-dir yt-dlp

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --only=production

# Copy the app
COPY . .

# Expose the app port
EXPOSE 3000

# Start the server (scheduler is initialized in server.js on listen)
CMD ["node", "server.js"]
