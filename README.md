# Dockerized Web Browsers [WIP]
A basic setup for my web browser experiments. Starting with Puppeteer first.
- `queue-workers.js` runs multiple browsers with a dedicated `xvfb` display for each.
- - With `xvfb` sessions, we can launch `headless:false` chrome instances
- - no need to start/shutdown a browser for each request. the browsers should stay open.
- `/browse` endpoint receives a web-request, writes it to **redis** queue and waits for its completion.
- - it checks the request status every 70ms with a 30s timeout.


## Usage

### Create image 
```
docker build -t web-browsers .
```

### Launch a container
```
docker run -d -p 3030:3030 --name wb-app web-browsers
```

### via docker-compose (WIP)

```sh
docker compose --profile debian up
```
 or 
```sh
docker compose --profile macos up
``` 
depending on your host system.


```sh
curl -X POST http://127.0.0.1:3030/browse -H "Content-Type: application/json" -d '{"url": "https://iserter.com/"}'
```

For a quick verification of the API server's availability: `curl http://127.0.0.1:3030/`



### Troubleshooting & Frequently Used Commands 

```
npx @puppeteer/browsers install chrome@stable
export PUPPETEER_EXECUTABLE_PATH=/home/app/chrome/linux-133.0.6943.53/chrome-linux64/chrome
export DBUS_SESSION_BUS_ADDRESS=unix:path=/var/run/dbus/system_bus_socket
```

#### Debug DBus
```
ps aux | grep dbus-daemon
dbus-monitor --system
dbus-send --system --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames
```




### TODO

Fontconfig error: No writable cache directories
