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
        relatedSymbols: (item.ticker_sentiment || []).map((entry) => entry.ticker)
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
  const articles = normalizeAndFilter(items, symbol, companyName, cutoff);
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

function normalizeAndFilter(items, symbol, companyName, cutoff) {
  return dedupeArticles(
    items
      .map((item) => normalizeNewsArticle(item))
      .filter(validArticle)
      .map((item) => applyTrustedSource(item, symbol, companyName))
      .filter((item) => item.verifiedSource)
      .filter((item) => new Date(item.publishedAt) >= cutoff)
      .map((item) => applyRelevanceDiagnostics(item, symbol, companyName))
      .filter((item) => item.relevance.included)
  );
}

function normalizeNewsArticle(raw) {
  const analysis = analyzeSentiment(`${raw.headline || ""}. ${raw.summary || ""}`);
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
    publisherHomepage: raw.publisherHomepage || "",
    verifiedSource: raw.verifiedSource || false
  };
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

function analyzeSentiment(text) {
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
    return {
      sentiment: "Positive",
      confidence: Math.min(0.86, 0.58 + score * 0.08),
      reasoning: "Positive language outweighs caution in the headline and public snippet."
    };
  }
  if (score < 0) {
    return {
      sentiment: "Negative",
      confidence: Math.min(0.86, 0.58 + Math.abs(score) * 0.08),
      reasoning: "Risk or downside language outweighs positive signals in the headline and public snippet."
    };
  }
  return {
    sentiment: "Neutral",
    confidence: 0.62,
    reasoning: "The available headline and snippet do not contain a strong directional signal."
  };
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

function cleanText(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
