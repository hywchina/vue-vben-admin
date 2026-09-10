#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly RUNTIME_DIR="${SCRIPT_DIR}/.rail-platform-runtime"
readonly PID_FILE="${RUNTIME_DIR}/dev.pid"
readonly LOG_FILE="${RUNTIME_DIR}/dev.log"
readonly COMPOSE_FILE="${SCRIPT_DIR}/deploy/rail-platform/compose.yaml"
readonly WEB_URL="http://127.0.0.1:5666"
readonly API_READY_URL="http://127.0.0.1:5320/api/v1/health/ready"
readonly REQUIRED_PNPM_VERSION="11.16.0"

if [[ -t 1 ]]; then
  readonly COLOR_GREEN=$'\033[32m'
  readonly COLOR_YELLOW=$'\033[33m'
  readonly COLOR_RED=$'\033[31m'
  readonly COLOR_BLUE=$'\033[34m'
  readonly COLOR_RESET=$'\033[0m'
else
  readonly COLOR_GREEN=''
  readonly COLOR_YELLOW=''
  readonly COLOR_RED=''
  readonly COLOR_BLUE=''
  readonly COLOR_RESET=''
fi

info() {
  printf '%s[INFO]%s %s\n' "$COLOR_BLUE" "$COLOR_RESET" "$*"
}

success() {
  printf '%s[ OK ]%s %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$*"
}

warn() {
  printf '%s[WARN]%s %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$*" >&2
}

fail() {
  printf '%s[FAIL]%s %s\n' "$COLOR_RED" "$COLOR_RESET" "$*" >&2
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

activate_node() {
  local nvm_home="${NVM_DIR:-${HOME}/.nvm}"
  if [[ -s "${nvm_home}/nvm.sh" ]]; then
    export NVM_DIR="$nvm_home"
    set +u
    # shellcheck source=/dev/null
    source "${NVM_DIR}/nvm.sh"
    set -u
    if [[ -f "${SCRIPT_DIR}/.nvmrc" ]]; then
      nvm use --silent >/dev/null 2>&1 || true
    fi
  fi
}

node_version_supported() {
  local version="${1#v}"
  local major minor
  IFS='.' read -r major minor _ <<<"$version"
  [[ "$major" == "22" && "${minor:-0}" -ge 18 ]] ||
    [[ "$major" == "24" && "${minor:-0}" -ge 12 ]]
}

read_pid() {
  if [[ -f "$PID_FILE" ]]; then
    tr -dc '0-9' <"$PID_FILE"
  fi
}

managed_process_running() {
  local pid process_command
  pid="$(read_pid)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1 || return 1
  process_command="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$process_command" == *"pnpm"*"dev:rail"* ]]
}

port_is_listening() {
  local port="$1"
  if command_exists ss; then
    [[ -n "$(ss -ltnH "sport = :${port}" 2>/dev/null)" ]]
  elif command_exists lsof; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

http_ok() {
  local url="$1"
  curl --noproxy '*' --silent --show-error --fail \
    --output /dev/null --max-time 3 "$url" >/dev/null 2>&1
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

create_start_log() {
  local timestamp log_path
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  log_path="${RUNTIME_DIR}/dev-${timestamp}.log"

  if [[ -e "$log_path" ]]; then
    log_path="${RUNTIME_DIR}/dev-${timestamp}-$$.log"
  fi

  if [[ -e "$LOG_FILE" && ! -L "$LOG_FILE" ]]; then
    mv "$LOG_FILE" "${RUNTIME_DIR}/dev-legacy-${timestamp}.log"
  fi
  ln -sfn "$(basename "$log_path")" "$LOG_FILE"

  {
    printf '%s\n' '============================================================'
    printf '启动时间：%s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"
    printf '仓库目录：%s\n' "$SCRIPT_DIR"
    printf '日志文件：%s\n' "$log_path"
    printf '%s\n\n' '============================================================'
  } >"$log_path"

  printf '%s\n' "$log_path"
}

check_env() {
  local errors=0
  local node_version pnpm_version available_kib

  printf '\n轨道客室智能设计平台 · 本地开发环境检查\n'
  printf '仓库：%s\n\n' "$SCRIPT_DIR"

  activate_node

  if command_exists node; then
    node_version="$(node --version)"
    if node_version_supported "$node_version"; then
      success "Node.js ${node_version}（满足 ^22.18.0 或 ^24.12.0）"
    else
      fail "Node.js ${node_version} 不受支持；请执行 nvm install 24.16.0"
      errors=$((errors + 1))
    fi
  else
    fail '未找到 Node.js；建议使用 NVM 安装 24.16.0'
    errors=$((errors + 1))
  fi

  if command_exists pnpm; then
    pnpm_version="$(pnpm --version 2>/dev/null || true)"
    if [[ "$pnpm_version" == "$REQUIRED_PNPM_VERSION" ]]; then
      success "pnpm ${pnpm_version}"
    else
      fail "pnpm ${pnpm_version:-不可用}；项目要求 ${REQUIRED_PNPM_VERSION}"
      printf '       修复：corepack prepare pnpm@%s --activate\n' \
        "$REQUIRED_PNPM_VERSION" >&2
      errors=$((errors + 1))
    fi
  else
    fail "未找到 pnpm；请执行 corepack prepare pnpm@${REQUIRED_PNPM_VERSION} --activate"
    errors=$((errors + 1))
  fi

  if command_exists docker; then
    success "Docker CLI：$(docker --version)"
    if docker info >/dev/null 2>&1; then
      success 'Docker daemon 可访问'
    else
      fail 'Docker daemon 不可访问；请启动 Docker 并检查当前用户权限'
      errors=$((errors + 1))
    fi
    if docker compose version >/dev/null 2>&1; then
      success "Docker Compose：$(docker compose version --short)"
    else
      fail '缺少 Docker Compose v2（docker compose）'
      errors=$((errors + 1))
    fi
  else
    fail '未找到 Docker'
    errors=$((errors + 1))
  fi

  for tool in curl setsid; do
    if command_exists "$tool"; then
      success "系统工具：${tool}"
    else
      fail "缺少系统工具：${tool}"
      errors=$((errors + 1))
    fi
  done

  if [[ -d "${SCRIPT_DIR}/node_modules" ]]; then
    success '项目依赖 node_modules 已安装'
  else
    fail '项目依赖尚未安装；请执行 pnpm install --frozen-lockfile'
    errors=$((errors + 1))
  fi

  available_kib="$(df -Pk "$SCRIPT_DIR" | awk 'NR == 2 { print $4 }')"
  if [[ "${available_kib:-0}" -ge 5242880 ]]; then
    success "磁盘可用空间：$(df -Ph "$SCRIPT_DIR" | awk 'NR == 2 { print $4 }')"
  else
    warn "磁盘可用空间不足 5 GiB：$(df -Ph "$SCRIPT_DIR" | awk 'NR == 2 { print $4 }')"
  fi

  if [[ -f "${SCRIPT_DIR}/apps/platform-api/.env" ]]; then
    success '平台 API 本地环境文件存在'
  else
    warn '未创建 apps/platform-api/.env，将使用开发默认配置'
  fi

  if ((errors > 0)); then
    printf '\n'
    fail "环境检查失败：${errors} 项必须修复"
    return 1
  fi

  printf '\n'
  success '环境检查通过'
}

assert_ports_available() {
  local occupied=0
  for port in 5320 5666; do
    if port_is_listening "$port"; then
      fail "端口 ${port} 已被其他进程占用"
      occupied=1
    fi
  done
  ((occupied == 0))
}

start_service() {
  local pid attempt run_log
  local services_only="${1:-}"
  if [[ -n "$services_only" && "$services_only" != "--services-only" ]]; then
    fail 'start 仅支持 --services-only 参数'
    return 2
  fi

  activate_node
  check_env

  if managed_process_running; then
    success "开发服务已在运行（PID $(read_pid)）"
    status_service
    return 0
  fi

  if [[ -f "$PID_FILE" ]]; then
    warn '发现无效 PID 文件，已清理'
    rm -f "$PID_FILE"
  fi
  assert_ports_available

  mkdir -p "$RUNTIME_DIR"
  run_log="$(create_start_log)"

  if [[ "$services_only" == "--services-only" ]]; then
    info '仅启动 API、Worker 和 Web；不执行迁移、种子或操作基础设施'
  else
    info '正在后台启动基础设施、迁移、种子、API、Worker 和 Web……'
  fi
  info "本次启动日志：${run_log}"
  (
    cd "$SCRIPT_DIR"
    if [[ "$services_only" == "--services-only" ]]; then
      exec setsid pnpm dev:rail:services
    fi
    exec setsid pnpm dev:rail
  ) >>"$run_log" 2>&1 </dev/null &
  pid=$!
  printf '%s\n' "$pid" >"$PID_FILE"

  for attempt in $(seq 1 90); do
    if ! managed_process_running; then
      fail '启动进程提前退出，最近日志如下：'
      tail -n 40 "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      return 1
    fi
    if http_ok "$WEB_URL" && http_ok "$API_READY_URL"; then
      success "开发服务启动完成（PID ${pid}）"
      printf 'Web：%s\n' "$WEB_URL"
      printf 'API：%s\n' "$API_READY_URL"
      printf '日志：%s\n' "$run_log"
      printf '当前日志快捷入口：%s\n' "$LOG_FILE"
      return 0
    fi
    if ((attempt % 10 == 0)); then
      info "仍在等待服务就绪（${attempt}/90 秒）"
    fi
    sleep 1
  done

  fail "服务在 90 秒内未完全就绪，请运行：$0 status"
  tail -n 40 "$LOG_FILE" >&2 || true
  return 1
}

status_service() {
  local pid all_healthy=1
  printf '\n轨道客室智能设计平台 · 运行状态\n\n'

  if managed_process_running; then
    pid="$(read_pid)"
    success "开发进程运行中（PID ${pid}）"
  else
    warn '没有由本脚本管理的开发进程'
    all_healthy=0
  fi

  if command_exists docker && docker info >/dev/null 2>&1; then
    printf '\nDocker 基础设施：\n'
    compose ps || all_healthy=0
  else
    fail 'Docker daemon 不可访问'
    all_healthy=0
  fi

  printf '\nHTTP 服务：\n'
  if http_ok "$WEB_URL"; then
    success "Web    ${WEB_URL}"
  else
    fail "Web    ${WEB_URL}"
    all_healthy=0
  fi
  if http_ok "$API_READY_URL"; then
    success "API    ${API_READY_URL}"
  else
    fail "API    ${API_READY_URL}"
    all_healthy=0
  fi

  for port in 9000 9001 8025; do
    if port_is_listening "$port"; then
      success "端口   ${port} 正在监听"
    else
      warn "端口   ${port} 未监听"
      all_healthy=0
    fi
  done

  printf '\n当前日志：%s\n' "$LOG_FILE"
  if [[ -L "$LOG_FILE" ]]; then
    printf '本次文件：%s\n' "$(readlink -f "$LOG_FILE")"
  fi
  if [[ -f "$LOG_FILE" ]]; then
    printf '最近 8 行：\n'
    tail -n 8 "$LOG_FILE"
  fi

  ((all_healthy == 1))
}

stop_dev_process() {
  local pid attempt
  if ! managed_process_running; then
    warn '开发进程未运行或不是由本脚本启动'
    rm -f "$PID_FILE"
    return 0
  fi

  pid="$(read_pid)"
  info "正在停止开发进程组（PID ${pid}）……"
  kill -TERM -- "-${pid}" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for attempt in $(seq 1 15); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      success 'Web、API 和 Worker 已停止'
      return 0
    fi
    sleep 1
  done

  warn '进程未在 15 秒内退出，发送 KILL 信号'
  kill -KILL -- "-${pid}" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  success '开发进程已强制停止'
}

stop_service() {
  local keep_infra="${1:-}"
  activate_node
  stop_dev_process

  if [[ "$keep_infra" == "--keep-infra" ]]; then
    info '按要求保留 PostgreSQL、MinIO 和 Mailpit 容器运行'
    return 0
  fi

  if command_exists docker && docker info >/dev/null 2>&1; then
    info '正在停止开发基础设施（保留命名卷和数据）……'
    compose down
    success 'Docker 基础设施已停止，数据卷已保留'
  else
    warn 'Docker daemon 不可访问，未能停止基础设施容器'
  fi
}

restart_service() {
  if [[ "${1:-}" == "--services-only" ]]; then
    stop_service --keep-infra
    start_service --services-only
    return
  fi
  stop_service "${1:-}"
  start_service
}

show_logs() {
  local lines="${1:-80}"
  if [[ ! "$lines" =~ ^[0-9]+$ ]]; then
    fail '日志行数必须是正整数'
    return 2
  fi
  if [[ ! -f "$LOG_FILE" ]]; then
    fail "日志文件不存在：${LOG_FILE}"
    return 1
  fi
  tail -n "$lines" -f "$LOG_FILE"
}

show_help() {
  cat <<EOF
用法：$(basename "$0") <command> [options]

本地开发环境管理命令：
  check_env              检查 Node、pnpm、Docker、系统工具、依赖和磁盘
  start                  后台一键启动基础设施、迁移、API、Worker 和 Web
  status                 查看进程、Docker、端口、HTTP 健康和最近日志
  stop                   停止开发进程和 Compose；保留数据库/MinIO 数据卷
  stop --keep-infra      只停止 Web、API 和 Worker，保留基础设施容器运行
  restart                完整停止后重新启动
  start --services-only  仅启动 Web/API/Worker；依赖须已经就绪
  restart --services-only  仅重启 Web/API/Worker；不操作数据库迁移和基础设施
  logs [行数]            持续查看本次启动日志，默认先显示最后 80 行
  help                   显示本帮助

访问地址：
  Web        http://localhost:5666
  API        http://localhost:5320/api/v1
  MinIO      http://localhost:9001
  Mailpit    http://localhost:8025

日志：每次 start/restart 会生成 dev-YYYYMMDD-HHMMSS.log，dev.log 始终指向本次日志。
说明：stop/restart 永远不会执行 docker compose down -v。
EOF
}

main() {
  local command="${1:-help}"
  shift || true

  case "$command" in
    check | check-env | check_env)
      check_env "$@"
      ;;
    start)
      start_service "$@"
      ;;
    status)
      status_service "$@"
      ;;
    stop)
      stop_service "$@"
      ;;
    restart)
      restart_service "$@"
      ;;
    logs)
      show_logs "$@"
      ;;
    help | -h | --help)
      show_help
      ;;
    *)
      fail "未知命令：${command}"
      printf '\n'
      show_help
      return 2
      ;;
  esac
}

main "$@"
