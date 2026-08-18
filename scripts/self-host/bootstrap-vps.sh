#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${ALLOW_VPS_BOOTSTRAP:-NO}" != "YES" ]]; then
  echo "error: bootstrap refused; set ALLOW_VPS_BOOTSTRAP=YES after reviewing this script" >&2
  exit 1
fi

if [[ ${EUID} -ne 0 ]]; then
  echo "error: run with sudo/root: sudo ALLOW_VPS_BOOTSTRAP=YES bash $0" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "error: /etc/os-release is unavailable" >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release

case "${ID}:${VERSION_ID}" in
  ubuntu:24.04)
    docker_distribution=ubuntu
    ;;
  debian:12)
    docker_distribution=debian
    ;;
  *)
    echo "error: tested only on Ubuntu 24.04 and Debian 12; detected ${ID} ${VERSION_ID}" >&2
    exit 1
    ;;
esac

architecture="$(dpkg --print-architecture)"
if [[ "$architecture" != "amd64" ]]; then
  echo "error: this project bootstrap intentionally requires amd64/x86_64; detected $architecture" >&2
  exit 1
fi

echo "installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  git \
  jq \
  openssl \
  postgresql-client \
  rclone \
  ufw \
  unattended-upgrades

echo "removing conflicting distribution Docker packages when present"
conflicting_packages=(
  docker.io
  docker-compose
  docker-compose-v2
  docker-doc
  podman-docker
  containerd
  runc
)
for package_name in "${conflicting_packages[@]}"; do
  if dpkg-query -W -f='${db:Status-Status}' "$package_name" 2>/dev/null | grep -qx installed; then
    apt-get remove -y "$package_name"
  fi
done

echo "configuring Docker's official apt repository"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/${docker_distribution}/gpg" \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${docker_distribution}
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: ${architecture}
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update
apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

systemctl enable --now docker

echo "configuring bounded Docker daemon logs"
install -m 0755 -d /etc/docker
if [[ -e /etc/docker/daemon.json ]]; then
  backup_path="/etc/docker/daemon.json.before-medoria.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a /etc/docker/daemon.json "$backup_path"
  echo "existing daemon.json preserved at: $backup_path"
  echo "not replacing existing daemon.json automatically; Compose-level log limits remain active"
else
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  },
  "live-restore": true
}
EOF
  systemctl restart docker
fi

echo "enabling automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

mkdir -p /opt/medoria
chmod 0755 /opt/medoria

echo "verifying Docker"
docker version
docker compose version
docker run --rm hello-world >/dev/null

echo
cat <<'EOF'
Bootstrap completed.

Not changed automatically:
- SSH daemon settings
- firewall policy
- DNS
- production services
- Docker group membership

Next:
1. Run: bash scripts/self-host/verify-vps.sh
2. Review SSH access from a second terminal.
3. Configure the firewall only after confirming the actual SSH port.
4. Clone the migration branch into /opt/medoria.
EOF
