#!/usr/bin/env bash
set -euo pipefail
directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PLATFORM_CONFIG_FILE=${PLATFORM_CONFIG_FILE:-"$directory/config.env"}
compose=(docker compose --env-file "$PLATFORM_CONFIG_FILE" -f "$directory/compose.yaml")
case "${1:-help}" in
  init)
    if [[ -e "$PLATFORM_CONFIG_FILE" ]]; then
      echo "Configuration already exists: $PLATFORM_CONFIG_FILE" >&2
      exit 1
    fi
    umask 077
    cp "$directory/config.example.env" "$PLATFORM_CONFIG_FILE"
    for placeholder in DATABASE_PASSWORD STORAGE_ACCOUNT STORAGE_PASSWORD RANDOM_SECRET_AT_LEAST_32_CHARACTERS ADMIN_PASSWORD; do
      secret=$(openssl rand -hex 24)
      sed -i "s/CHANGE_ME_$placeholder/$secret/g" "$PLATFORM_CONFIG_FILE"
    done
    echo "Created $PLATFORM_CONFIG_FILE; set deployment addresses before starting."
    ;;
  build) "${compose[@]}" build platform ;;
  up) "${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180 ;;
  stop) "${compose[@]}" stop ;;
  status) "${compose[@]}" ps ;;
  logs) "${compose[@]}" logs --tail 100 -f platform ;;
  export)
    destination=${2:?Usage: platform.sh export /path/to/images}
    mkdir -p "$destination"
    mapfile -t images < <("${compose[@]}" config --format json | python3 -c \
      'import json,sys; s=json.load(sys.stdin)["services"]; print("\n".join(s[n]["image"] for n in ("platform","postgres","minio","mailpit")))')
    [[ ${#images[@]} -eq 4 ]]
    business=("${images[0]}")
    infrastructure=("${images[@]:1}")
    docker image save -o "$destination/platform.tar.tmp" "${business[@]}"
    mv "$destination/platform.tar.tmp" "$destination/platform.tar"
    docker image save -o "$destination/platform-infrastructure.tar.tmp" "${infrastructure[@]}"
    mv "$destination/platform-infrastructure.tar.tmp" "$destination/platform-infrastructure.tar"
    (cd "$destination" && sha256sum platform.tar platform-infrastructure.tar > platform.sha256)
    docker image inspect --format '{{.RepoTags}} {{.Id}} {{.Os}}/{{.Architecture}}' \
      "${business[@]}" "${infrastructure[@]}" > "$destination/platform-images.txt"
    echo "Exported platform image, infrastructure images and checksums to $destination"
    ;;
  *) echo 'Usage: platform.sh {init|build|up|stop|status|logs|export /path/to/images}' ;;
esac
