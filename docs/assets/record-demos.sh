#!/usr/bin/env bash
# Reproducible demo recordings for the README GIFs.
# Requires charmbracelet/vhs:  brew install vhs
#
# Records:
#   init-demo.gif  — `init` against the healthy fixture (wordmark, spinner
#                    phases, summary card)
#   check-demo.gif — `check` against drifted-server.mjs (mini-diffs and the
#                    breaking verdict)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEMO=/tmp/mcp-testmate-vhs

rm -rf "$DEMO"
mkdir -p "$DEMO/bin" "$DEMO/init-demo" "$DEMO/check-demo"

# PATH shim so the tapes can type `mcp-testmate` like a user would
cat > "$DEMO/bin/mcp-testmate" <<EOF
#!/usr/bin/env bash
exec node "$ROOT/bin/cli.mjs" "\$@"
EOF
chmod +x "$DEMO/bin/mcp-testmate"

node "$ROOT/test/fixtures/demo-server.mjs" 7399 >/dev/null 2>&1 &
GOOD=$!
node "$ROOT/docs/assets/drifted-server.mjs" 7398 >/dev/null 2>&1 &
BAD=$!
trap 'kill $GOOD $BAD 2>/dev/null || true' EXIT
sleep 1.5

# check-demo baseline: snapshot the HEALTHY server, then point the config at
# the drifted one — i.e. "the last commit changed the server"
(
  cd "$DEMO/check-demo"
  node "$ROOT/bin/cli.mjs" init --url http://127.0.0.1:7399/mcp >/dev/null
  node -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync("mcp-testmate.config.json", "utf8"));
    c.target.url = "http://127.0.0.1:7398/mcp";
    fs.writeFileSync("mcp-testmate.config.json", JSON.stringify(c, null, 2));
  '
)

cd "$ROOT/docs/assets"
vhs init-demo.tape
vhs check-demo.tape
ls -lh "$ROOT"/docs/assets/*.gif
