# News Sentiment Analysis Dashboard

News Sentiment Analysis Dashboard is an investment research dashboard for searching U.S. stocks and companies, fetching recent source-linked news, classifying investment-relevant sentiment, and generating an AI-assisted analysis summary from the selected article set.

This project is a research tool only. It does not provide financial advice, and it should not be used as the sole basis for investment decisions.

## Key Features

- Company and ticker search for U.S.-listed securities.
- Popular stock suggestions for quick exploration.
- Real, source-linked news articles with title, source, publish time, and URL.
- Relevance filtering that requires the headline or abstract/snippet to mention the searched company, ticker, or recognized company alias.
- Time range filtering for `24h`, `7d`, `30d`, and `90d`.
- Topic filtering across categories such as Earnings, Analyst, Product, Regulation, Legal, Macro, M&A, Competition, Guidance, Management, and Other.
- Sentiment classification for each article: Positive, Neutral, or Negative.
- Confidence level for sentiment results.
- AI Analysis generated from the currently visible filtered article set.
- Pagination for larger news result sets.
- Static frontend support for GitHub Pages, with live news available through a separately deployed API.

## How Sentiment Works

Sentiment is intended to reflect likely investment-relevant news impact, not generic emotional tone.

- Positive means the article appears likely to be favorable to investor perception, business outlook, valuation expectations, or company fundamentals.
- Negative means the article appears likely to be unfavorable to investor perception, business outlook, valuation expectations, or company fundamentals.
- Neutral means the article appears routine, mixed, unclear, low-impact, or not materially directional.

The implementation can use provider sentiment signals, finance-aware NLP/rules, public headline and abstract text, and, where available and allowed, public article text. If `FINBERT_API_URL` is configured, the backend can use that external NLP service; otherwise it falls back to the built-in provider and rule-based logic.

Sentiment analysis is probabilistic and can be wrong. Confidence values are helpful context, not guarantees.

## Data and Source Policy

- News should come from reputable sources or official company/source-linked feeds.
- Articles shown in the dashboard should include a headline, source, publish time, and URL.
- Article headlines link to the original source.
- The app should not fabricate news, sources, URLs, or publication times.
- Paywalled, blocked, or restricted content should not be bypassed. In those cases, the app may only be able to use the public headline, snippet, or metadata.

## Local Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd "News Sentiment"
```

### 2. Install dependencies

```bash
npm install
```

The project currently has no third-party package dependencies, but running `npm install` is still safe and keeps the local workflow consistent.

### 3. Configure environment variables

Copy the example environment file if you want to use provider-backed live news:

```bash
cp .env.example .env
```

Then add any available provider keys:

```bash
POLYGON_API_KEY=
FMP_API_KEY=
ALPHAVANTAGE_API_KEY=
FINBERT_API_URL=
```

At least one news provider key is recommended for production API deployments. The app also includes a no-key RSS fallback and a built-in fallback symbol list, but coverage may be limited without provider keys.

### 4. Run the local server

```bash
npm start
```

This runs `node server.js` and starts the local API/static server.

### 5. Open the app

Open:

```text
http://127.0.0.1:48992
```

There is currently no `npm run dev` script in `package.json`; use `npm start` for local development.

## Environment Variables and Configuration

### Backend environment variables

- `POLYGON_API_KEY`: Optional Polygon news provider key.
- `FMP_API_KEY`: Optional Financial Modeling Prep news provider key.
- `ALPHAVANTAGE_API_KEY`: Optional Alpha Vantage news provider key.
- `FINBERT_API_URL`: Optional external FinBERT-compatible sentiment service URL.
- `PORT`: Optional server port. Defaults to `48992`.
- `DEBUG_RELEVANCE`: Optional debug flag. Set to `1` to expose additional relevance diagnostics in backend logic.

### Frontend API configuration

The static frontend reads its API origin from `config.js`:

```js
window.NEWS_SENTIMENT_CONFIG = {
  apiBase: "https://news-sentiment-analysis-51ha.onrender.com"
};
```

For a different deployment, set `apiBase` to the deployed backend origin. The frontend can also read `window.NEWS_SENTIMENT_API_BASE` or a browser `localStorage` API base override, but `config.js` is the clearest repository-level configuration point.

Browser-side provider keys may be useful for local experiments, but they expose keys to anyone using the page and may be blocked by provider CORS policies. Keep production provider keys on the backend whenever possible.

## Deployment

### GitHub Pages

GitHub Pages can host the static frontend files, including `index.html`, `styles.css`, `app.js`, and `config.js`.

Important caveats:

- GitHub Pages is static hosting only.
- It cannot run `server.js`.
- Backend API routes such as `/api/news`, `/api/symbols`, `/api/health`, and `/api/news-diagnostics` will not work on GitHub Pages unless the API is deployed separately.
- Provider API keys cannot be kept private in GitHub Pages frontend code.
- `config.js` must point to a deployed API origin for live news.
- Production provider URLs and CORS behavior must be configured correctly.
- Static asset paths may need correct base path handling depending on the GitHub Pages repository path.

### Render API Deployment

The repository includes `render.yaml` for deploying the Node API as a Render Web Service.

1. Create a new Render Web Service from this repository.
2. Use the included `render.yaml` blueprint, or configure the service manually:

```text
Build command: npm install
Start command: npm start
Health check path: /api/health
```

3. Add provider keys in Render environment variables as available:

```text
POLYGON_API_KEY
FMP_API_KEY
ALPHAVANTAGE_API_KEY
FINBERT_API_URL
```

4. Deploy the service and copy its public URL, for example:

```text
https://news-sentiment-api.onrender.com
```

5. Verify the API:

```text
https://news-sentiment-api.onrender.com/api/health
https://news-sentiment-api.onrender.com/api/news?symbol=NVDA&companyName=NVIDIA%20Corporation&range=90d
```

6. Update `config.js` so the GitHub Pages frontend uses the deployed API:

```js
window.NEWS_SENTIMENT_CONFIG = {
  apiBase: "https://news-sentiment-api.onrender.com"
};
```

## Suggested Workflow

1. Search for a ticker or company.
2. Select a time range and topic filters.
3. Review the sentiment breakdown and confidence levels.
4. Open and read the source-linked articles.
5. Use AI Analysis as a research aid, then verify important claims against the original sources.

## Limitations

- Sentiment analysis can be wrong, especially when headlines are ambiguous, articles are mixed, or only snippets are available.
- News coverage depends on configured providers, source availability, rate limits, and feed quality.
- Paywalled or blocked articles may only provide a headline, snippet, or metadata.
- Static GitHub Pages deployments need a separate backend API for live news.
- The dashboard does not provide buy, sell, or hold recommendations.
- This project is not financial advice.

## Development Notes

- Keep UI display logic separate from sentiment engine logic where practical.
- Avoid fabricating demo news in production paths.
- Use branches or checkpoints before major feature changes.
- Test search relevance, time filtering, topic filtering, pagination, and deployment API paths after changes.
- Run the existing logic test when changing behavior:

```bash
npm test
```
