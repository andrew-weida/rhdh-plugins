#!/usr/bin/env bash
#
# Build the Augment dynamic plugins and package the frontend and backend
# into a single OCI image using the official @red-hat-developer-hub/cli
# packaging flow.
#
# Usage: ./scripts/build-dynamic-plugins.sh [--push]
#
# Options:
#   --push    Push the built image to the registry after packaging
#
# Produces one OCI image containing both plugins:
#   <IMAGE_REGISTRY>/<IMAGE_NAME>:<VERSION>
#
# Environment variables:
#   IMAGE_REGISTRY   Registry + repo to tag the image with, e.g. quay.io/myorg
#                    (required)
#   IMAGE_NAME       Image name. Default: augment
#   VERSION          Image tag. Default: version from plugins/augment/package.json
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# @red-hat-developer-hub/cli is a pinned devDependency (see package.json) rather
# than being invoked via `npx @red-hat-developer-hub/cli@latest`. npx installs
# the CLI into an isolated tree that resolves two conflicting webpack versions
# (the CLI's own `webpack: ~5.96.0` vs the `webpack@5.112.2` pulled in by its
# own @backstage/cli / @openshift/dynamic-plugin-sdk-webpack dependencies),
# which crashes `plugin export` with "Cannot read properties of undefined
# (reading 'tap')". Installing it locally lets the `webpack` entry in
# package.json's `resolutions` dedupe it to a single version.
RHDH_CLI_BIN="${WORKSPACE_DIR}/node_modules/.bin/rhdh-cli"
EMBED_PACKAGE="@red-hat-developer-hub/backstage-plugin-augment-common"
PLUGINS=("augment" "augment-backend")

IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
IMAGE_NAME="${IMAGE_NAME:-augment}"
PUSH_IMAGE=false

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "==> $*"
}

check_prerequisites() {
  local missing=()
  for cmd in node yarn podman; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: missing required commands: ${missing[*]}" >&2
    exit 1
  fi

  if [[ -z "$IMAGE_REGISTRY" ]]; then
    echo "ERROR: IMAGE_REGISTRY must be set, e.g. IMAGE_REGISTRY=quay.io/myorg $0" >&2
    exit 1
  fi
}

get_version() {
  node -e "console.log(require('${WORKSPACE_DIR}/plugins/augment/package.json').version)"
}

install_dependencies() {
  log "Installing workspace dependencies"
  yarn --cwd "$WORKSPACE_DIR" install --immutable
}

build_workspace() {
  log "Building all workspace packages"
  yarn --cwd "$WORKSPACE_DIR" build:all
}

clean_dist_dynamic() {
  local plugin_dir="$1"
  local dist_path="${WORKSPACE_DIR}/plugins/${plugin_dir}/dist-dynamic"

  if [[ -d "$dist_path" ]]; then
    log "Cleaning stale dist-dynamic: ${plugin_dir}"
    rm -rf "$dist_path"
  fi
}

export_plugin() {
  local plugin_dir="$1"
  local plugin_path="${WORKSPACE_DIR}/plugins/${plugin_dir}"

  if [[ ! -d "$plugin_path" ]]; then
    echo "ERROR: plugin directory not found: $plugin_path" >&2
    exit 1
  fi

  clean_dist_dynamic "$plugin_dir"

  log "Exporting dynamic plugin: ${plugin_dir}"
  (cd "$plugin_path" && "$RHDH_CLI_BIN" plugin export \
    --embed-package "$EMBED_PACKAGE")
}

package_plugins() {
  local version="$1"
  local image_tag="${IMAGE_REGISTRY}/${IMAGE_NAME}:${version}"

  log "Packaging combined image: ${image_tag}"
  # Run from the workspace root (not a specific plugin dir) so the CLI
  # discovers every plugins/*/dist-dynamic folder and bundles them all
  # into a single multi-plugin OCI image.
  (cd "$WORKSPACE_DIR" && "$RHDH_CLI_BIN" plugin package \
    -t "$image_tag")
}

push_image() {
  local version="$1"
  local image_tag="${IMAGE_REGISTRY}/${IMAGE_NAME}:${version}"

  log "Pushing image: ${image_tag}"
  podman push "$image_tag"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --push) PUSH_IMAGE=true ;;
      *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
    esac
  done
}

main() {
  parse_args "$@"
  check_prerequisites
  install_dependencies
  build_workspace

  for plugin_dir in "${PLUGINS[@]}"; do
    export_plugin "$plugin_dir"
  done

  local version
  version="${VERSION:-$(get_version)}"
  package_plugins "$version"

  log "Done. Image built:"
  podman images --filter "reference=${IMAGE_REGISTRY}/${IMAGE_NAME}"

  if [[ "$PUSH_IMAGE" == true ]]; then
    push_image "$version"
    log "Image pushed."
  fi
}

main "$@"
