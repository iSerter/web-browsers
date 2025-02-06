# Chrome-stable has issues with Ubuntu 24.04, so we are using 22.04
FROM --platform=linux/amd64 ubuntu:22.04

# Install core dependencies
RUN apt-get update && apt-get install -y \
    curl \
    sudo \
    build-essential \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    xz \
    bzip2 \
    xvfb \
    libasound2 libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev \
    && rm -rf /var/lib/apt/lists/*


# Install redis-server
RUN apt-get update && apt-get install -y redis-server

# Install Google Chrome Stable and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer.
RUN apt-get update && apt-get install gnupg wget -y && \
    wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
RUN apt-get update && \
    apt-get install google-chrome-stable -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install Node 22, https://github.com/nodesource/distributions?tab=readme-ov-file#installation-instructions-deb
RUN curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
RUN sudo -E bash nodesource_setup.sh
RUN sudo apt-get install -y nodejs

# Install PM2 globally
RUN npm install -g pm2

# Install Puppeteer globally
RUN npm install -g puppeteer

# Install Puppeteer Browsers
RUN npx @puppeteer/browsers install chrome@stable

# Install inotify-tools
RUN apt-get update && apt-get install -y inotify-tools

# Set up the working directory
WORKDIR /app

# Copy package.json to the working directory
COPY ../../package.json ./

# Install Node.js dependencies
RUN npm install && npm cache clean --force

# Copy the rest of the application code
COPY ../../ .

# Expose the port your app runs on
EXPOSE 3030

# Start the application
CMD service dbus start && service redis-server start && sh ./util/start-x-screens.sh && pm2-runtime start ecosystem.config.js