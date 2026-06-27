FROM node:22-slim

ENV LANG=en_US.UTF-8
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV XDG_CONFIG_HOME=/tmp/.chromium-config
ENV XDG_CACHE_HOME=/tmp/.chromium-cache
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
# Runtime dir for the manual DBus session bus (created at startup by start-container.sh)
ENV XDG_RUNTIME_DIR=/tmp/runtime-dbus
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/runtime-dbus/bus

# Install core dependencies, Google Chrome + fonts, then clean apt caches in a single layer.
# Note: redis-server is intentionally NOT installed — Redis runs as a separate
# service (external by default, optional bundled container via docker-compose).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      dbus \
      curl \
      wget \
      gnupg \
      ca-certificates \
      apt-transport-https \
      x11-xserver-utils x11-utils \
      xvfb; \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg; \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      google-chrome-stable \
      fonts-ipafont-gothic \
      fonts-wqy-zenhei \
      fonts-thai-tlwg \
      fonts-kacst \
      fonts-freefont-ttf fonts-terminus fonts-inconsolata fonts-dejavu ttf-bitstream-vera fonts-noto-core fonts-noto-cjk fonts-noto-extra fonts-font-awesome \
      libasound2 libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev \
      libxss1; \
    npm install -g pm2; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /tmp/*.deb /var/cache/apt/archives

# Create an unprivileged user to run the app
RUN groupadd -r app && useradd -rm -g app -G audio,video app

# /run/dbus must be writable by the app user so start-container.sh can place the
# system_bus_socket symlink there without root.
RUN mkdir -p /run/dbus && chown app:app /run/dbus

# Create the X11 socket directory as root with the sticky bit (1777). Xvfb's
# transport layer checks this dir on startup and warns ("Owner of /tmp/.X11-unix
# should be set to root") if it isn't root-owned + sticky. Creating it here means
# the later `mkdir -p` in start-container.sh (run as the app user) is a no-op and
# leaves the correct root ownership in place.
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Set up the working directory
WORKDIR /home/app

# Install NPM dependencies (skip Puppeteer's bundled Chrome — we use the system one)
COPY package.json package-lock.json ./
RUN PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" npm ci --omit=dev && \
    npm cache clean --force

# Copy the rest of the app
COPY . .

# Own the project as the app user (no world-writable perms)
RUN chown -R app:app /home/app

# Copy startup script and make it executable
COPY start-container.sh /usr/local/bin/start-container.sh
RUN chmod +x /usr/local/bin/start-container.sh

# Expose the API port
EXPOSE 3030

# Healthcheck against the API root endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://localhost:${API_PORT:-3030}/" || exit 1

# Run as the unprivileged user (Chrome runs with --no-sandbox, so no root needed)
USER app

CMD ["/usr/local/bin/start-container.sh"]
