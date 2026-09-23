FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Expose default port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start bot and dashboard
CMD ["node", "src/index.js"]
