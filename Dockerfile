FROM node:20-bookworm

# Install PostgreSQL 16 client for pg_dump (Neon uses Postgres 16)
RUN apt-get update && apt-get install -y wget gnupg2 lsb-release chromium fonts-liberation fonts-dejavu-core && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y postgresql-client-16 && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
