# Use Node.js 22 LTS (required for built-in node:sqlite)
FROM node:22-bookworm-slim

# Set working directory
WORKDIR /app

# Install standard CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency definitions
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Create persistent storage folder for SQLite database
RUN mkdir -p /app/data

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose web server port
EXPOSE 3000

# Start server
CMD ["node", "server/server.js"]
