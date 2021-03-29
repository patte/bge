FROM node:0.10.40-slim

LABEL base.image="node:8-slim"
LABEL software="bge"
LABEL software.description="answer questions, get bubbles"

RUN apt-get update && \
  apt-get install --yes \
    git curl && \
  rm -rf /var/lib/apt/lists/* && \
  apt-get clean

RUN useradd meteor -G staff -m -s /bin/bash
USER meteor

# install meteor
RUN curl https://install.meteor.com | sh

COPY --chown=meteor:staff . /home/meteor/src
RUN rm -rf /home/meteor/src/.meteor/local

# build the app
RUN cd /home/meteor/src && \
  mkdir -p /home/meteor/build && \
  /home/meteor/.meteor/meteor build --directory /home/meteor/build && \
  cd /home/meteor/build/bundle/programs/server && \
  npm install --production

# cleanup
RUN rm -rf /home/meteor/.meteor
RUN rm -rf /home/meteor/src

WORKDIR /home/meteor/build/bundle

EXPOSE 3000

CMD ["node", "./main.js"]
