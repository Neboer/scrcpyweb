FROM alpine:3.14 AS builder

ADD . /ws-scrcpy
RUN apk add --no-cache git nodejs npm python3 make g++ linux-headers

WORKDIR /ws-scrcpy
RUN npm install
RUN npm run dist

WORKDIR dist
RUN npm install --production

FROM alpine:3.14 AS runner
RUN apk add --no-cache android-tools nodejs npm python3 make g++ linux-headers
COPY --from=builder /ws-scrcpy/dist /root/ws-scrcpy/dist

WORKDIR /root/ws-scrcpy/dist
CMD ["npm", "start"]
