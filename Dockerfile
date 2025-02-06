FROM node:22-slim

ENV LANG=en_US.UTF-8
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV XDG_CONFIG_HOME=/tmp/.chromium-config
ENV XDG_CACHE_HOME=/tmp/.chromium-cache

# Install core dependencies
RUN apt-get update && apt-get install -y \
    dbus \
    curl \
    sudo \
    build-essential \
    wget \
    nano \
    gnupg \
    ca-certificates \
    apt-transport-https \
    x11-xserver-utils x11-utils \
    xvfb \
    inotify-tools

# Install redis-server
RUN apt-get install -y redis-server

# Install latest chrome dev package and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this installs the necessary libs to make the bundled version of Chrome that Puppeteer
# installs, work.
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
    apt-get update
    
RUN apt-get install -y --no-install-recommends \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf fonts-terminus fonts-inconsolata fonts-dejavu ttf-bitstream-vera fonts-noto-core fonts-noto-cjk fonts-noto-extra fonts-font-awesome \
    libasound2 libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev \
    libxss1

# delete apt lists, /tmp/*.deb files, and /var/cache/apt/archives to free up space
RUN rm -rf /var/lib/apt/lists/* /tmp/*.deb /var/cache/apt/archives

# Install PM2 globally
RUN npm install -g pm2

# Create a user with name 'app' and group that will be used to run the app
RUN groupadd -r app && useradd -rm -g app -G audio,video app

# Set up the working directory
WORKDIR /home/app

# Install NPM dependencies
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
RUN rm -rf ./node_modules && \
    # Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" npm install && \
    npm cache clean --force

# Copy rest of the app
COPY . .

# Give app user access to all the project folders
RUN chown -R app:app /home/app
RUN chmod -R 777 /home/app

# make /tmp writable
RUN chmod -R 777 /tmp

# Expose the port your app runs on
EXPOSE 3030

USER root
# ENV DBUS_SESSION_BUS_ADDRESS autolaunch:
CMD service dbus start && service redis-server start && sh ./util/start-x-screens.sh && pm2-runtime start ecosystem.config.js