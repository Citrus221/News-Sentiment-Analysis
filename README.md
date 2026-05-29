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

The frontend therefore does not call missing `/api` routes or `localhost` in production. On GitHub Pages it can load the static UI and symbol fallbacks, but live news requires one of these setups:

1. Deploy `server.js` or an equivalent API service somewhere that supports backend code.
2. Configure the frontend with that deployed API origin before `app.js` loads:

```html
<script>
  window.NEWS_SENTIMENT_API_BASE = "https://your-api.example.com";
</script>
```

The deployed API must expose:

- `GET /api/symbols`
- `GET /api/news?symbol=AAPL&companyName=Apple%20Inc.&range=90d`

For local experiments only, you can also store browser-side provider keys in `localStorage`, but this exposes keys to anyone using the page and some news providers may block direct browser requests with CORS.
