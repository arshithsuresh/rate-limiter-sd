FROM node:24.12-alpine AS builder

WORKDIR /app

COPY package*.json /.

RUN npm install

COPY . .

RUN npm run build


FROM node:24.12-alpine AS runner

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE $API_PORT

RUN echo "API_PORT :: $API_PORT  API ENV :: $API_ENV"

CMD [ "node", "dist/server.js" ]