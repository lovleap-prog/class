#!/bin/sh
# 맥에서는 이 파일을 더블클릭하면 됩니다.
cd "$(dirname "$0")" || exit 1
PORT=8000

echo ""
echo "  학교 교육활동 관리 - 로컬 실행"
echo "  ------------------------------------"
echo ""

open_browser() {
  sleep 1
  if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT"
  fi
}

if command -v python3 >/dev/null 2>&1; then
  echo "  파이썬으로 실행합니다.  http://localhost:$PORT"
  open_browser &
  exec python3 -m http.server "$PORT" --directory app
elif command -v node >/dev/null 2>&1; then
  echo "  Node.js 로 실행합니다.  http://localhost:$PORT"
  open_browser &
  exec node tools/serve.mjs "$PORT"
else
  echo "  [안내] 파이썬도 Node.js 도 없습니다."
  echo "  자세한 내용: docs/START-LOCAL.md"
  read -r _
fi
