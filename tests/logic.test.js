const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class MockNode {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.className = "";
    this.style = {};
    this.type = "";
    this._listeners = {};
    this.classList = {
      add() {},
      remove() {},
      toggle() {}
    };
  }

  addEventListener(type, listener) {
    this._listeners[type] = listener;
  }

  setAttribute() {}

  matches() {
    return false;
  }

  closest() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

function loadAppLogic(
  location = { href: "http://localhost/", protocol: "http:", hostname: "localhost", search: "" },
  appConfig = {}
) {
  const nodes = new Map();
  const getNode = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new MockNode());
    return nodes.get(selector);
  };
  const rangeFilters = getNode("#rangeFilters");
  rangeFilters.querySelectorAll = () => [
    { dataset: { range: "24h" }, classList: { toggle() {} }, setAttribute() {} },
    { dataset: { range: "7d" }, classList: { toggle() {} }, setAttribute() {} },
    { dataset: { range: "30d" }, classList: { toggle() {} }, setAttribute() {} },
    { dataset: { range: "90d" }, classList: { toggle() {} }, setAttribute() {} }
  ];

  const localStorageData = new Map();
  localStorageData.set(
    "news-sentiment-symbol-master-v1",
    JSON.stringify({
      updatedAt: Date.now(),
      symbols: [{ symbol: "AAPL", companyName: "Apple Inc.", exchange: "NASDAQ", securityType: "Common Stock" }]
    })
  );

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    Intl,
    Date,
    document: {
      querySelector: getNode,
      addEventListener() {}
    },
    window: {
      location,
      NEWS_SENTIMENT_CONFIG: appConfig,
      history: { replaceState() {} }
    },
    localStorage: {
      getItem(key) {
        return localStorageData.get(key) || null;
      },
      setItem(key, value) {
        localStorageData.set(key, value);
      }
    },
    DOMParser: class {
      parseFromString(value) {
        return { documentElement: { textContent: String(value).replace(/<[^>]*>/g, " ").trim() } };
      }
    }
  };
  context.globalThis = context;

  const appPath = path.join(__dirname, "..", "app.js");
  const source = `${fs.readFileSync(appPath, "utf8")}
globalThis.__logic = {
  state,
  fallbackSecurities,
  getFilteredArticles,
  getRangeFilteredArticles,
  countSentiments,
  getOverallSentiment,
  dedupeArticles,
  getArticleRelevance,
  validArticle,
  normalizeTopic,
  isWithinRange,
  getApiCandidates,
  hasBackendApi,
  getMissingProviderMessage
};`;
  vm.runInNewContext(source, context, { filename: appPath });
  return context.__logic;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function article(overrides = {}) {
  return {
    headline: "Apple earnings beat estimates",
    summary: "Apple revenue grew faster than expected.",
    source: "Reuters",
    publishedAt: daysAgo(2),
    url: `https://www.reuters.com/markets/${Math.random()}`,
    topic: "Earnings",
    sentiment: "Positive",
    confidence: 0.7,
    ...overrides
  };
}

const logic = loadAppLogic();
const { state } = logic;
state.selectedCompany = { symbol: "AAPL", companyName: "Apple Inc.", exchange: "NASDAQ", securityType: "Common Stock" };

state.range = "7d";
state.topicSelection.clear();
state.articles = [
  article({ publishedAt: daysAgo(1), topic: "Earnings", sentiment: "Positive" }),
  article({ publishedAt: daysAgo(20), topic: "Legal", sentiment: "Negative" }),
  article({ publishedAt: daysAgo(3), topic: "Product", sentiment: "Neutral" })
];
assert.strictEqual(logic.getFilteredArticles().length, 2, "time range filtering should derive the visible set");

state.topicSelection.add("Product");
assert.deepStrictEqual(
  logic.getFilteredArticles().map((item) => item.topic),
  ["Product"],
  "topic filtering should exactly match selected topics"
);

const counts = logic.countSentiments([
  article({ sentiment: "Negative" }),
  article({ sentiment: "Negative" }),
  article({ sentiment: "Positive" })
]);
assert.strictEqual(logic.getOverallSentiment(counts, 3), "Negative", "overall sentiment should follow the largest category");

const deduped = logic.dedupeArticles([
  article({ headline: "Apple earnings beat estimates as iPhone revenue rises", url: "https://www.reuters.com/story?utm_source=x" }),
  article({ headline: "Apple earnings beat estimates as iPhone revenue rises", url: "https://www.reuters.com/story?utm_campaign=y" }),
  article({ headline: "Apple faces regulatory probe", url: "https://www.reuters.com/other" })
]);
assert.strictEqual(deduped.length, 2, "canonical and near-duplicate articles should be removed");

assert.strictEqual(
  logic.getArticleRelevance(article({ headline: "Microsoft raises guidance", summary: "Cloud demand rose." }), state.selectedCompany).included,
  false,
  "articles must mention the selected company or ticker in headline or abstract"
);
assert.strictEqual(
  logic.getArticleRelevance(article({ headline: "AAPL raises guidance", summary: "" }), state.selectedCompany).included,
  true,
  "ticker mentions should be relevant"
);
assert.strictEqual(
  logic.getArticleRelevance(article({ headline: "AAPL launches physician affiliation guide", summary: "" }), state.selectedCompany).included,
  false,
  "ticker-only acronym matches should require market context"
);
assert.strictEqual(
  logic.getArticleRelevance(article({ headline: "AAPL stock rises after analyst upgrade", summary: "" }), state.selectedCompany).included,
  true,
  "ticker-only matches with market context should remain relevant"
);
assert.strictEqual(
  logic.getArticleRelevance(article({ headline: "AAPL.DE Reuters", summary: "" }), state.selectedCompany).included,
  false,
  "foreign ticker suffixes should not match the selected base ticker"
);

const future = article({ publishedAt: new Date(Date.now() + 86400000).toISOString() });
assert.strictEqual(logic.validArticle(future), false, "future publish times should not be accepted");

const staticLogic = loadAppLogic({
  href: "https://example.github.io/News-Sentiment/",
  protocol: "https:",
  hostname: "example.github.io",
  search: ""
});
assert.strictEqual(staticLogic.getApiCandidates("/api/news").length, 0, "static production pages must not call missing API routes");
assert.strictEqual(staticLogic.hasBackendApi(), false, "GitHub Pages should not be treated as a backend host");
assert.match(
  staticLogic.getMissingProviderMessage({ symbol: "AAPL" }),
  /GitHub Pages deployment is static-only/,
  "static production errors should explain the missing backend setup"
);

const configuredApiLogic = loadAppLogic(
  {
    href: "https://example.github.io/News-Sentiment/",
    protocol: "https:",
    hostname: "example.github.io",
    search: ""
  },
  { apiBase: "https://news-sentiment-api.example.com/" }
);
const configuredApiCandidates = configuredApiLogic.getApiCandidates("/api/news");
assert.strictEqual(configuredApiCandidates.length, 1, "configured production pages should have one API candidate");
assert.strictEqual(
  configuredApiCandidates[0],
  "https://news-sentiment-api.example.com/api/news",
  "static production pages should call the configured deployed API origin"
);

console.log("logic tests passed");
