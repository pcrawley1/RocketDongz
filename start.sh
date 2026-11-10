#!/bin/sh
# Serve the dashboard locally (ES modules need http://, not file://)
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "RocketDongz dashboard → http://localhost:$PORT"
python3 -m http.server "$PORT"
