const appNow = () => new Date();
const SYMBOL_CACHE_KEY = "news-sentiment-symbol-master-v1";
const SYMBOL_CACHE_MS = 24 * 60 * 60 * 1000;
const ARTICLES_PER_PAGE = 10;
const NEWS_KEYS = {
  polygon: "POLYGON_API_KEY",
  fmp: "FMP_API_KEY",
  alphaVantage: "ALPHAVANTAGE_API_KEY"
};
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
  refreshSymbols: document.querySelector("#refreshSymbols"),
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

  els.rangeFilters.addEventListener("click", async (event) => {
    if (event.target.tagName !== "BUTTON") return;
    if (event.target.dataset.range === state.range) return;
    state.range = event.target.dataset.range;
    state.page = 1;
    updateRangeSelection();
    if (state.selectedCompany) {
      await selectCompany(state.selectedCompany, { preserveSearch: true, resetPage: true, clearArticles: true });
    } else {
      renderDashboard();
    }
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

  els.refreshSymbols.addEventListener("click", async () => {
    await loadSymbolMaster({ forceRefresh: true });
    const query = els.searchInput.value.trim();
    showSuggestions(query ? rankSymbols(query).slice(0, 8) : getPopularSuggestions(), { forceOpen: !query });
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
    await selectCompany(state.selectedCompany, { preserveSearch: true, resetPage: false, clearArticles: false });
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
    await selectCompany(state.selectedCompany, { preserveSearch: true, resetPage: false, clearArticles: false });
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
  try {
    return await fetchApiJson("/api/symbols");
  } catch {
    // Static-file preview fallback. In production, use /api/symbols to avoid CORS
    // and to keep provider details server-side.
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

async function selectCompany(company, { preserveSearch = false, resetPage = true, clearArticles = true } = {}) {
  const requestId = ++newsRequestId;
  state.selectedCompany = company;
  els.suggestions.classList.remove("open");
  if (clearArticles) {
    state.topicSelection.clear();
    state.articles = [];
  }
  if (resetPage) state.page = 1;
  state.status = "loading-news";
  state.statusMessage = `Fetching reputable news for ${company.symbol} over ${state.range}.`;
  if (!preserveSearch) els.searchInput.value = `${company.symbol} - ${company.companyName}`;
  updateUrlSymbol(company.symbol);
  setProviderStatus("loading", `Loading ${state.range} news`);
  renderDashboard();

  try {
    const news = await fetchNewsForCompany(company);
    if (requestId !== newsRequestId) return;
    state.articles = dedupeArticles(
      news
        .map((article) => applyTrustedSource(article, company))
        .filter(validArticle)
        .filter((item) => isWithinRange(item, state.range))
        .filter((item) => item.verifiedSource)
        .map((item) => applyRelevanceDiagnostics(item, company))
        .filter((item) => item.relevance.included)
    );
    state.topicSelection.clear();
    state.status = state.articles.length ? "ready" : "no-news";
    state.statusMessage = state.articles.length
      ? `${state.articles.length} reputable article${state.articles.length === 1 ? "" : "s"} loaded for ${state.range}.`
      : `No reputable news was found for ${company.symbol} in the selected ${state.range} range.`;
    setProviderStatus("ready", state.articles.length ? `${state.articles.length} articles` : "No trusted news");
    renderDashboard();
  } catch (error) {
    if (requestId !== newsRequestId) return;
    state.status = "error";
    state.statusMessage = error.message;
    state.articles = [];
    setProviderStatus("error", "News unavailable");
    renderDashboard();
  }
}

async function fetchNewsForCompany(company) {
  try {
    const params = new URLSearchParams({
      symbol: company.symbol,
      companyName: company.companyName,
      range: state.range
    });
    return await fetchApiJson(`/api/news?${params.toString()}`);
  } catch (error) {
    if (!isLocalPreview()) {
      throw error;
    }
  }

  const polygonKey = localStorage.getItem(NEWS_KEYS.polygon);
  const fmpKey = localStorage.getItem(NEWS_KEYS.fmp);
  const alphaKey = localStorage.getItem(NEWS_KEYS.alphaVantage);

  if (polygonKey) return fetchPolygonNews(company, polygonKey);
  if (fmpKey) return fetchFmpNews(company, fmpKey);
  if (alphaKey) return fetchAlphaVantageNews(company, alphaKey);

  throw new Error(
    "Live no-key news needs the local app server. Run node server.js, then open http://127.0.0.1:48992 instead of opening index.html directly."
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
  const analysis = analyzeSentiment(
    `${raw.headline || ""}. ${raw.summary || ""}`,
    raw.providerSentiment,
    raw.providerScore
  );
  return {
    id: String(raw.id || raw.url || raw.headline),
    headline: cleanText(raw.headline),
    source: cleanText(raw.source),
    publishedAt: raw.publishedAt,
    url: raw.url,
    summary: truncate(cleanText(raw.summary), 220),
    relatedSymbols: raw.relatedSymbols || [],
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    reasoning: analysis.reasoning,
    topic: classifyTopic(`${raw.headline || ""} ${raw.summary || ""}`),
    verifiedSource: raw.verifiedSource || false
  };
}

function analyzeSentiment(text, providerSentiment, providerScore) {
  const normalizedProvider = String(providerSentiment || "").toLowerCase();
  if (normalizedProvider.includes("bullish") || normalizedProvider.includes("positive")) {
    return sentimentResult("Positive", 0.78, "Provider sentiment and article metadata lean positive.");
  }
  if (normalizedProvider.includes("bearish") || normalizedProvider.includes("negative")) {
    return sentimentResult("Negative", 0.78, "Provider sentiment and article metadata lean negative.");
  }

  const lower = text.toLowerCase();
  const positive = countMatches(lower, [
    "beat",
    "tops estimates",
    "above estimates",
    "raises",
    "record",
    "growth",
    "partnership",
    "approval",
    "upgrade",
    "buyback",
    "dividend"
  ]);
  const negative = countMatches(lower, [
    "miss",
    "cuts",
    "lawsuit",
    "probe",
    "investigation",
    "recall",
    "downgrade",
    "loss",
    "decline",
    "warning",
    "export control",
    "regulatory"
  ]);
  const score = positive - negative;
  if (score > 0) {
    return sentimentResult("Positive", Math.min(0.86, 0.58 + score * 0.08), "Positive language outweighs caution in the headline and public snippet.");
  }
  if (score < 0) {
    return sentimentResult("Negative", Math.min(0.86, 0.58 + Math.abs(score) * 0.08), "Risk or downside language outweighs positive signals in the headline and public snippet.");
  }
  if (Number.isFinite(providerScore) && Math.abs(providerScore) > 0.05) {
    const label = providerScore > 0 ? "Positive" : "Negative";
    return sentimentResult(label, 0.68, "Provider sentiment score is directional but low enough to retain uncertainty.");
  }
  return sentimentResult("Neutral", 0.62, "The available headline and snippet do not contain a strong directional signal.");
}

function sentimentResult(sentiment, confidence, reasoning) {
  return { sentiment, confidence, reasoning };
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
  const availableTopics = topicOptions.filter((topic) => state.articles.some((article) => normalizeTopic(article.topic) === topic));
  const allTopicsChip = `
    <label class="topic-chip all-topics ${!state.topicSelection.size ? "active" : ""}">
      <input type="checkbox" value="__all__" ${!state.topicSelection.size ? "checked" : ""} />
      <span>All Topics</span>
    </label>
  `;
  els.topicFilters.innerHTML =
    allTopicsChip +
    availableTopics
      .map(
        (topic) => `
        <label class="topic-chip ${state.topicSelection.has(topic) ? "active" : ""}">
          <input type="checkbox" value="${escapeAttr(topic)}" ${state.topicSelection.has(topic) ? "checked" : ""} />
          <span>${topic}</span>
        </label>
      `
      )
      .join("");
}

function getFilteredArticles() {
  return state.articles
    .filter((article) => isWithinRange(article, state.range))
    .filter((article) => !state.topicSelection.size || state.topicSelection.has(normalizeTopic(article.topic)))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
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
          <div class="metadata-cell sentiment-cell">
            <span class="cell-label">Sentiment</span>
            <span class="badge ${article.sentiment}">${article.sentiment}</span>
            <span class="confidence">${Math.round(article.confidence * 100)}% confidence</span>
          </div>
          <div class="metadata-cell topic-cell">
            <span class="cell-label">Topic</span>
            <div class="topic">${article.topic}</div>
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
  els.dataNote.textContent =
    state.symbolMaster === fallbackSecurities
      ? "Fallback search is active for common U.S. stocks and ETFs. For live news, run node server.js and open http://127.0.0.1:48992."
      : "Symbol lookup uses a refreshable U.S. market directory. News is filtered to trusted financial, regulatory, and official company sources.";
}

function validArticle(article) {
  return Boolean(article.source && article.publishedAt && article.url && article.url.startsWith("https://") && article.headline);
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

  if (hasTickerMatch(headline, symbol)) return relevanceResult(true, "headline_ticker_match", symbol);
  if (hasTickerMatch(summary, symbol)) return relevanceResult(true, "abstract_ticker_match", symbol);

  const headlineVariant = findVariantMatch(headline, variants);
  if (headlineVariant) return relevanceResult(true, "headline_company_variant_match", headlineVariant);

  const summaryVariant = findVariantMatch(summary, variants);
  if (summaryVariant) return relevanceResult(true, "abstract_company_variant_match", summaryVariant);

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
  return items.filter((item) => {
    const canonicalUrl = item.url.replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
    const titleKey = normalizeSearch(item.headline).split(" ").slice(0, 10).join(" ");
    const key = `${canonicalUrl}|${item.source}|${titleKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Provider request failed: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    let message = `Provider request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchApiJson(path) {
  const candidates = getApiCandidates(path);
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
  if (!isLocalPreview()) return [path];
  return LOCAL_API_BASES.map((base) => `${base}${path}`);
}

function isLocalPreview() {
  return window.location.protocol === "file:";
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
  if (state.status === "empty") return "No Search";
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
  const dominantNarrative = topics.length
    ? `${topics.slice(0, 3).join(", ")} coverage`
    : "general company news";

  return {
    summary:
      `${company} news flow over ${state.range} is ${overall.toLowerCase()} because ${overall.toLowerCase()} is the largest visible sentiment category. ` +
      `The dominant narrative is ${dominantNarrative}, based on ${items.length} reputable article${items.length === 1 ? "" : "s"} from ${sourceCount} source${sourceCount === 1 ? "" : "s"}. ` +
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
  return topTopics(matching)
    .slice(0, 4)
    .map((topic) => {
      const article = matching.find((item) => item.topic === topic);
      return `${topic}: supported by "${truncate(article.headline, 92)}" (${article.source}).`;
    });
}

function buildMixedSignals(items) {
  const neutral = items.filter((item) => item.sentiment === "Neutral");
  const labels = new Set(items.map((item) => item.sentiment));
  const signals = [];
  if (neutral.length) {
    const example = neutral[0];
    signals.push(`${neutral.length} neutral article${neutral.length === 1 ? "" : "s"} suggest the news flow is not strongly directional; for example, "${truncate(example.headline, 92)}" (${example.source}).`);
  }
  if (labels.has("Positive") && labels.has("Negative")) {
    signals.push("Positive and negative items coexist, so the filtered set should be read as mixed rather than one-sided.");
  }
  if (!signals.length) signals.push("The current filtered set is directionally consistent, with limited conflicting evidence in the available headlines and snippets.");
  return signals;
}

function buildEventList(items, confidence) {
  const catalystTopics = ["Earnings", "Guidance", "Regulation", "Legal", "Product", "Management", "Analyst", "M&A"];
  const catalysts = items.filter((item) => catalystTopics.includes(item.topic));
  const selected = (catalysts.length ? catalysts : items).slice(0, 4);
  const attention = inferInvestorAttention(items);
  return [
    ...selected.map((item) => `${item.topic}: watch follow-through from "${truncate(item.headline, 90)}" (${item.source}).`),
    `Investor attention: ${attention}`,
    `Confidence: ${confidence.label}.`
  ];
}

function inferInvestorAttention(items) {
  const topics = new Set(items.map((item) => item.topic));
  if (topics.has("Earnings") || topics.has("Guidance")) return "likely earnings and estimate-revision focused.";
  if (topics.has("Regulation") || topics.has("Legal")) return "likely risk-management and policy focused.";
  if (topics.has("Product") || topics.has("Competition")) return "likely growth, product-cycle, and competitive-position focused.";
  if (topics.has("Analyst")) return "likely valuation and analyst-expectation focused.";
  return "likely broad headline-monitoring rather than a single catalyst.";
}

function getAnalysisConfidence(items, counts, sourceCount) {
  const top = Math.max(counts.Positive, counts.Neutral, counts.Negative);
  const consistency = top / items.length;
  if (items.length >= 20 && sourceCount >= 5 && consistency >= 0.55) {
    return { label: "high", reason: "article count, source breadth, and sentiment consistency are all strong." };
  }
  if (items.length >= 8 && sourceCount >= 3) {
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

function truncate(value, max) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
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
