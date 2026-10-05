FROM node:20-alpine

# Install system packages including ffmpeg and yt-dlp for media conversion & downloads
RUN apk add --no-cache ffmpeg yt-dlp

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
