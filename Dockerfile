FROM node:20-alpine

# Alpine's repository yt-dlp often trails YouTube changes. Install the current
# upstream release, plus a known font family for Sharp/librsvg quote rendering.
RUN apk add --no-cache ffmpeg python3 py3-pip fontconfig ttf-dejavu font-noto font-noto-cjk \
  && python3 -m pip install --no-cache-dir --break-system-packages --upgrade yt-dlp

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
