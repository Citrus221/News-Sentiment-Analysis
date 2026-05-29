const appNow = () => new Date();
const SYMBOL_CACHE_KEY = "news-sentiment-symbol-master-v1";
const SYMBOL_CACHE_MS = 24 * 60 * 60 * 1000;
const ARTICLES_PER_PAGE = 10;
const MAX_NEWS_RANGE = "90d";
const NEWS_KEYS = {
  polygon: "POLYGON_API_KEY",
  fmp: "FMP_API_KEY",
  alphaVantage: "ALPHAVANTAGE_API_KEY"
};
const API_BASE_STORAGE_KEY = "NEWS_SENTIMENT_API_BASE";
const LOCAL_API_BASES = ["http://127.0.0.1:48992", "http://localhost:48992"];
const DEBUG_RELEVANCE = new URLSearchParams(window.location.search).has("debugRelevance");

const fallbackSecurities = [
  ["AAPL", "Apple Inc.", "NASDAQ", "Common Stock", "Technology", "Consumer Electronics"],
  ["MSFT", "Microsoft Corporation", "NASDAQ", "Common Stock", "Technology", "Software"],
  ["NVDA", "NVIDIA Corporation", "NASDAQ", "Common Stock", "Technology", "Semiconductors"],
  ["AMZN", "Amazon.com, Inc.", "NASDAQ", "Common Stock", "Consumer Discretionary", "Internet Retail"],
  ["GOOGL", "Alphabet Inc. Class A", "NASDAQ", "Common Stock", "Communication Services", "Internet Content"],
  ["GOOG", "Alphabet Inc. Class C", "NASDAQ", "Common Stock", "Communication Services", "Internet Content"],
  ["META", "Meta Platforms, Inc.", "NASDAQ", "Common Stock", "Communication Services", "Social Media"],
  ["TSLA", "Tesla, Inc.", "NASDAQ", "Common Stock", "Consumer Discretionary", "Auto Manufacturers"],
  ["BRK.B", "Berkshire Hathaway Inc. Class B", "NYSE", "Common Stock", "Financial Services", "Insurance"],
  ["JPM", "JPMorgan Chase & Co.", "NYSE", "Common Stock", "Financial Services", "Banks"],
  ["V", "Visa Inc.", "NYSE", "Common Stock", "Financial Services", "Payments"],
  ["MA", "Mastercard Incorporated", "NYSE", "Common Stock", "Financial Services", "Payments"],
  ["UNH", "UnitedHealth Group Incorporated", "NYSE", "Common Stock", "Healthcare", "Healthcare Plans"],
  ["LLY", "Eli Lilly and Company", "NYSE", "Common Stock", "Healthcare", "Drug Manufacturers"],
  ["AVGO", "Broadcom Inc.", "NASDAQ", "Common Stock", "Technology", "Semiconductors"],
  ["XOM", "Exxon Mobil Corporation", "NYSE", "Common Stock", "Energy", "Oil & Gas"],
  ["WMT", "Walmart Inc.", "NYSE", "Common Stock", "Consumer Defensive", "Retail"],
  ["COST", "Costco Wholesale Corporation", "NASDAQ", "Common Stock", "Consumer Defensive", "Retail"],
  ["HD", "The Home Depot, Inc.", "NYSE", "Common Stock", "Consumer Cyclical", "Home Improvement"],
  ["PG", "Procter & Gamble Company", "NYSE", "Common Stock", "Consumer Defensive", "Household Products"],
  ["JNJ", "Johnson & Johnson", "NYSE", "Common Stock", "Healthcare", "Drug Manufacturers"],
  ["ABBV", "AbbVie Inc.", "NYSE", "Common Stock", "Healthcare", "Drug Manufacturers"],
  ["MRK", "Merck & Co., Inc.", "NYSE", "Common Stock", "Healthcare", "Drug Manufacturers"],
  ["KO", "The Coca-Cola Company", "NYSE", "Common Stock", "Consumer Defensive", "Beverages"],
  ["PEP", "PepsiCo, Inc.", "NASDAQ", "Common Stock", "Consumer Defensive", "Beverages"],
  ["BAC", "Bank of America Corporation", "NYSE", "Common Stock", "Financial Services", "Banks"],
  ["ORCL", "Oracle Corporation", "NYSE", "Common Stock", "Technology", "Software"],
  ["NFLX", "Netflix, Inc.", "NASDAQ", "Common Stock", "Communication Services", "Entertainment"],
  ["CRM", "Salesforce, Inc.", "NYSE", "Common Stock", "Technology", "Software"],
  ["ADBE", "Adobe Inc.", "NASDAQ", "Common Stock", "Technology", "Software"],
  ["AMD", "Advanced Micro Devices, Inc.", "NASDAQ", "Common Stock", "Technology", "Semiconductors"],
  ["INTC", "Intel Corporation", "NASDAQ", "Common Stock", "Technology", "Semiconductors"],
  ["CSCO", "Cisco Systems, Inc.", "NASDAQ", "Common Stock", "Technology", "Communication Equipment"],
  ["DIS", "The Walt Disney Company", "NYSE", "Common Stock", "Communication Services", "Entertainment"],
  ["MCD", "McDonald's Corporation", "NYSE", "Common Stock", "Consumer Cyclical", "Restaurants"],
  ["NKE", "NIKE, Inc.", "NYSE", "Common Stock", "Consumer Cyclical", "Apparel"],
  ["BA", "The Boeing Company", "NYSE", "Common Stock", "Industrials", "Aerospace"],
  ["GE", "GE Aerospace", "NYSE", "Common Stock", "Industrials", "Aerospace"],
  ["CAT", "Caterpillar Inc.", "NYSE", "Common Stock", "Industrials", "Farm & Heavy Machinery"],
  ["SPY", "SPDR S&P 500 ETF Trust", "NYSE Arca", "ETF", "ETF", "Large Blend"],
  ["QQQ", "Invesco QQQ Trust", "NASDAQ", "ETF", "ETF", "Large Growth"],
  ["IWM", "iShares Russell 2000 ETF", "NYSE Arca", "ETF", "ETF", "Small Blend"],
  ["DIA", "SPDR Dow Jones Industrial Average ETF Trust", "NYSE Arca", "ETF", "ETF", "Large Value"],
  ["VOO", "Vanguard S&P 500 ETF", "NYSE Arca", "ETF", "ETF", "Large Blend"],
  ["VTI", "Vanguard Total Stock Market ETF", "NYSE Arca", "ETF", "ETF", "Total Market"]
].map(([symbol, companyName, exchange, securityType, sector, industry]) => ({
  symbol,
  companyName,
  exchange,
  securityType,
  country: "US",
  currency: "USD",
  sector,
  industry
}));

const popularStocks = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "GOOGL", "META"];
const topicOptions = ["Earnings", "Analyst", "Product", "Regulation", "Legal", "Macro", "M&A", "Competition", "Guidance", "Management", "Other"];
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

const state = {
  selectedCompany: null,
  query: "",
  range: "30d",
  topicSelection: new Set(),
  articles: [],
  page: 1,
  pageSize: ARTICLES_PER_PAGE,
  status: "empty",
  statusMessage: "Search by ticker, company name, or partial company name.",
  symbolMaster: [],
  suggestions: []
};

let newsRequestId = 0;

const rangeDays = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90
};

const sentimentColors = {
  Positive: "#11845b",
  Neutral: "#6b7280",
  Negative: "#c2413a"
};

const els = {
  topicFilters: document.querySelector("#topicFilters"),
  rangeFilters: document.querySelector("#rangeFilters"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  suggestions: document.querySelector("#suggestions"),
  dataNote: document.querySelector("#dataNote")
};

init();

async function init() {
  bindEvents();
  resetDashboard({ preserveUrl: true });
  await loadSymbolMaster();

  const urlSymbol = new URLSearchParams(window.location.search).get("symbol");
  if (urlSymbol) {
    els.searchInput.value = urlSymbol.toUpperCase();
    await resolveAndFetch(urlSymbol);
  }
}

function bindEvents() {
  updateRangeSelection();

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    showSuggestions(state.query ? rankSymbols(state.query).slice(0, 8) : getPopularSuggestions());
  });

  els.searchInput.addEventListener("focus", () => {
    const query = els.searchInput.value.trim();
    showSuggestions(query ? rankSymbols(query).slice(0, 8) : getPopularSuggestions(), { forceOpen: !query });
  });

  els.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.suggestions.classList.remove("open");
    await handleAnalyze();
  });

  els.suggestions.addEventListener("click", async (event) => {
    const option = event.target.closest("[data-symbol]");
    if (!option) return;
    const company = state.suggestions.find((item) => item.symbol === option.dataset.symbol);
    if (!company) return;
    els.suggestions.classList.remove("open");
    await selectCompany(company);
  });

  els.rangeFilters.addEventListener("click", (event) => {
    if (event.target.tagName !== "BUTTON") return;
    if (event.target.dataset.range === state.range) return;
    state.range = event.target.dataset.range;
    state.page = 1;
    updateRangeSelection();
    renderDashboard();
  });

  els.topicFilters.addEventListener("change", (event) => {
    if (event.target.type !== "checkbox") return;
    const topic = event.target.value;
    if (topic === "__all__") {
      state.topicSelection.clear();
    } else if (event.target.checked) {
      state.topicSelection.add(topic);
    } else {
      state.topicSelection.delete(topic);
    }
    state.page = 1;
    renderDashboard();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-panel")) els.suggestions.classList.remove("open");
  });
}

async function handleAnalyze() {
  const query = els.searchInput.value.trim();
  const selectedDisplay = state.selectedCompany
    ? `${state.selectedCompany.symbol} - ${state.selectedCompany.companyName}`
    : "";

  if (!query && state.selectedCompany) {
    await selectCompany(state.selectedCompany, { preserveSearch: true, resetPage: false });
    return;
  }

  if (!query) {
    state.status = "empty";
    state.statusMessage = "Enter a ticker or choose a popular stock suggestion to begin.";
    showSuggestions(getPopularSuggestions(), { forceOpen: true });
    renderDashboard();
    return;
  }

  if (state.selectedCompany && (query === selectedDisplay || normalizeSymbol(query) === normalizeSymbol(state.selectedCompany.symbol))) {
    await selectCompany(state.selectedCompany, { preserveSearch: true, resetPage: false });
    return;
  }

  await resolveAndFetch(query);
}

function updateRangeSelection() {
  [...els.rangeFilters.querySelectorAll("button")].forEach((button) => {
    const selected = button.dataset.range === state.range;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

async function loadSymbolMaster({ forceRefresh = false } = {}) {
  setProviderStatus("loading", forceRefresh ? "Refreshing symbol directory" : "Loading symbol directory");
  try {
    const cached = readSymbolCache();
    if (cached && !forceRefresh) {
      state.symbolMaster = cached;
      setProviderStatus("ready", `${cached.length.toLocaleString()} symbols loaded`);
      return;
    }

    const symbols = await fetchSymbolMasterFromProviders();

    state.symbolMaster = symbols;
    localStorage.setItem(
      SYMBOL_CACHE_KEY,
      JSON.stringify({ updatedAt: Date.now(), symbols })
    );
    setProviderStatus("ready", `${symbols.length.toLocaleString()} symbols loaded`);
  } catch (error) {
    state.symbolMaster = fallbackSecurities;
    state.statusMessage =
      "Using built-in major U.S. stocks and ETFs because the refreshable symbol directory is unavailable from this page. Run node server.js for the full exchange directory.";
    setProviderStatus("ready", `${fallbackSecurities.length} fallback symbols loaded`);
    renderDashboard();
  }
}

async function fetchSymbolMasterFromProviders() {
  if (hasBackendApi()) {
    try {
      return await fetchApiJson("/api/symbols");
    } catch {
      // Browser-readable symbol sources below keep static previews usable when
      // the configured backend is temporarily unavailable.
    }
  }

  try {
    const [nasdaqListed, otherListed] = await Promise.all([
      fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
      fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt")
    ]);
    return [...parseNasdaqListed(nasdaqListed), ...parseOtherListed(otherListed)]
      .filter((security) => !security.testIssue)
      .filter((security) =>
        ["NASDAQ", "NYSE", "NYSE American", "NYSE Arca", "Cboe BZX"].includes(security.exchange)
      )
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch (error) {
    const fmpKey = localStorage.getItem(NEWS_KEYS.fmp);
    if (fmpKey) return fetchFmpSymbols(fmpKey);
    const polygonKey = localStorage.getItem(NEWS_KEYS.polygon);
    if (polygonKey) return fetchPolygonSymbols(polygonKey);
    throw error;
  }
}

async function fetchFmpSymbols(apiKey) {
  const rows = await fetchJson(`https://financialmodelingprep.com/api/v3/stock/list?apikey=${encodeURIComponent(apiKey)}`);
  return rows
    .filter((row) => ["NASDAQ", "NYSE", "AMEX"].includes(row.exchangeShortName))
    .map((row) => ({
      symbol: normalizeDisplaySymbol(row.symbol),
      companyName: cleanSecurityName(row.name),
      exchange: row.exchangeShortName === "AMEX" ? "NYSE American" : row.exchangeShortName,
      securityType: row.type ? titleCase(row.type) : inferSecurityType(row.name),
      country: "US",
      currency: row.currency || "USD",
      sector: "",
      industry: "",
      testIssue: false
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function fetchPolygonSymbols(apiKey) {
  const securities = [];
  let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${encodeURIComponent(apiKey)}`;
  while (nextUrl && securities.length < 12000) {
    const response = await fetchJson(nextUrl);
    securities.push(
      ...(response.results || []).map((row) => ({
        symbol: normalizeDisplaySymbol(row.ticker),
        companyName: cleanSecurityName(row.name),
        exchange: normalizeExchange(row.primary_exchange),
        securityType: row.type ? titleCase(row.type) : inferSecurityType(row.name),
        country: row.locale === "us" ? "US" : row.locale?.toUpperCase() || "US",
        currency: row.currency_name?.toUpperCase() || "USD",
        sector: "",
        industry: "",
        testIssue: false
      }))
    );
    nextUrl = response.next_url ? `${response.next_url}&apiKey=${encodeURIComponent(apiKey)}` : "";
  }
  return securities
    .filter((security) => ["NASDAQ", "NYSE", "NYSE American", "NYSE Arca", "Cboe BZX"].includes(security.exchange))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function resolveAndFetch(rawQuery) {
  const query = rawQuery.trim();
  if (!query) {
    await handleAnalyze();
    return;
  }

  if (!state.symbolMaster.length) await loadSymbolMaster();
  const matches = rankSymbols(query);
  if (!matches.length) {
    state.status = "no-symbol";
    state.statusMessage = `No U.S.-listed security matched "${query}". Try a ticker, full company name, or a more specific partial name.`;
    if (!state.selectedCompany) {
      state.articles = [];
      updateUrlSymbol(null);
    }
    renderDashboard();
    return;
  }

  const normalizedQuery = normalizeSymbol(query);
  const exactTicker = matches.find((item) => normalizeSymbol(item.symbol) === normalizedQuery);
  if (exactTicker) {
    await selectCompany(exactTicker);
    return;
  }

  if (matches.length > 1) {
    state.status = "choose";
    state.statusMessage = `Multiple securities match "${query}". Choose one from the suggestions before analyzing news.`;
    showSuggestions(matches.slice(0, 8), { forceOpen: true });
    renderDashboard();
    return;
  }

  await selectCompany(matches[0]);
}

async function selectCompany(company, { preserveSearch = false, resetPage = true } = {}) {
  const requestId = ++newsRequestId;
  const previousCompany = state.selectedCompany;
  const companyChanged = !previousCompany || normalizeSymbol(previousCompany.symbol) !== normalizeSymbol(company.symbol);
  state.selectedCompany = company;
  els.suggestions.classList.remove("open");
  if (companyChanged) {
    state.topicSelection.clear();
    state.articles = [];
  }
  if (resetPage) state.page = 1;
  state.status = "loading-news";
  state.statusMessage = `Fetching reputable news for ${company.symbol}.`;
  if (!preserveSearch) els.searchInput.value = `${company.symbol} - ${company.companyName}`;
  updateUrlSymbol(company.symbol);
  setProviderStatus("loading", `Loading news`);
  renderDashboard();

  try {
    const news = await fetchNewsForCompany(company);
    if (requestId !== newsRequestId) return;
    state.articles = dedupeArticles(
      news
        .map((article) => applyTrustedSource(article, company))
        .filter(validArticle)
        .filter((item) => item.verifiedSource)
        .map((item) => applyRelevanceDiagnostics(item, company))
        .filter((item) => item.relevance.included)
    );
    const visibleCount = getFilteredArticles().length;
    state.status = state.articles.length ? "ready" : "no-news";
    state.statusMessage = state.articles.length
      ? `${state.articles.length} reputable article${state.articles.length === 1 ? "" : "s"} loaded; ${visibleCount} match the current ${state.range} filter.`
      : `No reputable news was found for ${company.symbol} in the available ${MAX_NEWS_RANGE} window.`;
    setProviderStatus("ready", state.articles.length ? `${state.articles.length} articles` : "No trusted news");
    renderDashboard();
  } catch (error) {
    if (requestId !== newsRequestId) return;
    state.status = "error";
    state.statusMessage = error.message;
    if (companyChanged) state.articles = [];
    setProviderStatus("error", "News unavailable");
    renderDashboard();
  }
}

async function fetchNewsForCompany(company) {
  if (hasBackendApi()) {
    try {
      const params = new URLSearchParams({
        symbol: company.symbol,
        companyName: company.companyName,
        range: MAX_NEWS_RANGE
      });
      return await fetchApiJson(`/api/news?${params.toString()}`);
    } catch (error) {
      if (!canUseBrowserProviderFallback()) {
        throw error;
      }
    }
  }

  const polygonKey = localStorage.getItem(NEWS_KEYS.polygon);
  const fmpKey = localStorage.getItem(NEWS_KEYS.fmp);
  const alphaKey = localStorage.getItem(NEWS_KEYS.alphaVantage);

  if (polygonKey) return fetchPolygonNews(company, polygonKey);
  if (fmpKey) return fetchFmpNews(company, fmpKey);
  if (alphaKey) return fetchAlphaVantageNews(company, alphaKey);

  throw new Error(
    getMissingProviderMessage(company)
  );
}

async function fetchPolygonNews(company, apiKey) {
  const params = new URLSearchParams({
    ticker: company.symbol,
    limit: "100",
    order: "desc",
    sort: "published_utc",
    apiKey
  });
  const response = await fetchJson(`https://api.polygon.io/v2/reference/news?${params.toString()}`);
  return (response.results || []).map((item) =>
    normalizeNewsArticle({
      id: item.id,
      headline: item.title,
      source: item.publisher?.name,
      publishedAt: item.published_utc,
      url: item.article_url,
      summary: item.description,
      relatedSymbols: item.tickers || [],
      providerSentiment: item.insights?.find((insight) => insight.ticker === company.symbol)?.sentiment,
      company,
      publisherHomepage: item.publisher?.homepage_url
    })
  );
}

async function fetchFmpNews(company, apiKey) {
  const params = new URLSearchParams({
    tickers: company.symbol,
    limit: "100",
    apikey: apiKey
  });
  const response = await fetchJson(`https://financialmodelingprep.com/api/v3/stock_news?${params.toString()}`);
  return (response || []).map((item) =>
    normalizeNewsArticle({
      id: item.url || item.title,
      headline: item.title,
      source: item.site,
      publishedAt: item.publishedDate,
      url: item.url,
      summary: item.text,
      relatedSymbols: item.symbol ? [item.symbol] : [company.symbol],
      company
    })
  );
}

async function fetchAlphaVantageNews(company, apiKey) {
  const params = new URLSearchParams({
    function: "NEWS_SENTIMENT",
    tickers: company.symbol,
    sort: "LATEST",
    limit: "100",
    apikey: apiKey
  });
  const response = await fetchJson(`https://www.alphavantage.co/query?${params.toString()}`);
  return (response.feed || []).map((item) => {
    const tickerSentiment = item.ticker_sentiment?.find((entry) => entry.ticker === company.symbol);
    return normalizeNewsArticle({
      id: item.url || item.title,
      headline: item.title,
      source: item.source,
      publishedAt: parseAlphaDate(item.time_published),
      url: item.url,
      summary: item.summary,
      relatedSymbols: item.ticker_sentiment?.map((entry) => entry.ticker) || [company.symbol],
      providerSentiment: tickerSentiment?.ticker_sentiment_label,
      providerScore: Number(tickerSentiment?.ticker_sentiment_score),
      company
    });
  });
}

function normalizeNewsArticle(raw) {
  const headline = cleanText(raw.headline);
  const summary = cleanText(raw.summary);
  const analysis = analyzeSentiment(
    {
      headline,
      abstract: summary,
      body: "",
      fieldsUsed: summary ? "headline_and_abstract" : "headline_only",
      fullText: [headline, summary].filter(Boolean).join(". ")
    },
    raw.providerSentiment,
    raw.providerScore
  );
  return {
    id: String(raw.id || raw.url || raw.headline),
    headline,
    source: cleanText(raw.source),
    publishedAt: raw.publishedAt,
    url: raw.url,
    summary: truncate(summary, 220),
    relatedSymbols: raw.relatedSymbols || [],
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    reasoning: analysis.reasoning,
    sentimentMethod: analysis.method,
    sentimentTextFieldsUsed: summary ? "headline_and_abstract" : "headline_only",
    sentimentDebug: analysis.debug,
    analysisContext: truncate([headline, summary].filter(Boolean).join(". "), 1400),
    topic: classifyTopic(`${raw.headline || ""} ${raw.summary || ""}`),
    verifiedSource: raw.verifiedSource || false
  };
}

function analyzeSentiment(textParts, providerSentiment, providerScore) {
  const nlp = runLocalFinanceNlpModel(textParts);
  if (nlp.available) return nlp;

  const provider = providerSentimentResult(providerSentiment, providerScore);
  if (provider) return provider;

  return keywordFallbackSentiment(textParts.fullText);
}

function runLocalFinanceNlpModel(textParts) {
  const text = cleanText(textParts.fullText);
  if (!text) return { available: false };

  const headlineScore = scoreFinanceText(textParts.headline, 1.45);
  const abstractScore = scoreFinanceText(textParts.abstract, 1.05);
  const bodyScore = scoreFinanceText(textParts.body, 0.85);
  const combined = mergeSentimentScores([headlineScore, abstractScore, bodyScore]);
  const probabilities = scoresToProbabilities(combined);
  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  const margin = top[1] - second[1];
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
  if (disagreement && margin < 0.24) sentiment = "Neutral";

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
    method: "nlp_abstract",
    reasoning: `Fallback finance-aware NLP over ${textParts.abstract ? "headline and abstract" : "headline"}.`,
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
      externalModel: false
    }
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
  if (!normalized.trim()) return score;

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

function mergeSentimentScores(scores) {
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

function getNeutralReason(directionalSignals, mixedSignals, disagreement, signalStrength) {
  if (!directionalSignals) return "No material investment-direction signal was detected.";
  if (mixedSignals) return "Positive and negative investment signals are close.";
  if (disagreement) return "Headline and body investment signals disagree.";
  if (signalStrength < 1.15) return "Investment signal is too weak to classify directionally.";
  return "No dominant investment direction after confidence calibration.";
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

function keywordFallbackSentiment(text) {
  const lower = text.toLowerCase();
  const positive = countMatches(lower, ["beat", "tops estimates", "above estimates", "raises", "record", "growth", "partnership", "approval", "upgrade", "buyback", "dividend"]);
  const negative = countMatches(lower, ["miss", "cuts", "lawsuit", "probe", "investigation", "recall", "downgrade", "loss", "decline", "warning", "export control", "regulatory"]);
  const score = positive - negative;
  if (score > 0) return sentimentResult("Positive", Math.min(0.72, 0.5 + score * 0.06), "Keyword fallback found more positive finance terms.", "keyword_fallback");
  if (score < 0) return sentimentResult("Negative", Math.min(0.72, 0.5 + Math.abs(score) * 0.06), "Keyword fallback found more negative finance terms.", "keyword_fallback");
  return sentimentResult("Neutral", 0.48, "Fallback found no strong directional finance terms.", "keyword_fallback");
}

function sentimentResult(sentiment, confidence, reasoning, method = "keyword_fallback") {
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
  return "Other";
}

function rankSymbols(query) {
  const normalized = normalizeSearch(query);
  if (!normalized || normalized.length < 1) return [];
  return state.symbolMaster
    .map((security) => ({ security, score: scoreSecurity(security, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.security.symbol.localeCompare(b.security.symbol))
    .map((item) => item.security);
}

function getPopularSuggestions() {
  const bySymbol = new Map(state.symbolMaster.map((security) => [normalizeSymbol(security.symbol), security]));
  return popularStocks.map((symbol) => bySymbol.get(symbol) || fallbackSecurities.find((item) => item.symbol === symbol)).filter(Boolean);
}

function scoreSecurity(security, normalizedQuery) {
  const symbol = normalizeSearch(security.symbol);
  const altSymbol = normalizeSearch(security.symbol.replace(".", "-"));
  const name = normalizeSearch(security.companyName);
  const qualityBoost = popularStocks.includes(security.symbol) ? 180 : security.securityType === "Common Stock" ? 60 : 0;
  const structuredPenalty = hasAny(name, ["leveraged", "inverse", " etn", " notes due"]) ? 220 : 0;
  if (symbol === normalizedQuery || altSymbol === normalizedQuery) return 1000 + qualityBoost;
  if (name === normalizedQuery) return 900 + qualityBoost;
  if (name.startsWith(normalizedQuery)) return 760 + qualityBoost - structuredPenalty;
  if (symbol.startsWith(normalizedQuery)) return 720 + qualityBoost;
  if (name.includes(` ${normalizedQuery}`)) return 520 + qualityBoost - structuredPenalty;
  if (name.includes(normalizedQuery) && normalizedQuery.length >= 3) return 380 + qualityBoost - structuredPenalty;
  return 0;
}

function showSuggestions(matches, { forceOpen = false } = {}) {
  state.suggestions = matches;
  if (!matches.length || (!forceOpen && !els.searchInput.matches(":focus") && !els.searchInput.value.trim())) {
    els.suggestions.classList.remove("open");
    els.suggestions.innerHTML = "";
    return;
  }
  els.suggestions.innerHTML = matches
    .map(
      (item) => `
        <button type="button" class="suggestion" data-symbol="${escapeAttr(item.symbol)}" role="option">
          <span class="suggestion-symbol">${item.symbol}</span>
          <span class="suggestion-name">${item.companyName}</span>
          <span class="suggestion-meta">${item.exchange}</span>
        </button>
      `
    )
    .join("");
  els.suggestions.classList.add("open");
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

function renderDashboard() {
  const filtered = getFilteredArticles();
  renderTarget(filtered);
  buildTopicFilters();
  renderSummary(filtered);
  renderBreakdown(filtered);
  renderNews(filtered);
  renderInsights(filtered);
  renderDataNote();
}

function resetDashboard({ preserveUrl = false } = {}) {
  state.selectedCompany = null;
  state.articles = [];
  state.topicSelection.clear();
  state.page = 1;
  state.status = "empty";
  state.statusMessage = "Search by ticker, company name, or partial company name to begin.";
  if (!preserveUrl) updateUrlSymbol(null);
  renderDashboard();
}

function renderTarget(items = []) {
  const name = document.querySelector("#targetName");
  const meta = document.querySelector("#targetMeta");
  const count = document.querySelector("#summaryArticleCount");
  const range = document.querySelector("#summaryRange");
  count.textContent = items.length.toLocaleString();
  range.textContent = state.range;
  if (!state.selectedCompany) {
    name.textContent = "No company selected";
    meta.textContent = state.statusMessage;
    return;
  }
  const company = state.selectedCompany;
  name.textContent = `${company.symbol} · ${company.companyName}`;
  meta.textContent = `${company.exchange} · ${company.securityType}${company.sector ? ` · ${company.sector}` : ""}${company.industry ? ` · ${company.industry}` : ""}`;
}

function buildTopicFilters() {
  if (!state.articles.length) {
    els.topicFilters.innerHTML = `<span class="empty-filter">Topics appear after news is loaded.</span>`;
    return;
  }
  const rangeItems = getRangeFilteredArticles();
  const availableTopics = topicOptions.filter((topic) => rangeItems.some((article) => normalizeTopic(article.topic) === topic));
  const visibleTopics = topicOptions.filter((topic) => availableTopics.includes(topic) || state.topicSelection.has(topic));
  if (!visibleTopics.length && !state.topicSelection.size) {
    els.topicFilters.innerHTML = `<span class="empty-filter">No topics appear in the selected ${state.range} range.</span>`;
    return;
  }
  const allTopicsChip = `
    <label class="topic-chip all-topics ${!state.topicSelection.size ? "active" : ""}">
      <input type="checkbox" value="__all__" ${!state.topicSelection.size ? "checked" : ""} />
      <span>All Topics</span>
      <small>${rangeItems.length}</small>
    </label>
  `;
  els.topicFilters.innerHTML =
    allTopicsChip +
    visibleTopics
      .map(
        (topic) => `
        <label class="topic-chip ${state.topicSelection.has(topic) ? "active" : ""}">
          <input type="checkbox" value="${escapeAttr(topic)}" ${state.topicSelection.has(topic) ? "checked" : ""} />
          <span>${topic}</span>
          <small>${rangeItems.filter((article) => normalizeTopic(article.topic) === topic).length}</small>
        </label>
      `
      )
      .join("");
}

function getFilteredArticles() {
  return getRangeFilteredArticles()
    .filter((article) => !state.topicSelection.size || state.topicSelection.has(normalizeTopic(article.topic)))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function getRangeFilteredArticles() {
  return state.articles.filter((article) => isWithinRange(article, state.range));
}

function renderSummary(items) {
  const counts = countSentiments(items);
  const overall = getOverallSentiment(counts, items.length);
  const avgConfidence = items.length
    ? Math.round((items.reduce((sum, item) => sum + item.confidence, 0) / items.length) * 100)
    : 0;

  document.querySelector("#overallLabel").textContent = overall;
  document.querySelector("#overallConfidence").textContent = `${avgConfidence}% avg confidence`;
  document.querySelector("#overallReason").textContent =
    items.length > 0
      ? buildOverallReason(overall, counts, items.length)
      : state.statusMessage;
  document.querySelector("#asOf").textContent = `As of ${formatDate(appNow())}`;
}

function renderBreakdown(items) {
  const counts = countSentiments(items);
  const total = items.length || 1;
  document.querySelector("#breakdown").innerHTML = ["Positive", "Neutral", "Negative"]
    .map((label) => {
      const percent = Math.round((counts[label] / total) * 100);
      return `
        <div class="breakdown-item">
          <span class="card-label">${label}</span>
          <strong>${items.length ? percent : 0}%</strong>
          <span class="cell-label">${counts[label]} article${counts[label] === 1 ? "" : "s"}</span>
          <div class="meter"><span style="width:${items.length ? percent : 0}%;background:${sentimentColors[label]}"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderNews(items) {
  const list = document.querySelector("#newsList");
  const pagination = document.querySelector("#pagination");
  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * state.pageSize;
  const pageItems = items.slice(start, start + state.pageSize);
  document.querySelector("#resultMeta").textContent =
    items.length > 0
      ? `Showing ${items.length} reputable article${items.length === 1 ? "" : "s"} across ${getTopicFilterLabel()} in ${state.range}.`
      : "Only articles inside the selected time range are shown.";

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">${getEmptyNewsMessage()}${state.status === "error" ? ` <button type="button" id="retryNews">Retry</button>` : ""}</div>`;
    pagination.innerHTML = "";
    const retry = document.querySelector("#retryNews");
    if (retry && state.selectedCompany) retry.addEventListener("click", () => selectCompany(state.selectedCompany));
    return;
  }

  list.innerHTML = pageItems
    .map(
      (article) => `
        <article class="article-row">
          <div>
            <a class="article-title" href="${article.url}" target="_blank" rel="noopener noreferrer">${article.headline}</a>
            <div class="article-meta">
              <span class="source-label">${article.source}</span>
              · ${formatDateTime(article.publishedAt)}
            </div>
            <p class="snippet">${article.summary}</p>
          </div>
          <div class="article-metadata">
            <div class="sentiment-group">
              <span class="badge ${article.sentiment}">${article.sentiment}</span>
              <span class="confidence">${Math.round(article.confidence * 100)}% confidence</span>
            </div>
            <span class="topic">${article.topic}</span>
          </div>
        </article>
      `
    )
    .join("");
  pagination.innerHTML = `
    <button type="button" data-page-action="prev" ${state.page === 1 ? "disabled" : ""}>Previous</button>
    <span>Page ${state.page} of ${totalPages} · ${items.length} articles</span>
    <button type="button" data-page-action="next" ${state.page === totalPages ? "disabled" : ""}>Next</button>
  `;
  pagination.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.page += button.dataset.pageAction === "next" ? 1 : -1;
      renderDashboard();
    });
  });
}

function getEmptyNewsMessage() {
  if (state.selectedCompany && state.articles.length && !getRangeFilteredArticles().length) {
    return `No reputable articles for ${state.selectedCompany.symbol} fall inside the selected ${state.range} range.`;
  }
  if (state.selectedCompany && state.articles.length) {
    return `No articles match the current topic filters in the selected ${state.range} range.`;
  }
  if (state.selectedCompany) {
    return `No reputable articles were found for ${state.selectedCompany.symbol} in the selected ${state.range} range.`;
  }
  return state.statusMessage;
}

function renderInsights(items) {
  const analysis = buildInvestmentAnalysis(items);
  document.querySelector("#analysisSummary").textContent = analysis.summary;
  fillList("#positiveThemes", analysis.positives);
  fillList("#negativeThemes", analysis.risks);
  fillList("#contradictions", analysis.mixed);
  fillList("#watchNext", analysis.events);
}

function renderDataNote() {
  if (state.status === "error") {
    els.dataNote.textContent = state.statusMessage;
    return;
  }
  if (!hasBackendApi() && !isLocalPreview() && !isLocalServer()) {
    els.dataNote.textContent =
      "Static GitHub Pages mode is active. Search uses the bundled fallback symbols unless browser-readable symbol data loads; live news needs a deployed API base or a browser provider key.";
    return;
  }
  els.dataNote.textContent =
    state.symbolMaster === fallbackSecurities
      ? "Fallback search is active for common U.S. stocks and ETFs. For live news, run node server.js and open http://127.0.0.1:48992."
      : "Symbol lookup uses a refreshable U.S. market directory. News is filtered to trusted financial, regulatory, and official company sources.";
}

function validArticle(article) {
  const publishedAt = new Date(article.publishedAt);
  return Boolean(
    article.source &&
      article.publishedAt &&
      Number.isFinite(publishedAt.getTime()) &&
      publishedAt <= appNow() &&
      article.url &&
      article.url.startsWith("https://") &&
      article.headline
  );
}

function applyTrustedSource(article, company) {
  const sourceRule = findTrustedSourceRule(article.source, article.url);
  const companyRule = isOfficialCompanySource(article.url, company) ? { label: `${company.symbol} Investor Relations` } : null;
  const rule = sourceRule || companyRule;
  return {
    ...article,
    source: rule ? rule.label : article.source,
    topic: normalizeTopic(article.topic),
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

function isOfficialCompanySource(url = "", company = {}) {
  const host = getHostname(url);
  if (!host) return false;
  const companyToken = normalizeSearch(company.companyName || "")
    .split(" ")
    .find((token) => token.length >= 3 && !["the", "inc", "corporation", "company", "incorporated", "platforms"].includes(token));
  return (host.includes("investor") || host.includes("ir.")) && companyToken && host.includes(companyToken);
}

function getHostname(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function applyRelevanceDiagnostics(article, company) {
  const relevance = getArticleRelevance(article, company);
  if (DEBUG_RELEVANCE && !relevance.included) {
    console.debug("Excluded article for weak relevance", {
      symbol: company.symbol,
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

function getArticleRelevance(article, company) {
  const headline = cleanText(article.headline);
  const summary = cleanText(article.summary);
  const symbol = normalizeSymbol(company.symbol);
  const variants = buildCompanyVariants(company);

  const headlineVariant = findVariantMatch(headline, variants);
  if (headlineVariant) return relevanceResult(true, "headline_company_variant_match", headlineVariant);

  const summaryVariant = findVariantMatch(summary, variants);
  if (summaryVariant) return relevanceResult(true, "abstract_company_variant_match", summaryVariant);

  if (hasTickerRelevance(headline, symbol)) return relevanceResult(true, "headline_ticker_market_context_match", symbol);
  if (hasTickerRelevance(summary, symbol)) return relevanceResult(true, "abstract_ticker_market_context_match", symbol);

  return relevanceResult(false, "no_headline_or_abstract_match", "");
}

function relevanceResult(included, reason, matchedValue) {
  return { included, reason, matchedValue };
}

function buildCompanyVariants(company) {
  const symbol = normalizeSymbol(company.symbol);
  const variants = new Set(companyVariantAliases[symbol] || []);
  const cleanedName = cleanCompanyVariant(company.companyName);
  if (cleanedName) variants.add(cleanedName);

  const normalized = normalizeSearch(company.companyName);
  const tokens = normalized
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
  const suffixGuard = symbol.includes(".") ? "" : `(?!\\.[A-Za-z])`;
  return new RegExp(`(^|[^A-Za-z0-9])(?:[$])?${escaped}${suffixGuard}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

function hasTickerRelevance(text, symbol) {
  return hasTickerMatch(text, symbol) && hasMarketContext(text);
}

function hasMarketContext(text = "") {
  const normalized = normalizeSearch(text);
  return hasAny(normalized, [
    "stock",
    "stocks",
    "shares",
    "nasdaq",
    "nyse",
    "earnings",
    "revenue",
    "guidance",
    "analyst",
    "price target",
    "market cap",
    "investor",
    "investors",
    "buy",
    "sell",
    "rating"
  ]);
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
    const urlKey = canonicalUrl;
    const fuzzyTitleKey = titleWords.length >= 5 ? `${timeBucket}|${titleKey}` : "";
    if (seen.has(urlKey) || (fuzzyTitleKey && seenTitles.has(fuzzyTitleKey))) return false;
    seen.add(urlKey);
    if (fuzzyTitleKey) seenTitles.add(fuzzyTitleKey);
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

function readSymbolCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(SYMBOL_CACHE_KEY));
    if (!cached || Date.now() - cached.updatedAt > SYMBOL_CACHE_MS) return null;
    return cached.symbols;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const response = await fetchProvider(url);
  if (!response.ok) {
    throw new Error(formatProviderError(url, response));
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetchProvider(url);
  if (!response.ok) {
    let message = formatProviderError(url, response);
    try {
      const payload = await response.json();
      if (payload.error) message = `${message}. Provider response: ${payload.error}`;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchProvider(url) {
  try {
    return await fetch(url);
  } catch (error) {
    throw new Error(`Provider request failed for ${url}: ${error.message || "network or CORS error"}`);
  }
}

async function fetchApiJson(path) {
  const candidates = getApiCandidates(path);
  if (!candidates.length) {
    throw new Error(
      "No backend API is configured for this static page. GitHub Pages cannot serve /api routes; set window.NEWS_SENTIMENT_API_BASE to a deployed API origin or use browser provider keys."
    );
  }
  let lastError;
  for (const candidate of candidates) {
    try {
      return await fetchJson(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Local news service is unavailable.");
}

function getApiCandidates(path) {
  const configuredBase = getConfiguredApiBase();
  if (configuredBase) return [joinUrl(configuredBase, path)];
  if (isLocalServer()) return [path];
  if (isLocalPreview()) return LOCAL_API_BASES.map((base) => `${base}${path}`);
  return [];
}

function hasBackendApi() {
  return Boolean(getApiCandidates("/api/news").length);
}

function getConfiguredApiBase() {
  const configured = window.NEWS_SENTIMENT_API_BASE || localStorage.getItem(API_BASE_STORAGE_KEY) || "";
  return String(configured).trim().replace(/\/+$/, "");
}

function joinUrl(base, path) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function isLocalPreview() {
  return window.location.protocol === "file:";
}

function isLocalServer() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function canUseBrowserProviderFallback() {
  return isLocalPreview() || isLocalServer() || !hasBackendApi();
}

function getMissingProviderMessage(company) {
  if (!hasBackendApi() && !isLocalPreview() && !isLocalServer()) {
    return [
      `No live news provider is configured for ${company.symbol}.`,
      "This GitHub Pages deployment is static-only, so it cannot run /api/news or keep provider API keys server-side.",
      "Deploy server.js as an API service and set window.NEWS_SENTIMENT_API_BASE, or add a browser-supported provider key in local storage."
    ].join(" ");
  }
  return (
    "Live news needs the local app server or a configured provider key. Run node server.js and open http://127.0.0.1:48992, or add a provider key in local storage."
  );
}

function formatProviderError(url, response) {
  const status = [response.status, response.statusText].filter(Boolean).join(" ");
  return `Provider request failed for ${url}: ${status || "unknown HTTP error"}`;
}

function setProviderStatus(status, message) {
  const node = document.querySelector("#providerStatus");
  if (!node) return;
  node.textContent = message;
  node.className = `status-pill ${status}`;
}

function normalizeTopic(topic) {
  return topicOptions.includes(topic) ? topic : "Other";
}

function getTopicFilterLabel() {
  if (!state.topicSelection.size) return "all topics";
  const selected = [...state.topicSelection];
  if (selected.length === 1) return selected[0];
  return `${selected.length} topics`;
}

function countSentiments(items) {
  return items.reduce(
    (acc, item) => {
      acc[item.sentiment] += 1;
      return acc;
    },
    { Positive: 0, Neutral: 0, Negative: 0 }
  );
}

function isWithinRange(article, range) {
  const publishedAt = new Date(article.publishedAt);
  if (!Number.isFinite(publishedAt.getTime())) return false;
  const cutoff = new Date(appNow());
  cutoff.setDate(cutoff.getDate() - rangeDays[range]);
  return publishedAt >= cutoff && publishedAt <= appNow();
}

function getOverallSentiment(counts, total) {
  if (!state.selectedCompany && state.status === "empty") return "No Search";
  if (!total) return "No Data";
  const sorted = ["Positive", "Neutral", "Negative"].sort((a, b) => counts[b] - counts[a]);
  if (counts[sorted[0]] === counts[sorted[1]]) return "Neutral";
  return sorted[0];
}

function buildOverallReason(overall, counts, total) {
  const maxCount = Math.max(counts.Positive, counts.Neutral, counts.Negative);
  const tied = ["Positive", "Neutral", "Negative"].filter((label) => counts[label] === maxCount);
  if (tied.length > 1) {
    return `The visible breakdown is tied across ${tied.join(", ")}; the summary is treated as neutral/mixed for consistency.`;
  }
  const percent = Math.round((counts[overall] / total) * 100);
  return `${overall} is the largest visible sentiment category at ${percent}% of the current ${state.range} article set.`;
}

function buildInvestmentAnalysis(items) {
  if (!items.length) {
    return {
      summary: `${getEmptyNewsMessage()} Confidence is low because there is no filtered article set to analyze.`,
      positives: ["No positive driver is supported by the current filtered articles."],
      risks: ["No negative driver is supported by the current filtered articles."],
      mixed: ["Mixed or neutral signals require at least one article in the selected range."],
      events: ["Catalysts will appear after reputable articles are loaded."]
    };
  }

  const counts = countSentiments(items);
  const overall = getOverallSentiment(counts, items.length);
  const topics = topTopics(items);
  const company = state.selectedCompany ? state.selectedCompany.symbol : "the selected company";
  const sourceCount = new Set(items.map((item) => item.source)).size;
  const confidence = getAnalysisConfidence(items, counts, sourceCount);
  const narrative = getInvestmentNarrative(items, counts);
  const dominantNarrative = topics.length
    ? `${topics.slice(0, 3).join(", ")} coverage`
    : "general company news";

  return {
    summary:
      `${company} news flow over ${state.range} looks ${narrative.label} for investors: ${narrative.reason} ` +
      `The dominant coverage area is ${dominantNarrative}, based on ${items.length} relevance-filtered article${items.length === 1 ? "" : "s"} from ${sourceCount} source${sourceCount === 1 ? "" : "s"}. ` +
      `Analysis confidence is ${confidence.label}: ${confidence.reason}`,
    positives: buildDriverList(items, "Positive", "positive driver"),
    risks: buildDriverList(items, "Negative", "risk or negative driver"),
    mixed: buildMixedSignals(items),
    events: buildEventList(items, confidence)
  };
}

function buildDriverList(items, sentiment, emptyLabel) {
  const matching = items.filter((item) => item.sentiment === sentiment);
  if (!matching.length) return [`No ${emptyLabel} is clearly supported by the current filtered articles.`];
  return matching
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4)
    .map((article) => {
      const signal = getTopInvestmentSignal(article, sentiment);
      return `${article.topic}: ${signal} is the investment signal from "${truncate(article.headline, 92)}" (${article.source}).`;
    });
}

function buildMixedSignals(items) {
  const neutral = items.filter((item) => item.sentiment === "Neutral");
  const labels = new Set(items.map((item) => item.sentiment));
  const mixedByModel = items.filter((item) => item.sentimentDebug?.mixedSignals || item.sentimentDebug?.disagreement);
  const signals = [];
  if (neutral.length) {
    const example = neutral[0];
    const reason = example.sentimentDebug?.neutralReason || "the article appears routine, mixed, or low impact";
    signals.push(`${neutral.length} neutral article${neutral.length === 1 ? "" : "s"} appear routine or mixed; for example, "${truncate(example.headline, 92)}" is neutral because ${reason.toLowerCase()}`);
  }
  if (mixedByModel.length) {
    const example = mixedByModel[0];
    signals.push(`The sentiment model found mixed or conflicting article context in ${mixedByModel.length} item${mixedByModel.length === 1 ? "" : "s"}, including "${truncate(example.headline, 92)}" (${example.source}).`);
  }
  if (labels.has("Positive") && labels.has("Negative")) {
    signals.push("Positive and negative items coexist, so the filtered set should be read as mixed rather than one-sided.");
  }
  if (!signals.length) signals.push("The current filtered set is directionally consistent, with limited conflicting evidence in the available article context.");
  return signals;
}

function buildEventList(items, confidence) {
  const catalystTopics = ["Earnings", "Guidance", "Regulation", "Legal", "Product", "Management", "Analyst", "M&A"];
  const catalysts = items.filter((item) => catalystTopics.includes(item.topic));
  const selected = (catalysts.length ? catalysts : items)
    .slice()
    .sort((a, b) => getSignalStrength(b) - getSignalStrength(a) || b.confidence - a.confidence)
    .slice(0, 4);
  const attention = inferInvestorAttention(items);
  return [
    ...selected.map((item) => `${item.topic}: watch whether ${getTopInvestmentSignal(item, item.sentiment).toLowerCase()} continues to affect the ${item.sentiment.toLowerCase()} narrative (${item.source}).`),
    `Investor attention: ${attention}`,
    `Confidence: ${confidence.label}.`
  ];
}

function getInvestmentNarrative(items, counts) {
  const total = items.length || 1;
  const positiveWeight = items.filter((item) => item.sentiment === "Positive").reduce((sum, item) => sum + item.confidence, 0);
  const negativeWeight = items.filter((item) => item.sentiment === "Negative").reduce((sum, item) => sum + item.confidence, 0);
  const neutralShare = counts.Neutral / total;
  const posSignals = topInvestmentSignals(items, "Positive");
  const negSignals = topInvestmentSignals(items, "Negative");

  if (positiveWeight > negativeWeight * 1.25 && counts.Positive >= Math.max(1, counts.Negative)) {
    return {
      label: "broadly supportive",
      reason: posSignals.length ? `positive investment signals such as ${posSignals.slice(0, 2).join(" and ")} outweigh current risks.` : "positive investment signals outweigh current risks."
    };
  }
  if (negativeWeight > positiveWeight * 1.25 && counts.Negative >= Math.max(1, counts.Positive)) {
    return {
      label: "cautious to negative",
      reason: negSignals.length ? `risks such as ${negSignals.slice(0, 2).join(" and ")} outweigh supportive signals.` : "negative investment signals outweigh supportive signals."
    };
  }
  if (neutralShare >= 0.65) {
    const thin = items.filter((item) => item.sentimentTextFieldsUsed !== "headline_abstract_and_body").length / total > 0.6;
    return {
      label: "mostly neutral",
      reason: thin ? "most available items lack enough public article context or clear company-specific investment signals." : "the current articles are mostly routine, factual, or balanced without a dominant investment direction."
    };
  }
  return {
    label: "mixed",
    reason: "supportive and risky investment signals coexist without a clear dominant direction."
  };
}

function topInvestmentSignals(items, sentiment) {
  const counts = new Map();
  items
    .flatMap((item) => item.sentimentDebug?.investmentSignals || [])
    .filter((signal) => signal.sentiment === sentiment)
    .forEach((signal) => counts.set(signal.label, (counts.get(signal.label) || 0) + signal.strength));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);
}

function getTopInvestmentSignal(article, sentiment) {
  const signals = (article.sentimentDebug?.investmentSignals || [])
    .filter((signal) => signal.sentiment === sentiment)
    .sort((a, b) => b.strength - a.strength);
  if (signals[0]) return signals[0].label;
  if (article.sentimentDebug?.neutralReason) return article.sentimentDebug.neutralReason;
  return article.reasoning || "company-specific news flow";
}

function getSignalStrength(article) {
  return (article.sentimentDebug?.investmentSignals || []).reduce((max, signal) => Math.max(max, signal.strength || 0), 0);
}

function inferInvestorAttention(items) {
  const topics = new Set(items.map((item) => item.topic));
  const context = items.map((item) => item.analysisContext || `${item.headline} ${item.summary}`).join(" ").toLowerCase();
  if (topics.has("Earnings") || topics.has("Guidance") || hasAny(context, ["earnings", "guidance", "forecast", "estimate"])) return "likely earnings and estimate-revision focused.";
  if (topics.has("Regulation") || topics.has("Legal") || hasAny(context, ["regulation", "lawsuit", "court", "probe", "investigation"])) return "likely risk-management and policy focused.";
  if (topics.has("Product") || topics.has("Competition") || hasAny(context, ["product", "launch", "market share", "competition", "rival"])) return "likely growth, product-cycle, and competitive-position focused.";
  if (topics.has("Analyst") || hasAny(context, ["upgrade", "downgrade", "price target", "rating"])) return "likely valuation and analyst-expectation focused.";
  return "likely broad headline-monitoring rather than a single catalyst.";
}

function getAnalysisConfidence(items, counts, sourceCount) {
  const top = Math.max(counts.Positive, counts.Neutral, counts.Negative);
  const consistency = top / items.length;
  const bodyCoverage = items.filter((item) => item.sentimentTextFieldsUsed === "headline_abstract_and_body").length / items.length;
  const modelCoverage = items.filter((item) => String(item.sentimentMethod || "").startsWith("nlp")).length / items.length;
  const coverageIsThin = bodyCoverage < 0.25 || modelCoverage < 0.8;
  if (items.length >= 20 && sourceCount >= 5 && consistency >= 0.55 && !coverageIsThin) {
    return { label: "high", reason: "article count, source breadth, and sentiment consistency are all strong." };
  }
  if (items.length >= 8 && sourceCount >= 3 && modelCoverage >= 0.8) {
    return { label: "medium", reason: "there is enough reputable coverage for a directional read, but some signals may still be incomplete." };
  }
  return { label: "low", reason: "the filtered article set is thin or concentrated in too few sources." };
}

function topTopics(items) {
  const counts = items.reduce((acc, item) => {
    acc[item.topic] = (acc[item.topic] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic]) => topic);
}

function fillList(selector, values) {
  document.querySelector(selector).innerHTML = values.map((value) => `<li>${value}</li>`).join("");
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

function normalizeExchange(value = "") {
  const exchangeMap = {
    XNAS: "NASDAQ",
    NASDAQ: "NASDAQ",
    XNYS: "NYSE",
    NYSE: "NYSE",
    XASE: "NYSE American",
    AMEX: "NYSE American",
    ARCAX: "NYSE Arca",
    ARCX: "NYSE Arca",
    BATS: "Cboe BZX",
    BZX: "Cboe BZX"
  };
  return exchangeMap[String(value).toUpperCase()] || value;
}

function normalizeSymbol(symbol = "") {
  return symbol.toUpperCase().replace(/[-/]/g, ".").replace(/\s/g, "");
}

function normalizeSearch(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-/]/g, ".")
    .replace(/[^a-z0-9. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value = "") {
  const parser = new DOMParser();
  return parser.parseFromString(String(value), "text/html").documentElement.textContent.trim();
}

function normalizeForSentiment(value = "") {
  return ` ${cleanText(value).toLowerCase().replace(/[^\w$%. -]+/g, " ").replace(/\s+/g, " ")} `;
}

function splitSentences(value = "") {
  return value
    .split(/(?<=[.!?])\s+|\s+[;:]\s+/)
    .map((sentence) => ` ${sentence.trim()} `)
    .filter((sentence) => sentence.trim());
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

function updateUrlSymbol(symbol) {
  const url = new URL(window.location.href);
  if (symbol) url.searchParams.set("symbol", symbol);
  else url.searchParams.delete("symbol");
  window.history.replaceState({}, "", url);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function escapeAttr(value) {
  return String(value).replace(/"/g, "&quot;");
}

function titleCase(value = "") {
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
