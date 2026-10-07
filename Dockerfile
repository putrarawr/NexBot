FROM node:20-bookworm-slim

# Install system dependencies including chromium, python3, pip, ffmpeg, xvfb, and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    python3 \
    python3-pip \
    chromium \
    chromium-driver \
    xvfb \
    fonts-noto-cjk \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages --upgrade \
    yt-dlp \
    python-dotenv \
    requests \
    selenium \
    undetected-chromedriver \
    pyvirtualdisplay

ENV CHROME_BINARY=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV SIMPKL_USERNAME=0081361735
ENV SIMPKL_PASSWORD=rexx12345rawr

# Set working directory
WORKDIR /app
# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Expose ports
EXPOSE 8080 3000

# Set environment
ENV NODE_ENV=production

# Start bot and dashboard
CMD ["node", "src/index.js"]
