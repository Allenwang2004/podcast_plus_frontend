# Development Dockerfile for Next.js with hot reload support

FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy project files
COPY . .

# Expose port
EXPOSE 3000

# Start development server with hot reload
CMD ["pnpm", "dev"]
