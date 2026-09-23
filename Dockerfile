FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Expose default port
EXPOSE 7860 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=7860

# Start bot and dashboard
CMD ["node", "src/index.js"]
