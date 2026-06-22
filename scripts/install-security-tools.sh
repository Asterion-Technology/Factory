#!/usr/bin/env bash
# Install security tools in devcontainer — runs once after container creation
set -euo pipefail

echo "── Installing factory security tools ───────────────"

# Gitleaks
if ! command -v gitleaks &>/dev/null; then
  GITLEAKS_VERSION="8.21.2"
  curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    | tar -xz -C /usr/local/bin gitleaks
  echo "[ok]  Gitleaks ${GITLEAKS_VERSION} installed"
else
  echo "[ok]  Gitleaks already installed: $(gitleaks version)"
fi

# Trivy
if ! command -v trivy &>/dev/null; then
  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
    | sh -s -- -b /usr/local/bin
  echo "[ok]  Trivy installed: $(trivy --version | head -1)"
else
  echo "[ok]  Trivy already installed: $(trivy --version | head -1)"
fi

# Semgrep
if ! command -v semgrep &>/dev/null; then
  pip3 install semgrep --quiet
  echo "[ok]  Semgrep installed: $(semgrep --version)"
else
  echo "[ok]  Semgrep already installed: $(semgrep --version)"
fi

# Playwright browsers
if command -v npx &>/dev/null; then
  npx playwright install --with-deps chromium 2>/dev/null || echo "[warn] Playwright browser install skipped"
  echo "[ok]  Playwright Chromium installed"
fi

echo ""
echo "[ok]  Security tools ready."
