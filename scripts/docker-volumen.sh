#!/usr/bin/env bash


export DOCKER_BASE_PATH=${DOCKER_BASE_PATH:-$(pwd)}

# Inlude library utils
libdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1090
. "$libdir/utils.sh"

usage="
create docker volumes

Syntax: $(basename "$0") [-help] 

Where:
    -help show this help text.
    -p path to de roOt project
"

while getopts ":h:p:" opt; do
  case ${opt} in
    h )
      info "${usage}"
      exit -1
      ;;
    p )
      DOCKER_BASE_PATH=$OPTARG
      ;;
    \? )
      ;;
    : )
      ;;
  esac
done

shift $((OPTIND -1))

# create volumes
info "creating volumes..."
mkdir -pv ${DOCKER_BASE_PATH}/{.config,.cache,.local,.npm,src/node_modules}

# settings permissions
info "settings permissions..."
chmod -R 777 ${DOCKER_BASE_PATH}/.config
chmod -R 777 ${DOCKER_BASE_PATH}/.cache
chmod -R 777 ${DOCKER_BASE_PATH}/.local
chmod -R 777 ${DOCKER_BASE_PATH}/.npm
chmod -R 777 ${DOCKER_BASE_PATH}/src/node_modules