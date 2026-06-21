#!/usr/bin/env bash
set -euo pipefail

echo "[startup] Preparing DBus runtime dir at $XDG_RUNTIME_DIR"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

if [[ -S "$XDG_RUNTIME_DIR/bus" ]]; then
  echo "[startup] Existing session bus socket found"
else
  echo "[startup] Launching session dbus-daemon"
  dbus-daemon --session --address=unix:path=$XDG_RUNTIME_DIR/bus --fork --nopidfile
fi

export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
echo "[startup] DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS"

# Some Chromium components always probe the *system* bus path /run/dbus/system_bus_socket.
# We can silence repeated errors by providing a compatible socket. Two approaches:
# 1. Start a system dbus-daemon (needs /var/run/dbus writable) OR
# 2. Symlink /run/dbus/system_bus_socket to our session bus socket (quick + lightweight).
# We'll choose #2 for minimal overhead.

if [[ ! -S /run/dbus/system_bus_socket ]]; then
  echo "[startup] Creating /run/dbus directory and symlink for system_bus_socket -> session bus"
  mkdir -p /run/dbus
  # If an old stale symlink exists, remove it
  if [[ -L /run/dbus/system_bus_socket || -e /run/dbus/system_bus_socket ]]; then
    rm -f /run/dbus/system_bus_socket || true
  fi
  ln -s "$XDG_RUNTIME_DIR/bus" /run/dbus/system_bus_socket || echo "[startup] Failed to create symlink"
fi

if [[ -S /run/dbus/system_bus_socket ]]; then
  echo "[startup] System bus socket present (real or symlink)"
else
  echo "[startup][warn] System bus socket still missing; Chromium may log errors"
fi

echo "[startup] Ensuring X11 socket directory exists"
mkdir -p /tmp/.X11-unix 2>/dev/null || true

echo "[startup] Starting X virtual screens script"
sh ./util/start-x-screens.sh

echo "[startup] Starting PM2 apps"
exec pm2-runtime start ecosystem.config.js
