#!/bin/bash

# Helper script to view logs from the web-browsers container
# Usage: ./view-logs.sh [log-type] [options]

CONTAINER_NAME="web-browsers-app"

show_help() {
  echo "Usage: ./view-logs.sh [log-type] [options]"
  echo ""
  echo "Log types:"
  echo "  queue       - View queue workers log (/tmp/queue-workers.log)"
  echo "  puppeteer   - View puppeteer session log (/tmp/puppeteer-session.log)"
  echo "  pm2         - View PM2 logs for queue-workers"
  echo "  pm2-api     - View PM2 logs for api-server"
  echo "  pm2-all     - View all PM2 logs"
  echo "  all         - View all logs combined"
  echo ""
  echo "Options:"
  echo "  -f, --follow    Follow log output (tail -f)"
  echo "  -n <lines>      Show last N lines (default: 100)"
  echo ""
  echo "Examples:"
  echo "  ./view-logs.sh queue              # Show last 100 lines of queue workers log"
  echo "  ./view-logs.sh queue -f           # Follow queue workers log"
  echo "  ./view-logs.sh queue -n 500       # Show last 500 lines"
  echo "  ./view-logs.sh puppeteer -f       # Follow puppeteer session log"
  echo "  ./view-logs.sh pm2                # View PM2 logs"
}

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '${CONTAINER_NAME}' is not running"
  echo "Start it with: docker-compose up -d"
  exit 1
fi

LOG_TYPE=${1:-queue}
FOLLOW=false
LINES=100

# Parse arguments
shift
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--follow)
      FOLLOW=true
      shift
      ;;
    -n)
      LINES="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

case $LOG_TYPE in
  queue)
    echo "=== Queue Workers Log ==="
    if [ "$FOLLOW" = true ]; then
      docker exec -it $CONTAINER_NAME tail -f /tmp/queue-workers.log
    else
      docker exec -it $CONTAINER_NAME tail -n $LINES /tmp/queue-workers.log
    fi
    ;;
  puppeteer)
    echo "=== Puppeteer Session Log ==="
    if [ "$FOLLOW" = true ]; then
      docker exec -it $CONTAINER_NAME tail -f /tmp/puppeteer-session.log
    else
      docker exec -it $CONTAINER_NAME tail -n $LINES /tmp/puppeteer-session.log
    fi
    ;;
  pm2)
    echo "=== PM2 Queue Workers Logs ==="
    if [ "$FOLLOW" = true ]; then
      docker exec -it $CONTAINER_NAME pm2 logs queue-workers
    else
      docker exec -it $CONTAINER_NAME pm2 logs queue-workers --lines $LINES --nostream
    fi
    ;;
  pm2-api)
    echo "=== PM2 API Server Logs ==="
    if [ "$FOLLOW" = true ]; then
      docker exec -it $CONTAINER_NAME pm2 logs api-server
    else
      docker exec -it $CONTAINER_NAME pm2 logs api-server --lines $LINES --nostream
    fi
    ;;
  pm2-all)
    echo "=== All PM2 Logs ==="
    if [ "$FOLLOW" = true ]; then
      docker exec -it $CONTAINER_NAME pm2 logs
    else
      docker exec -it $CONTAINER_NAME pm2 logs --lines $LINES --nostream
    fi
    ;;
  all)
    echo "=== All Logs Combined ==="
    echo ""
    echo "--- Queue Workers Log (last 50 lines) ---"
    docker exec -it $CONTAINER_NAME tail -n 50 /tmp/queue-workers.log 2>/dev/null || echo "No queue workers log found"
    echo ""
    echo "--- Puppeteer Session Log (last 50 lines) ---"
    docker exec -it $CONTAINER_NAME tail -n 50 /tmp/puppeteer-session.log 2>/dev/null || echo "No puppeteer log found"
    echo ""
    echo "--- PM2 Logs (last 50 lines) ---"
    docker exec -it $CONTAINER_NAME pm2 logs --lines 50 --nostream
    ;;
  -h|--help|help)
    show_help
    exit 0
    ;;
  *)
    echo "Unknown log type: $LOG_TYPE"
    echo ""
    show_help
    exit 1
    ;;
esac
