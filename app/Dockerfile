FROM debian:stable-slim

LABEL software="bge"
LABEL software.description="answer questions, get bubbles"

ENV DEBIAN_FRONTEND=noninteractive \
  NODE_VERSION=0.10.40

RUN apt-get update && \
  apt-get install --yes \
  ca-certificates \
  curl \
  git \
  build-essential \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/* && \
  apt-get clean

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz" \
  | tar -xz -C /usr/local --strip-components=1

# Optional sanity check
RUN node -v && npm -v

RUN useradd meteor -G staff -m -s /bin/bash
USER meteor

# install meteor
RUN curl https://install.meteor.com | sh

COPY --chown=meteor:staff . /home/meteor/src
RUN rm -rf /home/meteor/src/.meteor/local

# build the app
RUN cd /home/meteor/src && \
  mkdir -p /home/meteor/build && \
  NODE_TLS_REJECT_UNAUTHORIZED=0 /home/meteor/.meteor/meteor build --directory /home/meteor/build && \
  cd /home/meteor/build/bundle/programs/server && \
  npm install --production

# cleanup
RUN rm -rf /home/meteor/.meteor
RUN rm -rf /home/meteor/src

WORKDIR /home/meteor/build/bundle

EXPOSE 3000

CMD ["node", "./main.js"]
