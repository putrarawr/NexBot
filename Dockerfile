FROM node:20-alpine

# Install system dependencies including chromium, python3, pip, ffmpeg, and fonts
RUN apk add --no-cache git ffmpeg python3 py3-pip chromium chromium-chromedriver fontconfig ttf-dejavu font-noto font-noto-cjk \
  && python3 -m pip install --no-cache-dir --break-system-packages --upgrade yt-dlp python-dotenv requests selenium undetected-chromedriver

ENV CHROME_BINARY=/usr/bin/chromium-browser
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
