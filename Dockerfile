FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 6001 7001
CMD ["node", "network/node.js", "--port", "6001", "--api", "7001", "--mine"]
