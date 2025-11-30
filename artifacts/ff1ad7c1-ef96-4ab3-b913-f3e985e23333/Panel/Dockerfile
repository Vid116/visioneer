FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY *.js ./

# Copy public folder (visualizer)
COPY public ./public

# Copy scripts folder
COPY scripts ./scripts

# Expose ports
EXPOSE 3000 3001

# Default command (can be overridden in docker-compose)
CMD ["node", "nft-event-processor.js"]
