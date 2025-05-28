# Dockerfile for Next.js Dev Mode
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code
COPY . .

# Expose the port (default for Next.js dev)
EXPOSE 3007


# Set the Next.js port environment variable
ENV PORT=3007

# Start  server
CMD ["npm", "run", "dev"]
