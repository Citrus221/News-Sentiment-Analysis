# News-Sentiment-Analysis

News sentiment analysis using NLP.

## Running locally

Start the local API/static server:

```sh
node server.js
```

Then open `http://127.0.0.1:48992`.

Optional provider keys can be supplied as environment variables before starting the server:

- `POLYGON_API_KEY`
- `FMP_API_KEY`
- `ALPHAVANTAGE_API_KEY`
- `FINBERT_API_URL`

## GitHub Pages deployment

GitHub Pages is static-only. It cannot run `server.js`, keep provider API keys private, or serve routes such as `/api/news` and `/api/symbols`.

The frontend therefore does not call missing `/api` routes or `localhost` in production. On GitHub Pages it can load the static UI and symbol fallbacks, but live news requires a deployed API.

## Deploying the API on Render

1. Create a new Render Web Service from this repository.
2. Use the included `render.yaml` blueprint, or set these values manually:

```text
Build command: npm install
Start command: npm start
Health check path: /api/health
```

3. Add at least one provider key in Render environment variables:

- `POLYGON_API_KEY`
- `FMP_API_KEY`
- `ALPHAVANTAGE_API_KEY`

`FINBERT_API_URL` is optional.

4. Deploy the service and copy its public URL, for example:

```text
https://news-sentiment-api.onrender.com
```

5. Verify the API is reachable:

```text
https://news-sentiment-api.onrender.com/api/health
https://news-sentiment-api.onrender.com/api/news?symbol=NVDA&companyName=NVIDIA%20Corporation&range=90d
```

## Connecting GitHub Pages to the API

Edit `config.js` and set `apiBase` to the deployed API origin:

```js
window.NEWS_SENTIMENT_CONFIG = {
  apiBase: "https://news-sentiment-api.onrender.com"
};
```

Commit and push that change to `main`. The GitHub Pages frontend will then call:

```text
https://news-sentiment-api.onrender.com/api/symbols
https://news-sentiment-api.onrender.com/api/news?symbol=AAPL&companyName=Apple%20Inc.&range=90d
```

For local experiments only, you can also store browser-side provider keys in `localStorage`, but this exposes keys to anyone using the page and some news providers may block direct browser requests with CORS.
