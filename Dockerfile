FROM node:9-alpine

WORKDIR /usr/src/app

COPY package.json /usr/src/app/
COPY yarn.lock /usr/src/app/
RUN yarn install
COPY ./src /usr/src/app/src

EXPOSE 8080
VOLUME /etc/features
CMD [ "npm", "start", "/etc/features/config.json" ]
