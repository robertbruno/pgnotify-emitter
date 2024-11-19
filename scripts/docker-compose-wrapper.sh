#!/usr/bin/env bash

# docker plugins directory
export DOCKER_PLUGINS_PATH=${DOCKER_PLUGINS_PATH:-"~/.docker/cli-plugins"}

# To disable native builds, and to use the built-in python client.
# Which allows you to use BuildKit to perform builds.
export COMPOSE_DOCKER_CLI_BUILD=${COMPOSE_DOCKER_CLI_BUILD:-1}

# Support for building using Buildkit which is an alternative builder with great capabilities, 
# like caching, concurrency and ability to use custom BuildKit front-ends just to mention a few…
export DOCKER_BUILDKIT=${DOCKER_BUILDKIT:-1}

# the arguments options compatibility to docker compose
export DOCKER_COMPOSE_ARGS_OPTS=${DOCKER_COMPOSE_ARGS_OPTS:-""}

# You can set custom URL to download docker compose installation script
export DOCKER_COMPOSE_DOWNLOAD_URL=${DOCKER_COMPOSE_DOWNLOAD_URL:-"https://github.com/docker/compose/releases/download/v2.0.0/docker-compose-linux-amd64"}

# Inlude library utils
libdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
. "$libdir/utils.sh"

usage="
Wrapper for docker compose

Syntax: $(basename "$0") [-help] 

Where:
    -help show this help text.
    -p docker plugins path
    -a docker compose args options. Use to fix wrapper options.
    -u docker compose url from download
"

while getopts ":h:p:a:" opt; do
  case ${opt} in
    h )
      info "${usage}"
      exit -1
      ;;
    a )
      DOCKER_COMPOSE_ARGS_OPTS=$OPTARG
      ;;      
    p )
      DOCKER_PLUGINS_PATH=$OPTARG
      ;;
    u )
      DOCKER_COMPOSE_DOWNLOAD_URL=$OPTARG
      ;;
    \? )
      ;;
    : )
      ;;
  esac
done

shift $((OPTIND -1))

trap interrupt INT TERM

# Detect docker
if ! command -v docker >/dev/null 2>&1 ; then
    error "Error: /usr/bin/docker not found."
    info "${usage}"
    exit 1
fi

if ! command -v docker compose version >/dev/null 2>&1 ; then
    info "docker compose plugin not found."
    info "Installing docker compose..."

    # Crea una carpeta en donde alojar docker-compose
    mkdir -p $DOCKER_PLUGINS_PATH

    # Descarga el ejecutable
    curl -SL ${DOCKER_COMPOSE_DOWNLOAD_URL} \
    -o ${DOCKER_PLUGINS_PATH}/docker-compose

    # da permisos de ejcución
    chmod +x ${DOCKER_PLUGINS_PATH}/docker-compose
fi

env UID=${UID} env GID=${GID} docker compose $DOCKER_COMPOSE_ARGS_OPTS $@

finished $?