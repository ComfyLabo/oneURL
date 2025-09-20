FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY public ./public
COPY server.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
