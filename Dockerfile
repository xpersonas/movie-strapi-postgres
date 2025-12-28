FROM node:18-alpine

# Install required dependencies
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev git netcat-openbsd

# Set working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --network-timeout 1000000

# Copy the rest of the application
COPY . .

# Create the health check script
RUN echo '#!/bin/sh\nwget -q -O - http://localhost:1337/admin || exit 1' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=1337
ENV HOST=0.0.0.0

# Build the Strapi application
RUN yarn build

# Expose port 1337
EXPOSE 1337

# Create startup script
RUN echo '#!/bin/sh\necho "Starting Strapi..."\nyarn start' > /app/start.sh && \
    chmod +x /app/start.sh

# Command to run the application
CMD ["/app/start.sh"]