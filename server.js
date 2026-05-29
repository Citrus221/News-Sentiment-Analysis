const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
const port = Number(process.env.PORT || 48992);
const symbolCache = { updatedAt: 0, data: [] };
const cacheMs = 24 * 60 * 60 * 1000;
const rangeDays = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90
};

const trustedSourceRules = [
  { label: "Reuters", names: ["reuters"], domains: ["reuters.com"] },
  { label: "AP", names: ["associated press", "ap news", "ap"], domains: ["apnews.com"] },
  { label: "Bloomberg", names: ["bloomberg"], domains: ["bloomberg.com"] },
  { label: "CNBC", names: ["cnbc"], domains: ["cnbc.com"] },
  { label: "Wall Street Journal", names: ["wall street journal", "wsj"], domains: ["wsj.com"] },
  { label: "Financial Times", names: ["financial times", "ft.com"], domains: ["ft.com"] },
  { label: "MarketWatch", names: ["marketwatch"], domains: ["marketwatch.com"] },
  { label: "Yahoo Finance", names: ["yahoo finance"], domains: ["finance.yahoo.com"] },
  { label: "Nasdaq", names: ["nasdaq"], domains: ["nasdaq.com"] },
  { label: "NYSE", names: ["nyse"], domains: ["nyse.com"] },
  { label: "SEC EDGAR", names: ["sec", "sec edgar"], domains: ["sec.gov"] },
  { label: "Investor Relations", names: ["investor relations"], domains: [] },
  { label: "Barron's", names: ["barron's", "barrons"], domains: ["barrons.com"] },
  { label: "Investor's Business Daily", names: ["investor's business daily", "investors business daily", "ibd"], domains: ["investors.com"] },
  { label: "Fortune", names: ["fortune"], domains: ["fortune.com"] },
  { label: "Business Insider", names: ["business insider"], domains: ["businessinsider.com"] },
  { label: "TheStreet", names: ["thestreet", "the street"], domains: ["thestreet.com"] },
  { label: "Morningstar", names: ["morningstar"], domains: ["morningstar.com"] },
  { label: "The Information", names: ["the information"], domains: ["theinformation.com"] }
];
const blockedSourceNames = ["motley fool", "zacks", "seeking alpha", "investorplace", "benzinga", "tipranks"];
const fetchTimeoutMs = 8000;
const debugRelevance = process.env.DEBUG_RELEVANCE === "1";
const bodyTextCache = new Map();
const robotsCache = new Map();
const maxArticleBodyChars = 6000;
const maxAnalysisContextChars = 1400;
const finbertApiUrl = process.env.FINBERT_API_URL || "";
const companyVariantAliases = {
  AAPL: ["Apple"],
  AMZN: ["Amazon"],
  GOOGL: ["Alphabet", "Google"],
  GOOG: ["Alphabet", "Google"],
  META: ["Meta Platforms", "Meta"],
  MSFT: ["Microsoft"],
  NVDA: ["Nvidia", "NVIDIA"],
  TSLA: ["Tesla"]
};
const ambiguousSingleWordVariants = new Set(["all", "are", "can", "go", "meta", "on", "up"]);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

http
  .createServer(async (req, res) => {
    try {
      applyCorsHeaders(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/symbols") {
        return sendJson(res, await getSymbols());
      }
      if (url.pathname === "/api/news") {
        return sendJson(res, await getNews(url.searchParams));
      }
      return serveStatic(url.pathname, res);
    } catch (error) {
      sendJson(res, { error: error.message }, error.statusCode || 500);
    }
  })
  .listen(port, () => {
    console.log(`News sentiment app running at http://127.0.0.1:${port}`);
  });

function applyCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function getSymbols() {
  if (symbolCache.data.length && Date.now() - symbolCache.updatedAt < cacheMs) {
    return symbolCache.data;
  }

  const [nasdaqListed, otherListed] = await Promise.all([
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt")
  ]);
  symbolCache.data = [...parseNasdaqListed(nasdaqListed), ...parseOtherListed(otherListed)]
    .filter((security) => !security.testIssue)
    .filter((security) =>
      ["NASDAQ", "NYSE", "NYSE American", "NYSE Arca", "Cboe BZX"].includes(security.exchange)
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  symbolCache.updatedAt = Date.now();
  return symbolCache.data;
}

async function getNews(params) {
  const symbol = params.get("symbol");
  const companyName = params.get("companyName") || "";
  const range = rangeDays[params.get("range")] ? params.get("range") : "30d";
  const cutoff = getRangeCutoff(range);
  if (!symbol) throw statusError("Missing symbol.", 400);

  if (process.env.POLYGON_API_KEY) {
    const apiParams = new URLSearchParams({
      ticker: symbol,
      limit: "100",
      order: "desc",
      sort: "published_utc",
      "published_utc.gte": cutoff.toISOString(),
      apiKey: process.env.POLYGON_API_KEY
    });
    const response = await fetchJson(`https://api.polygon.io/v2/reference/news?${apiParams.toString()}`);
    return normalizeAndFilter(
      (response.results || []).map((item) => ({
        id: item.id,
        headline: item.title,
        source: item.publisher && item.publisher.name,
        publishedAt: item.published_utc,
        url: item.article_url,
        summary: item.description,
        relatedSymbols: item.tickers || [],
        providerSentiment: item.insights?.find((insight) => insight.ticker === symbol)?.sentiment,
        publisherHomepage: item.publisher && item.publisher.homepage_url
      })),
      symbol,
      companyName,
      cutoff
    );
  }

  if (process.env.FMP_API_KEY) {
    const today = new Date().toISOString().slice(0, 10);
    const apiParams = new URLSearchParams({
      tickers: symbol,
      limit: "100",
      from: cutoff.toISOString().slice(0, 10),
      to: today,
      apikey: process.env.FMP_API_KEY
    });
    const response = await fetchJson(`https://financialmodelingprep.com/api/v3/stock_news?${apiParams.toString()}`);
    return normalizeAndFilter(
      (response || []).map((item) => ({
        id: item.url || item.title,
        headline: item.title,
        source: item.site,
        publishedAt: item.publishedDate,
        url: item.url,
        summary: item.text,
        relatedSymbols: item.symbol ? [item.symbol] : [symbol]
      })),
      symbol,
      companyName,
      cutoff
    );
  }

  if (process.env.ALPHAVANTAGE_API_KEY) {
    const apiParams = new URLSearchParams({
      function: "NEWS_SENTIMENT",
      tickers: symbol,
      sort: "LATEST",
      limit: "100",
      time_from: toAlphaTime(cutoff),
      apikey: process.env.ALPHAVANTAGE_API_KEY
    });
    const response = await fetchJson(`https://www.alphavantage.co/query?${apiParams.toString()}`);
    return normalizeAndFilter(
      (response.feed || []).map((item) => ({
        id: item.url || item.title,
        headline: item.title,
        source: item.source,
        publishedAt: parseAlphaDate(item.time_published),
        url: item.url,
        summary: item.summary,
        relatedSymbols: (item.ticker_sentiment || []).map((entry) => entry.ticker),
        providerSentiment: item.ticker_sentiment?.find((entry) => entry.ticker === symbol)?.ticker_sentiment_label,
        providerScore: Number(item.ticker_sentiment?.find((entry) => entry.ticker === symbol)?.ticker_sentiment_score)
      })),
      symbol,
      companyName,
      cutoff
    );
  }

  return fetchNoKeyNews(symbol, companyName, cutoff);
}

async function fetchNoKeyNews(symbol, companyName, cutoff) {
  const feeds = await Promise.allSettled([
    fetchYahooFinanceNews(symbol),
    ...buildGoogleNewsQueries(symbol, companyName).map((query) => fetchGoogleNews(query, symbol))
  ]);
  const items = feeds.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const articles = await normalizeAndFilter(items, symbol, companyName, cutoff);
  if (articles.length) return articles;
  throw statusError(
    `No recent no-key RSS news was found for ${symbol}. Try a different company or configure POLYGON_API_KEY/FMP_API_KEY for broader results.`,
    404
  );
}

async function fetchYahooFinanceNews(symbol) {
  const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const xml = await fetchText(yahooUrl);
  return parseRssItems(xml).map((item) => ({
    id: item.guid || item.link || item.title,
    headline: item.title,
    source: inferSource(item),
    publishedAt: item.pubDate,
    url: item.link,
    summary: item.description,
    relatedSymbols: [symbol]
  }));
}

function buildGoogleNewsQueries(symbol, companyName) {
  const simpleName = cleanCompanyForSearch(companyName);
  return [
    `"${symbol}" stock`,
    `"${symbol}" "${simpleName}" stock`,
    `"${simpleName}" stock`,
    `"${simpleName}" earnings OR revenue OR guidance`,
    `"${symbol}" site:reuters.com OR site:cnbc.com OR site:marketwatch.com OR site:nasdaq.com`
  ].filter(Boolean);
}

async function fetchGoogleNews(query, symbol) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en"
  });
  const xml = await fetchText(`https://news.google.com/rss/search?${params.toString()}`);
  return parseRssItems(xml).map((item) => ({
    id: item.guid || item.link || item.title,
    headline: stripGoogleSourceSuffix(item.title),
    source: item.source || inferSource(item),
    publishedAt: item.pubDate,
    url: item.link,
    summary: item.description,
    relatedSymbols: [symbol],
    publisherHomepage: item.sourceUrl || ""
  }));
}

async function normalizeAndFilter(items, symbol, companyName, cutoff) {
  const relevantArticles = dedupeArticles(
    items
      .map((item) => normalizeNewsArticle(item))
      .filter(validArticle)
      .map((item) => applyTrustedSource(item, symbol, companyName))
      .filter((item) => item.verifiedSource)
      .filter((item) => new Date(item.publishedAt) >= cutoff)
      .map((item) => applyRelevanceDiagnostics(item, symbol, companyName))
      .filter((item) => item.relevance.included)
  );
  return Promise.all(relevantArticles.map((article) => enrichArticleSentiment(article, symbol, companyName)));
}

function normalizeNewsArticle(raw) {
  const headline = cleanText(raw.headline);
  const summary = cleanText(raw.summary);
  return {
    id: String(raw.id || raw.url || raw.headline),
    headline,
    source: cleanText(raw.source),
    publishedAt: raw.publishedAt,
    url: raw.url,
    summary: truncate(summary, 220),
    rawSummary: summary,
    relatedSymbols: raw.relatedSymbols || [],
    providerSentiment: raw.providerSentiment,
    providerScore: raw.providerScore,
    sentiment: "Neutral",
    confidence: 0.5,
    reasoning: "Sentiment has not been analyzed yet.",
    sentimentMethod: "keyword_fallback",
    sentimentTextFieldsUsed: "headline_only",
    sentimentDebug: {},
    analysisContext: truncate(`${headline}. ${summary}`, maxAnalysisContextChars),
    topic: classifyTopic(`${raw.headline || ""} ${raw.summary || ""}`),
    publisherHomepage: raw.publisherHomepage || "",
    verifiedSource: raw.verifiedSource || false
  };
}

async function enrichArticleSentiment(article, symbol = "", companyName = "") {
  const body = await fetchArticleBodyText(article.url);
  const textParts = buildSentimentTextParts(article, body, symbol, companyName);
  const analysis = await analyzeSentiment(textParts, article.providerSentiment, article.providerScore);
  return {
    ...article,
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    reasoning: analysis.reasoning,
    sentimentMethod: analysis.method,
    sentimentTextFieldsUsed: textParts.fieldsUsed,
    sentimentDebug: analysis.debug,
    analysisContext: truncate(textParts.fullText, maxAnalysisContextChars)
  };
}

function buildSentimentTextParts(article, bodyText = "", symbol = "", companyName = "") {
  const headline = cleanText(article.headline);
  const abstract = cleanText(article.rawSummary || article.summary);
  const body = cleanText(bodyText);
  const parts = [headline];
  let fieldsUsed = "headline_only";
  if (abstract) {
    parts.push(abstract);
    fieldsUsed = "headline_and_abstract";
  }
  if (body) {
    parts.push(body);
    fieldsUsed = "headline_abstract_and_body";
  }
  return {
    headline,
    abstract,
    body,
    symbol,
    companyName,
    fieldsUsed,
    fullText: parts.filter(Boolean).join(". ")
  };
}

async function analyzeSentiment(textParts, providerSentiment, providerScore) {
  const nlp = await runFinanceNlpPipeline(textParts);
  if (nlp.available) {
    return nlp;
  }

  const provider = providerSentimentResult(providerSentiment, providerScore);
  if (provider) return provider;

  return keywordFallbackSentiment(textParts.fullText);
}

async function runFinanceNlpPipeline(textParts) {
  const text = cleanText(textParts.fullText);
  if (!text) return { available: false };

  const external = await runConfiguredFinbertModel(textParts, text);
  if (external.available) return external;

  return runLocalFinanceNlpModel(textParts, text);
}

async function runConfiguredFinbertModel(textParts, text) {
  if (!finbertApiUrl) return { available: false };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    const response = await fetch(finbertApiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return { available: false };
    const probabilities = normalizeModelProbabilities(await response.json());
    if (!probabilities) return { available: false };
    return finalizeNlpResult(textParts, text, probabilities, { externalModel: true });
  } catch {
    return { available: false };
  }
}

function runLocalFinanceNlpModel(textParts, text) {
  const headlineScore = scoreFinanceText(textParts.headline, 1.45);
  const abstractScore = scoreFinanceText(textParts.abstract, 1.05);
  const bodyScore = scoreFinanceText(textParts.body, 0.8);
  const combined = mergeScores([headlineScore, abstractScore, bodyScore]);
  const probabilities = scoresToProbabilities(combined);
  return finalizeNlpResult(textParts, text, probabilities, { combined, headlineScore, bodyScore, externalModel: false });
}

function finalizeNlpResult(textParts, text, probabilities, modelContext) {
  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  const margin = top[1] - second[1];
  const combined = modelContext.combined || probabilitySignals(probabilities);
  const headlineScore = modelContext.headlineScore || { positive: 0, negative: 0 };
  const bodyScore = modelContext.bodyScore || { positive: 0, negative: 0, positiveSignals: 0, negativeSignals: 0 };
  const mixedSignals = combined.positiveSignals > 0 && combined.negativeSignals > 0;
  const disagreement = hasDirectionalDisagreement(headlineScore, bodyScore);
  const directionalSignals = combined.positiveSignals + combined.negativeSignals;
  const directionalMargin = Math.abs(combined.positive - combined.negative);
  const signalStrength = Math.max(combined.positive, combined.negative);
  const shortTextPenalty = text.length < 180 ? 0.12 : text.length < 420 ? 0.06 : 0;
  const qualityBoost = textParts.body ? 0.07 : textParts.abstract ? 0.03 : -0.06;
  let sentiment = top[0];

  if (signalStrength >= 1.15 && directionalMargin >= 0.45) {
    sentiment = combined.positive > combined.negative ? "Positive" : "Negative";
  }
  if (sentiment !== "Neutral" && directionalSignals === 0) {
    sentiment = "Neutral";
  }
  if (sentiment !== "Neutral" && mixedSignals && directionalMargin < 0.75) {
    sentiment = "Neutral";
  }
  if (disagreement && margin < 0.24) {
    sentiment = "Neutral";
  }

  let confidence = 0.43 + top[1] * 0.24 + margin * 0.28 + Math.min(signalStrength, 4) * 0.07 + qualityBoost - shortTextPenalty;
  if (mixedSignals) confidence -= 0.16;
  if (disagreement) confidence -= 0.1;
  if (combined.reversalSignals) confidence -= 0.03;
  if (mixedSignals) confidence = Math.min(confidence, 0.74);
  if (sentiment === "Neutral" && directionalSignals === 0) confidence = Math.min(confidence, 0.68);
  confidence = clamp(confidence, 0.38, textParts.body ? 0.92 : 0.84);

  return {
    available: true,
    sentiment,
    confidence,
    method: textParts.body ? "nlp_body" : "nlp_abstract",
    reasoning: buildNlpReasoning(sentiment, textParts, margin, mixedSignals, disagreement),
    debug: {
      probabilities,
      margin: Number(margin.toFixed(3)),
      mixedSignals,
      disagreement,
      textLength: text.length,
      textFieldsUsed: textParts.fieldsUsed,
      positiveSignals: combined.positiveSignals,
      negativeSignals: combined.negativeSignals,
      investmentSignals: combined.investmentSignals.slice(0, 8),
      neutralReason: sentiment === "Neutral" ? getNeutralReason(directionalSignals, mixedSignals, disagreement, signalStrength) : "",
      reversalSignals: combined.reversalSignals,
      externalModel: modelContext.externalModel
    }
  };
}

function normalizeModelProbabilities(payload) {
  const raw = Array.isArray(payload) ? payload : payload.probabilities || payload.scores || payload.labels;
  const entries = Array.isArray(raw)
    ? raw.map((item) => [item.label || item.class || item.name, item.score ?? item.probability ?? item.value])
    : Object.entries(raw || {});
  const mapped = { Positive: 0, Neutral: 0, Negative: 0 };
  for (const [label, value] of entries) {
    const normalized = String(label || "").toLowerCase();
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    if (normalized.includes("positive")) mapped.Positive = number;
    if (normalized.includes("neutral")) mapped.Neutral = number;
    if (normalized.includes("negative")) mapped.Negative = number;
  }
  const total = mapped.Positive + mapped.Neutral + mapped.Negative;
  if (total <= 0) return null;
  return {
    Positive: Number((mapped.Positive / total).toFixed(3)),
    Neutral: Number((mapped.Neutral / total).toFixed(3)),
    Negative: Number((mapped.Negative / total).toFixed(3))
  };
}

function probabilitySignals(probabilities) {
  return {
    positive: probabilities.Positive,
    neutral: probabilities.Neutral,
    negative: probabilities.Negative,
    positiveSignals: probabilities.Positive > 0.38 ? 1 : 0,
    negativeSignals: probabilities.Negative > 0.38 ? 1 : 0,
    reversalSignals: 0,
    investmentSignals: []
  };
}

function scoreFinanceText(text = "", weight = 1) {
  const normalized = normalizeForSentiment(text);
  const sentences = splitSentences(normalized);
  const score = {
    positive: 0,
    neutral: 0.28 * weight,
    negative: 0,
    positiveSignals: 0,
    negativeSignals: 0,
    reversalSignals: 0,
    investmentSignals: []
  };
  if (!normalized) return score;

  for (const sentence of sentences) {
    for (const rule of financeSentimentRules) {
      if (!rule.pattern.test(sentence)) continue;
      const polarity = resolveRulePolarity(sentence, rule);
      const value = rule.weight * weight;
      score[polarity] += value;
      if (polarity === "positive") score.positiveSignals += 1;
      if (polarity === "negative") score.negativeSignals += 1;
      if (polarity !== rule.polarity) score.reversalSignals += 1;
      if (polarity !== "neutral") {
        score.investmentSignals.push({
          label: rule.label,
          category: rule.category,
          sentiment: titleCase(polarity),
          strength: Number(value.toFixed(2))
        });
      }
    }
    if (hasAny(sentence, mixedSignalPhrases)) {
      score.neutral += 0.45 * weight;
      score.positive += 0.25 * weight;
      score.negative += 0.25 * weight;
    }
  }

  if (score.positiveSignals + score.negativeSignals === 0) score.neutral += 0.7 * weight;
  return score;
}

const financeSentimentRules = [
  { polarity: "positive", category: "Earnings", label: "earnings beat", weight: 2.1, pattern: /\b(earnings|eps|profit|results).{0,45}\b(beat|beats|topped|tops|above|exceeded|better than expected)\b|\b(beat|beats|topped|tops|exceeded).{0,45}\b(estimates?|expectations?|consensus)\b/ },
  { polarity: "positive", category: "Guidance", label: "raised guidance", weight: 2.25, pattern: /\b(raises?|raised|boosts?|hikes?|lifts?|increases?).{0,35}\b(guidance|outlook|forecast|revenue forecast|profit forecast)\b|\b(guidance|outlook|forecast).{0,35}\b(raised|higher|above)\b/ },
  { polarity: "positive", category: "Revenue", label: "revenue or profit growth", weight: 1.45, pattern: /\b(revenue|sales|profit|earnings|margin|cash flow).{0,35}\b(rose|rises|grew|growth|increased|improved|expanded|strong|record)\b|\b(record|strong).{0,25}\b(revenue|sales|profit|cash flow|demand)\b/ },
  { polarity: "positive", category: "Analyst", label: "analyst upgrade", weight: 1.9, pattern: /\b(upgrades?|upgraded|raises? price target|price target raised|initiates? at buy|outperform|overweight)\b/ },
  { polarity: "positive", category: "Product", label: "demand or approval strength", weight: 1.55, pattern: /\b(approval|approved|clearance|cleared|strong demand|orders? surge|backlog grows|product demand|customer win|major customer|contract win|partnership)\b/ },
  { polarity: "positive", category: "Capital Returns", label: "capital return increase", weight: 1.5, pattern: /\b(buyback|share repurchase|dividend).{0,35}\b(increase|raises?|raised|boosts?|expands?|new|additional)\b/ },
  { polarity: "positive", category: "Legal", label: "risk reduced", weight: 1.35, pattern: /\b(loss(?:es)? narrowed|concerns eased|lawsuit dismissed|case dismissed|settlement reached|margin improved|cash flow improved|probe closed|charges dismissed)\b/ },
  { polarity: "negative", category: "Earnings", label: "earnings miss", weight: 2.1, pattern: /\b(earnings|eps|profit|results|revenue|sales).{0,45}\b(miss|misses|missed|below|short of|weaker than expected)\b|\b(miss|misses|missed).{0,45}\b(estimates?|expectations?|consensus)\b/ },
  { polarity: "negative", category: "Guidance", label: "lowered guidance", weight: 2.35, pattern: /\b(cuts?|cut|lowers?|lowered|slashes?|reduced|trims?).{0,35}\b(guidance|outlook|forecast|revenue forecast|profit forecast)\b|\b(guidance|outlook|forecast).{0,35}\b(cut|lowered|below|weak)\b/ },
  { polarity: "negative", category: "Margins", label: "margin or demand pressure", weight: 1.75, pattern: /\b(margin pressure|margins? weaken|profit pressure|demand weakness|weak demand|sales decline|revenue decline|slowing growth|loss widens|cash burn)\b/ },
  { polarity: "negative", category: "Analyst", label: "analyst downgrade", weight: 1.9, pattern: /\b(downgrades?|downgraded|cuts? price target|price target cut|initiates? at sell|underperform|underweight)\b/ },
  { polarity: "negative", category: "Legal", label: "legal or regulatory risk", weight: 1.7, pattern: /\b(lawsuit|sues|probe|investigation|antitrust|regulatory scrutiny|sec investigation|doj probe|ftc probe|recall|export control|export restriction|ban|blocked)\b/ },
  { polarity: "negative", category: "Product", label: "product or execution problem", weight: 1.55, pattern: /\b(product delay|delays? launch|production cut|shipment delay|recall|defect|outage|safety issue|customer loss|loses? contract|market share loss)\b/ },
  { polarity: "negative", category: "Management", label: "management or financial stress", weight: 1.45, pattern: /\b(ceo resigns|cfo resigns|management shakeup|layoffs?|bankruptcy|default|going concern|liquidity crunch)\b/ },
  { polarity: "negative", category: "Mixed", label: "mixed beat with weaker outlook", weight: 1.25, pattern: /\b(stock falls after strong earnings|beat estimates but cut guidance|revenue rose despite margin pressure|strong earnings but weak guidance|profit beat but sales missed)\b/ },
  { polarity: "neutral", category: "Routine", label: "routine corporate update", weight: 0.55, pattern: /\b(announces?|reports?|scheduled|files?|launches?|names?|appoints?|conference|presentation|annual meeting|quarterly report)\b/ }
];

const negationPhrases = ["not", "no", "without", "less", "fewer", "missed by less", "fails to", "failed to"];
const positiveReversalPhrases = ["dismissed", "eased", "narrowed", "resolved", "cleared", "settled"];
const mixedSignalPhrases = ["but", "despite", "although", "however", "while", "even as", "offset by"];

function resolveRulePolarity(sentence, rule) {
  if (rule.polarity === "neutral") return "neutral";
  const hasNegation = negationPhrases.some((phrase) => sentence.includes(` ${phrase} `));
  if (rule.polarity === "negative" && positiveReversalPhrases.some((phrase) => sentence.includes(phrase))) {
    return "positive";
  }
  if (hasNegation) return rule.polarity === "positive" ? "negative" : "positive";
  return rule.polarity;
}

function mergeScores(scores) {
  return scores.reduce(
    (acc, score) => ({
      positive: acc.positive + score.positive,
      neutral: acc.neutral + score.neutral,
      negative: acc.negative + score.negative,
      positiveSignals: acc.positiveSignals + score.positiveSignals,
      negativeSignals: acc.negativeSignals + score.negativeSignals,
      reversalSignals: acc.reversalSignals + score.reversalSignals,
      investmentSignals: [...acc.investmentSignals, ...score.investmentSignals]
    }),
    { positive: 0, neutral: 0, negative: 0, positiveSignals: 0, negativeSignals: 0, reversalSignals: 0, investmentSignals: [] }
  );
}

function scoresToProbabilities(score) {
  const positive = score.positive + 0.35;
  const negative = score.negative + 0.35;
  const neutral = score.neutral + Math.max(0, 0.55 - Math.abs(positive - negative) * 0.18);
  const values = { Positive: positive, Neutral: neutral, Negative: negative };
  const max = Math.max(values.Positive, values.Neutral, values.Negative);
  const exp = {
    Positive: Math.exp(values.Positive - max),
    Neutral: Math.exp(values.Neutral - max),
    Negative: Math.exp(values.Negative - max)
  };
  const total = exp.Positive + exp.Neutral + exp.Negative;
  return {
    Positive: Number((exp.Positive / total).toFixed(3)),
    Neutral: Number((exp.Neutral / total).toFixed(3)),
    Negative: Number((exp.Negative / total).toFixed(3))
  };
}

function hasDirectionalDisagreement(headlineScore, bodyScore) {
  if (!bodyScore || bodyScore.positiveSignals + bodyScore.negativeSignals === 0) return false;
  const headlineDirection = headlineScore.positive - headlineScore.negative;
  const bodyDirection = bodyScore.positive - bodyScore.negative;
  return Math.abs(headlineDirection) > 0.7 && Math.abs(bodyDirection) > 0.7 && Math.sign(headlineDirection) !== Math.sign(bodyDirection);
}

function buildNlpReasoning(sentiment, textParts, margin, mixedSignals, disagreement) {
  const source = textParts.body ? "headline, public abstract, and public article text" : textParts.abstract ? "headline and public abstract" : "headline";
  const caveats = [];
  if (margin < 0.16) caveats.push("model probabilities are close");
  if (mixedSignals) caveats.push("mixed positive and negative finance signals are present");
  if (disagreement) caveats.push("headline and body signals disagree");
  return `${sentiment} investment impact from finance-aware NLP over ${source}${caveats.length ? `; confidence reduced because ${caveats.join(" and ")}` : ""}.`;
}

function getNeutralReason(directionalSignals, mixedSignals, disagreement, signalStrength) {
  if (!directionalSignals) return "No material investment-direction signal was detected.";
  if (mixedSignals) return "Positive and negative investment signals are close.";
  if (disagreement) return "Headline and body investment signals disagree.";
  if (signalStrength < 1.15) return "Investment signal is too weak to classify directionally.";
  return "No dominant investment direction after confidence calibration.";
}

function titleCase(value = "") {
  return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : "";
}

function providerSentimentResult(providerSentiment, providerScore) {
  const normalizedProvider = String(providerSentiment || "").toLowerCase();
  if (normalizedProvider.includes("bullish") || normalizedProvider.includes("positive")) {
    return sentimentResult("Positive", 0.64, "Provider sentiment maps clearly to positive.", "provider_sentiment");
  }
  if (normalizedProvider.includes("bearish") || normalizedProvider.includes("negative")) {
    return sentimentResult("Negative", 0.64, "Provider sentiment maps clearly to negative.", "provider_sentiment");
  }
  if (Number.isFinite(providerScore) && Math.abs(providerScore) > 0.05) {
    return sentimentResult(providerScore > 0 ? "Positive" : "Negative", 0.58, "Provider sentiment score is directional but uncertain.", "provider_sentiment");
  }
  return null;
}

function sentimentResult(sentiment, confidence, reasoning, method) {
  return {
    sentiment,
    confidence,
    reasoning,
    method,
    debug: {
      probabilities: null,
      margin: null,
      mixedSignals: false,
      disagreement: false,
      investmentSignals: [],
      neutralReason: sentiment === "Neutral" ? "Provider or fallback signal was not materially directional." : ""
    }
  };
}

function keywordFallbackSentiment(text) {
  const lower = text.toLowerCase();
  const positive = countMatches(lower, ["beat", "tops estimates", "above estimates", "raises", "record", "growth", "partnership", "approval", "upgrade", "buyback", "dividend"]);
  const negative = countMatches(lower, ["miss", "cuts", "lawsuit", "probe", "investigation", "recall", "downgrade", "loss", "decline", "warning", "export control", "regulatory"]);
  const score = positive - negative;
  if (score > 0) return sentimentResult("Positive", Math.min(0.72, 0.5 + score * 0.06), "Keyword fallback found more positive finance terms.", "keyword_fallback");
  if (score < 0) return sentimentResult("Negative", Math.min(0.72, 0.5 + Math.abs(score) * 0.06), "Keyword fallback found more negative finance terms.", "keyword_fallback");
  return sentimentResult("Neutral", 0.48, "Fallback found no strong directional finance terms.", "keyword_fallback");
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const itemXml = match[0];
    const source = readTagWithAttrs(itemXml, "source");
    return {
      title: decodeXml(readTag(itemXml, "title")),
      link: decodeXml(readTag(itemXml, "link")),
      guid: decodeXml(readTag(itemXml, "guid")),
      pubDate: decodeXml(readTag(itemXml, "pubDate")),
      description: cleanText(decodeXml(readTag(itemXml, "description"))),
      source: decodeXml(source.text),
      sourceUrl: decodeXml(source.attrs.url || "")
    };
  });
}

function readTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() : "";
}

function readTagWithAttrs(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) return { attrs: {}, text: "" };
  const attrs = {};
  for (const attr of match[1].matchAll(/([a-zA-Z_:.-]+)="([^"]*)"/g)) {
    attrs[attr[1]] = attr[2];
  }
  return {
    attrs,
    text: match[2].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim()
  };
}

function decodeXml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function inferSource(item) {
  const text = `${item.title || ""} ${item.description || ""}`;
  const sourceMatch = text.match(/\b(Reuters|AP|Bloomberg|CNBC|MarketWatch|Yahoo Finance|The Wall Street Journal|Financial Times)\b/i);
  if (sourceMatch) return sourceMatch[1];
  try {
    const host = new URL(item.link).hostname.replace(/^www\./, "");
    if (host.includes("finance.yahoo")) return "Yahoo Finance";
    return host;
  } catch {
    return "Yahoo Finance";
  }
}

function stripGoogleSourceSuffix(title = "") {
  return cleanText(title).replace(/\s+-\s+[^-]{2,80}$/i, "").trim();
}

function cleanCompanyForSearch(companyName = "") {
  return cleanText(companyName)
    .replace(/\b(Class|Common Stock|Ordinary Shares|Inc\.?|Corporation|Corp\.?|Company|Co\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNasdaqListed(text) {
  return text
    .trim()
    .split("\n")
    .slice(1)
    .filter((line) => line && !line.startsWith("File Creation Time"))
    .map((line) => {
      const [symbol, name, marketCategory, testIssue, financialStatus, roundLotSize, etf] = line.split("|");
      return {
        symbol: normalizeDisplaySymbol(symbol),
        companyName: cleanSecurityName(name),
        exchange: "NASDAQ",
        securityType: etf === "Y" ? "ETF" : inferSecurityType(name),
        country: "US",
        currency: "USD",
        sector: "",
        industry: "",
        marketCategory,
        financialStatus,
        roundLotSize,
        testIssue: testIssue === "Y"
      };
    });
}

function parseOtherListed(text) {
  const exchangeMap = {
    A: "NYSE American",
    N: "NYSE",
    P: "NYSE Arca",
    Z: "Cboe BZX",
    V: "IEX"
  };
  return text
    .trim()
    .split("\n")
    .slice(1)
    .filter((line) => line && !line.startsWith("File Creation Time"))
    .map((line) => {
      const [symbol, name, exchangeCode, cqsSymbol, etf, roundLotSize, testIssue, nasdaqSymbol] = line.split("|");
      return {
        symbol: normalizeDisplaySymbol(symbol || nasdaqSymbol || cqsSymbol),
        companyName: cleanSecurityName(name),
        exchange: exchangeMap[exchangeCode] || exchangeCode,
        securityType: etf === "Y" ? "ETF" : inferSecurityType(name),
        country: "US",
        currency: "USD",
        sector: "",
        industry: "",
        cqsSymbol,
        roundLotSize,
        testIssue: testIssue === "Y"
      };
    });
}

function classifyTopic(text) {
  const lower = text.toLowerCase();
  if (hasAny(lower, ["guidance", "outlook", "forecast"])) return "Guidance";
  if (hasAny(lower, ["ceo", "cfo", "executive", "management", "appoints", "resigns"])) return "Management";
  if (hasAny(lower, ["earnings", "revenue", "profit", "guidance", "quarter"])) return "Earnings";
  if (hasAny(lower, ["launch", "product", "chip", "drug", "platform", "model"])) return "Product";
  if (hasAny(lower, ["lawsuit", "court", "settlement", "legal"])) return "Legal";
  if (hasAny(lower, ["fed", "inflation", "rate", "macro", "recession"])) return "Macro";
  if (hasAny(lower, ["upgrade", "downgrade", "price target", "rating"])) return "Analyst";
  if (hasAny(lower, ["sec", "regulation", "regulatory", "export control", "antitrust"])) return "Regulation";
  if (hasAny(lower, ["acquire", "merger", "partnership", "stake", "investment"])) return "M&A";
  if (hasAny(lower, ["competition", "rival", "market share"])) return "Competition";
  return "News";
}

function serveStatic(rawPath, res) {
  const safePath = rawPath === "/" ? "/index.html" : rawPath;
  const filePath = path.normalize(path.join(root, safePath));
  if (!filePath.startsWith(root)) return sendText(res, "Not found", 404);
  fs.readFile(filePath, (error, data) => {
    if (error) return sendText(res, "Not found", 404);
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Mozilla/5.0 News Sentiment Research App"
    }
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw statusError(`Provider request failed: ${response.status}`, response.status);
  return response.text();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Mozilla/5.0 News Sentiment Research App"
    }
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw statusError(`Provider request failed: ${response.status}`, response.status);
  return response.json();
}

async function fetchArticleBodyText(url = "") {
  if (!url.startsWith("https://")) return "";
  if (bodyTextCache.has(url)) return bodyTextCache.get(url);
  try {
    if (!(await isAllowedByRobots(url))) {
      bodyTextCache.set(url, "");
      return "";
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 News Sentiment Research App",
        Accept: "text/html,application/xhtml+xml"
      },
      redirect: "follow"
    }).finally(() => clearTimeout(timeout));
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      bodyTextCache.set(url, "");
      return "";
    }
    const html = await response.text();
    const body = extractPublicArticleText(html);
    bodyTextCache.set(url, body);
    return body;
  } catch {
    bodyTextCache.set(url, "");
    return "";
  }
}

async function isAllowedByRobots(url = "") {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    if (!robotsCache.has(origin)) {
      robotsCache.set(origin, fetchRobotsRules(origin));
    }
    const rules = await robotsCache.get(origin);
    const pathName = `${parsed.pathname}${parsed.search}`;
    return !rules.some((rule) => pathName.startsWith(rule));
  } catch {
    return false;
  }
}

async function fetchRobotsRules(origin) {
  try {
    const text = await fetchText(`${origin}/robots.txt`);
    return parseRobotsDisallow(text);
  } catch {
    return [];
  }
}

function parseRobotsDisallow(text = "") {
  const rules = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*" || value.toLowerCase().includes("news sentiment");
    if (applies && key === "disallow" && value) rules.push(value);
  }
  return rules;
}

function extractPublicArticleText(html = "") {
  if (hasPaywallMarker(html)) return "";
  const jsonLdText = extractJsonLdArticleText(html);
  const source = jsonLdText || html;
  const articleMatch = source.match(/<article\b[\s\S]*?<\/article>/i) || source.match(/<main\b[\s\S]*?<\/main>/i);
  const scoped = articleMatch ? articleMatch[0] : source;
  const cleaned = scoped
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  const paragraphs = [...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => decodeHtmlEntities(cleanText(match[1])))
    .filter((text) => text.length >= 45)
    .filter((text) => !isBoilerplateArticleText(text));
  const text = paragraphs.join(" ");
  return text.length >= 240 ? truncate(text, maxArticleBodyChars) : "";
}

function extractJsonLdArticleText(html = "") {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    const raw = decodeHtmlEntities(block[1]).trim();
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed["@graph"] || [])];
      const article = candidates.find((item) => {
        const type = Array.isArray(item["@type"]) ? item["@type"].join(" ") : item["@type"];
        return /newsarticle|article|report/i.test(type || "") && item.articleBody;
      });
      if (article?.articleBody) return `<p>${article.articleBody}</p>`;
    } catch {
      continue;
    }
  }
  return "";
}

function hasPaywallMarker(html = "") {
  return /paywall|subscribe to continue|sign in to continue|already a subscriber|premium content|metered access/i.test(html);
}

function isBoilerplateArticleText(text = "") {
  return /cookie|newsletter|subscribe|sign up|advertisement|all rights reserved|terms of service|privacy policy/i.test(text);
}

function validArticle(article) {
  return Boolean(article.source && article.publishedAt && article.url && article.url.startsWith("https://") && article.headline);
}

function applyTrustedSource(article, symbol, companyName) {
  const sourceRule = findTrustedSourceRule(article.source, article.url || article.publisherHomepage);
  const companyRule = isOfficialCompanySource(article.url || article.publisherHomepage, symbol, companyName)
    ? { label: `${symbol} Investor Relations` }
    : null;
  const rule = sourceRule || companyRule;
  return {
    ...article,
    source: rule ? rule.label : article.source,
    verifiedSource: Boolean(rule)
  };
}

function findTrustedSourceRule(source = "", url = "") {
  const sourceText = normalizeSearch(source);
  if (blockedSourceNames.some((name) => sourceText.includes(name))) return null;
  const host = getHostname(url);
  return trustedSourceRules.find((rule) => {
    const nameMatch = rule.names.some((name) => sourceText.includes(normalizeSearch(name)));
    const domainMatch = rule.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    return nameMatch || domainMatch;
  });
}

function isOfficialCompanySource(url = "", symbol = "", companyName = "") {
  const host = getHostname(url);
  if (!host) return false;
  const companyToken = normalizeSearch(companyName)
    .split(" ")
    .find((token) => token.length >= 3 && !["the", "inc", "corporation", "company", "incorporated", "platforms"].includes(token));
  return (host.includes("investor") || host.includes("ir.")) && (host.includes(normalizeSearch(symbol)) || (companyToken && host.includes(companyToken)));
}

function getHostname(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function applyRelevanceDiagnostics(article, symbol, companyName) {
  const relevance = getArticleRelevance(article, symbol, companyName);
  if (debugRelevance && !relevance.included) {
    console.debug("Excluded article for weak relevance", {
      symbol,
      headline: article.headline,
      source: article.source,
      relatedSymbols: article.relatedSymbols,
      relevance
    });
  }
  return {
    ...article,
    relevance,
    relevanceReason: relevance.reason
  };
}

function getArticleRelevance(article, symbol, companyName) {
  const headline = cleanText(article.headline);
  const summary = cleanText(article.summary);
  const normalizedSymbol = normalizeSymbol(symbol);
  const variants = buildCompanyVariants(normalizedSymbol, companyName);

  if (hasTickerMatch(headline, normalizedSymbol)) return relevanceResult(true, "headline_ticker_match", normalizedSymbol);
  if (hasTickerMatch(summary, normalizedSymbol)) return relevanceResult(true, "abstract_ticker_match", normalizedSymbol);

  const headlineVariant = findVariantMatch(headline, variants);
  if (headlineVariant) return relevanceResult(true, "headline_company_variant_match", headlineVariant);

  const summaryVariant = findVariantMatch(summary, variants);
  if (summaryVariant) return relevanceResult(true, "abstract_company_variant_match", summaryVariant);

  return relevanceResult(false, "no_headline_or_abstract_match", "");
}

function relevanceResult(included, reason, matchedValue) {
  return { included, reason, matchedValue };
}

function buildCompanyVariants(symbol, companyName) {
  const variants = new Set(companyVariantAliases[symbol] || []);
  const cleanedName = cleanCompanyVariant(companyName);
  if (cleanedName) variants.add(cleanedName);

  const tokens = normalizeSearch(companyName)
    .split(" ")
    .filter((token) => token.length > 2 && !isCompanyStopWord(token));
  if (tokens.length) variants.add(tokens[0]);
  if (tokens.length >= 2) variants.add(`${tokens[0]} ${tokens[1]}`);

  return [...variants]
    .map((variant) => cleanCompanyVariant(variant))
    .filter((variant) => variant.length >= 3);
}

function cleanCompanyVariant(value = "") {
  return cleanText(value)
    .replace(/\b(class|common|ordinary|stock|shares?|adr|ads)\b.*$/i, "")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|holdings|holding|group|class)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompanyStopWord(token) {
  return ["the", "inc", "corp", "corporation", "company", "co", "ltd", "limited", "holdings", "holding", "group", "class", "common", "stock", "shares", "platforms"].includes(token);
}

function hasTickerMatch(text, symbol) {
  if (!text || !symbol) return false;
  const escaped = escapeRegExp(symbol).replace(/\\\./g, "[.-]");
  return new RegExp(`(^|[^A-Za-z0-9])(?:[$])?${escaped}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

function findVariantMatch(text, variants) {
  if (!text) return "";
  const normalizedText = ` ${normalizeSearch(text)} `;
  const rawText = cleanText(text);
  return variants.find((variant) => {
    const normalizedVariant = normalizeSearch(variant);
    if (!normalizedVariant) return false;
    const isSingleWord = !normalizedVariant.includes(" ");
    if (isSingleWord && ambiguousSingleWordVariants.has(normalizedVariant)) {
      return new RegExp(`(^|[^A-Za-z])${escapeRegExp(variant)}(?=$|[^A-Za-z])`).test(rawText);
    }
    return normalizedText.includes(` ${normalizedVariant} `);
  }) || "";
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeArticles(items) {
  const seen = new Set();
  const seenTitles = new Set();
  return items.filter((item) => {
    const canonicalUrl = canonicalizeUrl(item.url);
    const titleWords = normalizeSearch(item.headline)
      .split(" ")
      .filter((word) => word.length > 2)
      .slice(0, 12);
    const titleKey = titleWords.join(" ");
    const timeBucket = new Date(item.publishedAt).toISOString().slice(0, 10);
    const key = `${canonicalUrl}|${item.source}|${timeBucket}`;
    const fuzzyTitleKey = `${item.source}|${timeBucket}|${titleKey}`;
    if (seen.has(key) || seenTitles.has(fuzzyTitleKey)) return false;
    seen.add(key);
    seenTitles.add(fuzzyTitleKey);
    return true;
  });
}

function canonicalizeUrl(url = "") {
  try {
    const parsed = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "guccounter"].forEach((param) =>
      parsed.searchParams.delete(param)
    );
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
  }
}

function cleanSecurityName(value = "") {
  return cleanText(value).replace(/ - Common Stock$/i, "").replace(/ Common Stock$/i, "");
}

function inferSecurityType(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("adr")) return "ADR";
  if (lower.includes("etf") || lower.includes("fund")) return "ETF";
  if (lower.includes("preferred")) return "Preferred Stock";
  if (lower.includes("warrant")) return "Warrant";
  if (lower.includes("unit")) return "Unit";
  return "Common Stock";
}

function normalizeDisplaySymbol(symbol = "") {
  return symbol.trim().replace(/\$/g, ".").replace(/\s/g, "");
}

function normalizeSymbol(symbol = "") {
  return symbol.toUpperCase().replace(/[-/]/g, ".").replace(/\s/g, "");
}

function normalizeSearch(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-/]/g, ".")
    .replace(/[^a-z0-9. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSentiment(value = "") {
  return ` ${decodeHtmlEntities(cleanText(value)).toLowerCase().replace(/[^\w$%. -]+/g, " ").replace(/\s+/g, " ")} `;
}

function splitSentences(value = "") {
  return value
    .split(/(?<=[.!?])\s+|\s+[;:]\s+/)
    .map((sentence) => ` ${sentence.trim()} `)
    .filter((sentence) => sentence.trim());
}

function cleanText(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function truncate(value, max) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countMatches(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function parseAlphaDate(value = "") {
  if (!value || value.length < 8) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11) || "00"}:${value.slice(11, 13) || "00"}:00Z`;
}

function getRangeCutoff(range) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays[range]);
  return cutoff;
}

function toAlphaTime(date) {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 13);
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, text, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function statusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
