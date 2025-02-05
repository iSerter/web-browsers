# Dockerized Web Browsers [WIP]
A basic setup for my web browser experiments. Starting with Puppeteer first.
- `queue-workers.js` runs multiple browsers with a dedicated `xvfb` display for each.
- - With `xvfb` sessions, we can launch `headless:false` chrome instances
- - no need to start/shutdown a browser for each request. the browsers should stay open.
- `/browse` endpoint receives a web-request, writes it to **redis** queue and waits for its completion.
- - it checks the request status every 70ms with a 30s timeout.


## Usage

### Launch a container

```sh
docker compose --profile debian up
```
 or 
```sh
docker compose --profile macos up
``` 
depending on your host system.


```sh
curl -X POST http://127.0.0.1:3030/browse -d '{"url": "https://iserter.com/"}'
```

For a quick verification of the API server's availability: `curl http://127.0.0.1:3030/`

