FROM node:18-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy server package files
COPY server/package*.json ./server/

# Install root deps and server deps
RUN npm install && cd server && npm install

# Copy everything else
COPY . .

# Expose port
EXPOSE 3000

# Start
CMD ["node", "server/app.js"]
