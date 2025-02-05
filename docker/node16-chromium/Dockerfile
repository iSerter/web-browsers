FROM node:16-bullseye-slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV DEBIAN_FRONTEND=noninteractive

RUN apt update -qq \
    && apt install -qq -y --no-install-recommends \
      curl \
      git \
      gnupg \
      libgconf-2-4 \
      libxss1 \
      libxtst6 \
      python \
      g++ \
      build-essential \
      chromium \
      chromium-sandbox \
      dumb-init \
      fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
      redis-server \
      x11-xserver-utils x11-utils \
      xvfb \
      libasound2 libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /src/*.deb

# Install PM2 globally && delete npm cache 
RUN npm install -g pm2 && npm cache clean --force

# Add `app` user and group
RUN groupadd -r app && useradd -rm -g app -G audio,video app

WORKDIR /home/app

# Copy package.json to the working directory
COPY ../../package.json ./

# Install npm packages
RUN npm install && npm cache clean --force

# Copy the rest of the application code
COPY ../../ .

# Give app user access to all the project folders
RUN chown -R app:app /home/app
RUN chmod -R 777 /home/app

# Expose the port your app runs on
EXPOSE 3030

# Start dbus and redis-server as root, but run the app as the 'app' user
USER root
# ENV DBUS_SESSION_BUS_ADDRESS autolaunch:
CMD service dbus start && service redis-server start && sh ./util/start-x-screens.sh && su - app -c "pm2-runtime start ecosystem.config.js"