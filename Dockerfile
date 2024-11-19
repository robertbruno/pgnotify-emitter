FROM node:14-alpine

# Args
ARG VERSION=${VERSION:-1.0.0}
ARG MAINTAINER=${MAINTAINER:-rbruno}
ARG HTTP_SERVER_PORT=${HTTP_SERVER_PORT:-9021}

# Labels

# Labels
LABEL maintainer="${MAINTAINER}" \
    org.opencontainers.image.authors="${MAINTAINER}" \
    org.opencontainers.image.source="https://github.com/robertbruno/pgnotify-emitter" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.title="pgnotify-emitter" \
    org.opencontainers.image.description="Docker for pgnotify-emitter"

ENV NODE_ENV=production \
    CMD=/opt/${SERVICE_NAME}/${SERVICE_NAME}.js

# install gettext for envsubst
RUN apk update && apk add gettext

WORKDIR /opt/${SERVICE_NAME}/

COPY ./src/package.json .

RUN npm install --production 

COPY ./src .
RUN chmod +x $CMD

COPY scripts/docker-entrypoint.sh /
COPY scripts/20-envsubst-on-templates.sh /docker-entrypoint.d/20-envsubst-on-templates.sh
RUN chmod +x /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.d/20-envsubst-on-templates.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

EXPOSE ${HTTP_SERVER_PORT}

STOPSIGNAL SIGQUIT

CMD $CMD
