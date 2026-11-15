# 用 Docker 跑网站版：  docker build -f deploy/Dockerfile -t hugluno-snapshot . && docker run --rm -p 127.0.0.1:8080:8080 hugluno-snapshot
# 只绑 127.0.0.1（上面的 -p）= 只有这台电脑能访问。镜像里只有一个只读的静态服务器和 app/ 文件。
FROM node:22-alpine
RUN adduser -D -u 10001 hug
WORKDIR /srv
COPY app ./app
COPY tools/serve.mjs ./tools/serve.mjs
USER hug
EXPOSE 8080
CMD ["node", "tools/serve.mjs", "--host", "0.0.0.0", "--port", "8080"]
