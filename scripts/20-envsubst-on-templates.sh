#!/bin/sh

export CONFIG_DIR=${CONFIG_DIR:-"/opt/pgnotify-emitter"}
export PGHOST=${PGHOST:-"postgres"}
export PGPORT=${PGPORT:-5432}
export PGDATABASE=${PGDATABASE:-"postgres"}
export PGUSER=${PGUSER:-"postgres"}
export PGPASSWORD=${PGPASSWORD:-"postgres"}
export PGSSLMODE=${PGSSLMODE:-false}
export EMITTER_HOST=${EMITTER_HOST:-"emitter"}
export EMITTER_PORT=${EMITTER_PORT:-"8080"}
export EMITTER_SECURE=${EMITTER_SECURE:-false}
export PGNOTIFY_CHANNEL=${PGNOTIFY_CHANNEL:-"emitter-channel"}
export PGNOTIFY_DEBUG=${PGNOTIFY_DEBUG:-true}
export EMITTERKEYGEN_KEY=${EMITTERKEYGEN_KEY:-""}
export EMITTERKEYGEN_TYPE=${EMITTERKEYGEN_TYPE:-"rwlsp"}
export EMITTERKEYGEN_TTL=${EMITTERKEYGEN_TTL:-0}
export USE_TEMPLATE=${USE_TEMPLATE:-"true"}

set -e

ME=$(basename "$0")

entrypoint_log() {
    if [ -z "${ENTRYPOINT_QUIET_LOGS:-}" ]; then
        echo "$@"
    fi
}

auto_envsubst() {
  local template_dir="${ENVSUBST_TEMPLATE_DIR:-$CONFIG_DIR/templates}"
  local suffix="${ENVSUBST_TEMPLATE_SUFFIX:-.template}"
  local output_dir="${ENVSUBST_OUTPUT_DIR:-$CONFIG_DIR}"
  local filter="${ENVSUBST_FILTER:-}"

  local template defined_envs relative_path output_path subdir
  defined_envs=$(printf '${%s} ' $(awk "END { for (name in ENVIRON) { print ( name ~ /${filter}/ ) ? name : \"\" } }" < /dev/null ))
  [ -d "$template_dir" ] || return 0
  if [ ! -w "$output_dir" ]; then
    entrypoint_log "$ME: ERROR: $template_dir exists, but $output_dir is not writable"
    return 0
  fi
  find "$template_dir" -follow -type f -name "*$suffix" -print | while read -r template; do
    relative_path="${template#"$template_dir/"}"
    output_path="$output_dir/${relative_path%"$suffix"}"
    subdir=$(dirname "$relative_path")
    # create a subdirectory where the template file exists
    mkdir -p "$output_dir/$subdir"
    entrypoint_log "$ME: Running envsubst on $template to $output_path"
    envsubst "$defined_envs" < "$template" > "$output_path"
  done

}


if [ -n "${USE_TEMPLATE}" ]; then
  echo "Using environment variables..."
  auto_envsubst
else
  echo "Skipping environment variables..."  
fi

exit 0
