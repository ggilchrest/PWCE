#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
seed_config="$repo_root/docker/home-assistant/configuration.yaml"

if [ "${1:-}" != "" ] && [ "${1:-}" != "--multi-site" ]; then
  echo "usage: $0 [--multi-site]" >&2
  exit 2
fi

seed_site() {
  state_dir="$repo_root/.dev/$1"
  target_config="$state_dir/configuration.yaml"
  mkdir -p "$state_dir"
  if [ ! -s "$target_config" ]; then
    cp "$seed_config" "$target_config"
    echo "Seeded $target_config"
  else
    echo "Keeping existing $target_config"
  fi
}

seed_site home-assistant
if [ "${1:-}" = "--multi-site" ]; then
  seed_site home-assistant-two
fi
