FROM node:20-bookworm

# Install PostgreSQL client for pg_dump
RUN apt-get update && \
    apt-get install -y postgresql-client && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port (adjust if your app uses a different one, usually Railway handles this via PORT env var)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
