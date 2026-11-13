"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const apiUrl = "https://api.sec.or.th/v2/fund/daily-info/nav";
const fundApiUrl = "https://api.sec.or.th/v2/fund/";
const yahooChartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/";
const apiNames = new Set(["SEC_API_SUBSCRIPTION_KEY", "OCP_APIM_SUBSCRIPTION_KEY"]);
const navFunds = {
  "scbnk225": { projId: "M0429_2556", fundClassName: "SCBNK225" },
  "kjpx-aa": { projId: "M0074_2558", fundClassName: "K-JPX-A(A)" },
  "scbsp500a": { projId: "M0643_2555", fundClassName: "SCBS&P500A" },
  "scbrmdigi-a": { projId: "M0457_2565", fundClassName: "SCBRMDIGI(A)" },
  "k-usxndq-aa": { projId: "M0369_2555", fundClassName: "K-USXNDQ-A(A)" },
  "b-innotechrmf": { projId: "M0213_2561", fundClassName: "main" }
};
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/service-worker.js", ["service-worker.js", "text/javascript; charset=utf-8"]],
  ["/icon-180.png", ["icon-180.png", "image/png"]],
  ["/icon-192.png", ["icon-192.png", "image/png"]],
  ["/icon-512.png", ["icon-512.png", "image/png"]]
]);

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readSubscriptionKey() {
  for (const name of apiNames) {
    if (process.env[name]?.trim()) return process.env[name].trim();
  }

  let contents;
  try {
    contents = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  } catch {
    return null;
  }

  const lines = contents.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  for (const line of lines) {
    const assignment = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (assignment && apiNames.has(assignment[1])) return unquote(assignment[2]);
  }

  if (lines.length === 1 && !/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(lines[0])) return unquote(lines[0]);
  return null;
}

function readLocalConfig() {
  try {
    const contents = fs.readFileSync(path.join(root, ".env.local"), "utf8");
    const values = new Map();
    for (const line of contents.split(/\r?\n/)) {
      const assignment = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (assignment) values.set(assignment[1], unquote(assignment[2]));
    }
    return values;
  } catch {
    return new Map();
  }
}

function configValue(names, localConfig) {
  for (const name of names) {
    if (process.env[name]?.trim()) return process.env[name].trim();
  }
  for (const name of names) {
    if (localConfig.get(name)?.trim()) return localConfig.get(name).trim();
  }
  return null;
}

function startNavDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") - 1));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function previousWeekday(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function getGoogleAccessToken(clientId, clientSecret, refreshToken) {
  const upstream = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(15000)
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !payload.access_token) {
    throw new Error(payload.error_description || `Google OAuth ตอบกลับสถานะ ${upstream.status}`);
  }
  return payload.access_token;
}

async function fetchGoogleSheetValues(rangeName = "GOOGLE_SHEETS_RANGE") {
  const localConfig = readLocalConfig();
  const clientId = configValue(["GOOGLE_CLIENT_ID", "CLIENT_ID"], localConfig);
  const clientSecret = configValue(["GOOGLE_CLIENT_SECRET", "CLIENT_SECRET"], localConfig);
  const refreshToken = configValue(["GOOGLE_REFRESH_TOKEN", "REFRESH_TOKEN"], localConfig);
  const spreadsheetId = configValue(["GOOGLE_SHEETS_SPREADSHEET_ID"], localConfig);
  const range = configValue([rangeName], localConfig);

  if (!clientId || !clientSecret || !refreshToken || !spreadsheetId || !range) {
    const error = new Error("กรุณาตั้งค่า Google OAuth, GOOGLE_SHEETS_SPREADSHEET_ID และ GOOGLE_SHEETS_RANGE");
    error.status = 503;
    throw error;
  }

  const accessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("majorDimension", "ROWS");
  const upstream = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(payload.error?.message || `Google Sheets ตอบกลับสถานะ ${upstream.status}`);
    error.status = 502;
    throw error;
  }
  return { range: payload.range || range, values: payload.values || [] };
}

function parseSheetNumber(value) {
  const text = String(value ?? "").trim().replace(/[^\d.+-]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getSheetMarketMetrics(values) {
  const headers = values[0]?.map((value) => String(value).trim().toLowerCase()) || [];
  const dateIndex = headers.indexOf("date");
  const wideColumns = {
    ivvPrice: headers.indexOf("ivv price (usd)"),
    ivvSma50: headers.indexOf("ivv 50d sma"),
    ivvSma200: headers.indexOf("ivv 200d sma"),
    ewjPrice: headers.indexOf("ewj price (usd)"),
    ewjSma50: headers.indexOf("ewj 50d sma"),
    ewjSma200: headers.indexOf("ewj 200d sma"),
    nikkeiPrice: headers.findIndex((header) => ["nikkei 225 price", "nikkei 225 price (jpy)", "price (jpy)"].includes(header)),
    nikkeiSma50: headers.findIndex((header) => ["nikkei 225 50d sma", "nikkei 225 50-day sma", "50d sma"].includes(header)),
    nikkeiSma200: headers.findIndex((header) => ["nikkei 225 200d sma", "nikkei 225 200-day sma", "200d sma"].includes(header)),
    vix: headers.indexOf("vix index")
  };
  if (Object.values(wideColumns).some((index) => index >= 0)) {
    const latestRow = values.slice(1).filter((row) => row.some((value) => String(value ?? "").trim())).at(-1);
    if (!latestRow) return null;
    const valueAt = (index) => index < 0 ? null : parseSheetNumber(latestRow[index]);
    return {
      date: dateIndex < 0 ? null : String(latestRow[dateIndex] ?? "").trim() || null,
      ivvPrice: valueAt(wideColumns.ivvPrice),
      ivvSma50: valueAt(wideColumns.ivvSma50),
      ivvSma200: valueAt(wideColumns.ivvSma200),
      ewjPrice: valueAt(wideColumns.ewjPrice),
      ewjSma50: valueAt(wideColumns.ewjSma50),
      ewjSma200: valueAt(wideColumns.ewjSma200),
      nikkeiPrice: valueAt(wideColumns.nikkeiPrice),
      nikkeiSma50: valueAt(wideColumns.nikkeiSma50),
      nikkeiSma200: valueAt(wideColumns.nikkeiSma200),
      vix: valueAt(wideColumns.vix)
    };
  }

  const tickerIndex = headers.indexOf("ticker");
  const priceIndex = headers.indexOf("current_price");
  if (tickerIndex < 0 || priceIndex < 0) return null;

  const prices = new Map(values.slice(1).map((row) => [
    String(row[tickerIndex] || "").trim().toUpperCase(),
    parseSheetNumber(row[priceIndex])
  ]));
  return {
    date: null,
    ivvPrice: null,
    ivvSma50: null,
    ivvSma200: null,
    ewjPrice: prices.get("NYSEARCA:EWJ") ?? null,
    ewjSma50: prices.get("NYSEARCA:EWJ (50D SMA)") ?? null,
    ewjSma200: prices.get("NYSEARCA:EWJ (200D SMA)") ?? null,
    nikkeiPrice: null,
    nikkeiSma50: null,
    nikkeiSma200: null,
    vix: prices.get("INDEXCBOE:VIX") ?? null
  };
}

async function getGoogleSheetData(response) {
  try {
    sendJson(response, 200, await fetchGoogleSheetValues());
  } catch (error) {
    const status = error.status || (error.name === "TimeoutError" ? 504 : 502);
    sendJson(response, status, {
      error: error.name === "TimeoutError" ? "Google Sheets ใช้เวลาตอบกลับนานเกินไป" : error.message
    });
  }
}

async function getSecItems(endpoint, query, subscriptionKey) {
  const url = new URL(endpoint, fundApiUrl);
  url.search = new URLSearchParams(query).toString();
  const upstream = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": subscriptionKey
    },
    signal: AbortSignal.timeout(15000)
  });
  if (upstream.status === 204) return [];
  if (!upstream.ok) throw new Error(`SEC API ตอบกลับสถานะ ${upstream.status}`);
  const payload = await upstream.json();
  return Array.isArray(payload?.items) ? payload.items : [];
}

function exactClassRecords(items, fund) {
  return items.filter((item) => item.proj_id === fund.projId && item.fund_class_name === fund.fundClassName);
}

function latestRecord(items, dateKey = "start_date") {
  return [...items].sort((left, right) => String(right[dateKey] || "").localeCompare(String(left[dateKey] || "")))[0] || null;
}

function getBenchmarkSource(profile, benchmarks) {
  const text = [
    ...benchmarks.map((item) => item.benchmark || ""),
    profile.feederfund_master_fund || "",
    profile.proj_name_en || "",
    profile.investment_policy_desc || ""
  ].join(" ").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ");

  if (/nikkei\s*225/i.test(text)) return { ticker: "^N225", name: "Nikkei 225", isProxy: false };
  if (/msci\s*japan/i.test(text)) return { ticker: "EWJ", name: "MSCI Japan via EWJ", isProxy: true };
  if (/topix/i.test(text)) return { ticker: "1306.T", name: "TOPIX via NEXT FUNDS ETF (1306.T)", isProxy: true };
  if (/s\s*&\s*p\s*500/i.test(text)) return { ticker: "^GSPC", name: "S&P 500", isProxy: false };
  if (/nasdaq[\s-]*100/i.test(text)) return { ticker: "^NDX", name: "NASDAQ-100", isProxy: false };
  if (/msci\s*(world|acwi)|\bacwi\b|developed markets large\s*&\s*mid cap/i.test(text)) {
    return { ticker: "URTH", name: "MSCI World ETF (URTH) proxy", isProxy: true };
  }
  return { ticker: null, name: benchmarks.map((item) => item.benchmark).filter(Boolean).join("; "), isProxy: false };
}

async function getYahooChart(ticker, range) {
  const url = new URL(encodeURIComponent(ticker), yahooChartUrl);
  const query = range === "max"
    ? { period1: "0", period2: String(Math.floor(Date.now() / 1000)), interval: "1d" }
    : { range, interval: "1d" };
  url.search = new URLSearchParams(query).toString();
  const upstream = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  if (!upstream.ok) throw new Error(`Yahoo Finance ตอบกลับสถานะ ${upstream.status}`);
  const payload = await upstream.json();
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error(payload.chart?.error?.description || "ไม่พบข้อมูลราคาตลาด");
  const quote = result.indicators?.quote?.[0] || {};
  const rows = (result.timestamp || []).map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    high: Number(quote.high?.[index]),
    close: Number(quote.close?.[index])
  })).filter((item) => Number.isFinite(item.close) && item.close > 0);
  return {
    rows,
    currentPrice: Number(result.meta?.regularMarketPrice) || rows.at(-1)?.close || null,
    asOfDate: rows.at(-1)?.date || null,
    currency: result.meta?.currency || null,
    granularity: result.meta?.dataGranularity || null
  };
}

async function getFundAnalysis(response, fundId) {
  const fund = navFunds[fundId];
  if (!fund) {
    sendJson(response, 400, { error: "ไม่รองรับกองทุนที่เลือก" });
    return;
  }

  const subscriptionKey = readSubscriptionKey();
  const query = { proj_id: fund.projId, fund_class_name: fund.fundClassName, latest: "true", page_size: "100" };
  const navStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const requests = subscriptionKey ? [
    getSecItems("general-info/profiles", { project_info: fund.projId, fund_class_name: fund.fundClassName, page_size: "100" }, subscriptionKey),
    getSecItems("factsheet/statistics", query, subscriptionKey),
    getSecItems("factsheet/performance", query, subscriptionKey),
    getSecItems("factsheet/fees", query, subscriptionKey),
    getSecItems("factsheet/benchmarks", { proj_id: fund.projId, latest: "true", page_size: "100" }, subscriptionKey),
    getSecItems("factsheet/top5-holdings", { proj_id: fund.projId, latest: "true", page_size: "100" }, subscriptionKey),
    getSecItems("daily-info/nav", {
      proj_id: fund.projId,
      fund_class_name: fund.fundClassName,
      start_nav_date: navStart,
      end_nav_date: startNavDate(),
      page_size: "100"
    }, subscriptionKey)
  ] : [];
  const results = await Promise.allSettled(requests);
  const errors = [];
  if (!subscriptionKey) errors.push("SEC API key");
  const records = subscriptionKey ? results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    errors.push(["โปรไฟล์", "สถิติ", "ผลการดำเนินงาน", "ค่าธรรมเนียม", "ดัชนีชี้วัด", "สินทรัพย์หลัก", "NAV"][index]);
    return [];
  }) : Array.from({ length: 7 }, () => []);
  const [profiles, statistics, performance, fees, benchmarks, holdings, navHistory] = records;
  const profile = profiles.find((item) => item.proj_id === fund.projId && item.fund_class_name === fund.fundClassName) || {};
  const stats = latestRecord(exactClassRecords(statistics, fund));
  const exactPerformance = exactClassRecords(performance, fund);
  const volatility = latestRecord(exactPerformance.filter((item) =>
    item.performance_type_desc === "ความผันผวนของกองทุนรวม" && /^5\s*(years?|ปี)$/i.test(String(item.reference_period || "").trim())
  ), "last_upd_date");
  const totalFee = latestRecord(exactClassRecords(fees, fund).filter((item) =>
    /total fee and expense|ค่าธรรมเนียมและค่าใช้จ่ายรวมทั้งหมด/i.test(item.fee_type_desc || "")
  ), "last_upd_date");
  const latestNav = latestRecord(exactClassRecords(navHistory, fund), "nav_date");
  const exactBenchmarks = benchmarks.filter((item) => item.proj_id === fund.projId);
  const exactHoldings = holdings.filter((item) => item.proj_id === fund.projId).sort((left, right) => Number(left.asset_seq) - Number(right.asset_seq));
  let benchmarkSource = getBenchmarkSource(profile, exactBenchmarks);
  if (!benchmarkSource.ticker && fundId === "scbsp500a") {
    benchmarkSource = { ticker: "^GSPC", name: "S&P 500", isProxy: false };
  }
  const sheetRangeName = fundId === "scbnk225" ? "GOOGLE_SHEETS_RANGE_SCBNK225"
    : fundId === "scbsp500a" ? "GOOGLE_SHEETS_RANGE" : null;
  const sheetRange = sheetRangeName ? configValue([sheetRangeName], readLocalConfig()) : null;

  const marketResults = await Promise.allSettled([
    benchmarkSource.ticker ? getYahooChart(benchmarkSource.ticker, "5y") : Promise.resolve(null),
    benchmarkSource.ticker && !benchmarkSource.isProxy ? getYahooChart(benchmarkSource.ticker, "max") : Promise.resolve(null),
    fundId === "scbnk225" ? Promise.resolve(null) : getYahooChart("^VIX", "1y"),
    sheetRange ? fetchGoogleSheetValues(sheetRangeName) : Promise.resolve(null)
  ]);
  const marketErrors = [];
  const market = marketResults.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    marketErrors.push(["ดัชนีชี้วัด", "ประวัติดัชนีชี้วัด", "VIX", "Google Sheets"][index]);
    return null;
  });
  const [benchmarkDaily, benchmarkHistory, vixHistory, sheetData] = market;
  const sheetMetrics = sheetData ? getSheetMarketMetrics(sheetData.values) : null;
  if (sheetData && !sheetMetrics) marketErrors.push("รูปแบบ Google Sheets ไม่ถูกต้อง");
  const closes = benchmarkDaily?.rows.map((item) => item.close) || [];
  const sma = (period) => closes.length >= period
    ? closes.slice(-period).reduce((sum, value) => sum + value, 0) / period
    : null;
  const useSheetEwjTrend = ["^N225", "EWJ"].includes(benchmarkSource.ticker) &&
    [sheetMetrics?.ewjPrice, sheetMetrics?.ewjSma50, sheetMetrics?.ewjSma200].every(Number.isFinite);
  const useSheetNikkeiTrend = benchmarkSource.ticker === "^N225" &&
    [sheetMetrics?.nikkeiPrice, sheetMetrics?.nikkeiSma50, sheetMetrics?.nikkeiSma200].every(Number.isFinite);
  const useSheetIvvTrend = benchmarkSource.ticker === "^GSPC" &&
    [sheetMetrics?.ivvPrice, sheetMetrics?.ivvSma50, sheetMetrics?.ivvSma200].every(Number.isFinite);
  const useSheetTrend = useSheetNikkeiTrend || useSheetEwjTrend || useSheetIvvTrend;
  const trendPrice = useSheetNikkeiTrend ? sheetMetrics.nikkeiPrice
    : useSheetEwjTrend ? sheetMetrics.ewjPrice
    : useSheetIvvTrend ? sheetMetrics.ivvPrice
      : benchmarkDaily?.currentPrice || benchmarkDaily?.rows.at(-1)?.close || null;
  const sma50 = useSheetNikkeiTrend ? sheetMetrics.nikkeiSma50
    : useSheetEwjTrend ? sheetMetrics.ewjSma50 : useSheetIvvTrend ? sheetMetrics.ivvSma50 : sma(50);
  const sma200 = useSheetNikkeiTrend ? sheetMetrics.nikkeiSma200
    : useSheetEwjTrend ? sheetMetrics.ewjSma200 : useSheetIvvTrend ? sheetMetrics.ivvSma200 : sma(200);
  const allTimeHigh = benchmarkHistory?.rows.length
    ? Math.max(...benchmarkHistory.rows.map((item) => item.high).filter(Number.isFinite))
    : null;
  const currentPrice = benchmarkDaily?.currentPrice || benchmarkDaily?.rows.at(-1)?.close || null;
  const hasSheetVix = Number.isFinite(sheetMetrics?.vix);
  const vixValue = hasSheetVix ? sheetMetrics.vix
    : fundId === "scbnk225" ? null
      : vixHistory?.currentPrice || vixHistory?.rows.at(-1)?.close || null;
  const navValue = Number(latestNav?.last_val);
  const netAsset = Number(latestNav?.net_asset);

  sendJson(response, 200, {
    fundId,
    fundName: profile.proj_name_en || fund.fundClassName,
    shareClassName: fund.fundClassName,
    sec: {
      profile: {
        manager: profile.comp_name_en || null,
        inceptionDate: profile.init_date || null,
        managementStyle: profile.management_style || null,
        masterFund: profile.feederfund_master_fund || null,
        investmentPolicy: profile.policy_desc || null,
        currencyHedgePolicy: profile.exchange_rate_protection_policy || null
      },
      benchmark: exactBenchmarks[0]?.benchmark || null,
      benchmarkRemark: exactBenchmarks[0]?.benchmark_remark || null,
      statistics: {
        maxDrawdownPercent: Number.isFinite(Number(stats?.maximum_drawdown)) ? Number(stats.maximum_drawdown) : null,
        hedgePercent: Number.isFinite(Number(stats?.fx_hedging)) ? Number(stats.fx_hedging) : null,
        asOfDate: stats?.start_date || null
      },
      volatilityPercent: Number.isFinite(Number(volatility?.performance_value)) ? Number(volatility.performance_value) : null,
      volatilityAsOfDate: volatility?.start_date || null,
      totalFeePercent: Number.isFinite(Number(totalFee?.actual_value)) ? Number(totalFee.actual_value)
        : Number.isFinite(Number(totalFee?.rate)) ? Number(totalFee.rate) : null,
      feeAsOfDate: totalFee?.start_date || null,
      nav: Number.isFinite(navValue) ? navValue : null,
      navAsOfDate: latestNav?.nav_date || null,
      aumThb: Number.isFinite(netAsset) ? netAsset : null,
      holdings: exactHoldings.slice(0, 5).map((item) => ({ name: item.asset_name, percentNav: Number(item.asset_ratio) || null })),
      asOfDate: [profile.last_upd_date, stats?.last_upd_date, volatility?.last_upd_date, totalFee?.last_upd_date]
        .filter(Boolean).sort().at(-1) || null
    },
    market: {
      benchmarkName: benchmarkSource.name || null,
      ticker: benchmarkSource.ticker,
      isProxy: benchmarkSource.isProxy,
      currency: benchmarkDaily?.currency || null,
      benchmarkAsOfDate: benchmarkDaily?.asOfDate || null,
      benchmarkPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      trendPrice: Number.isFinite(trendPrice) ? trendPrice : null,
      trendTicker: useSheetNikkeiTrend ? "Nikkei 225 (Google Sheets)"
        : useSheetEwjTrend ? "NYSEARCA:EWJ (Google Sheets)"
        : useSheetIvvTrend ? "NYSEARCA:IVV (Google Sheets)" : benchmarkSource.ticker,
      allTimeHigh: Number.isFinite(allTimeHigh) && allTimeHigh > 0 ? allTimeHigh : null,
      drawdownPercent: !benchmarkSource.isProxy && Number.isFinite(currentPrice) && Number.isFinite(allTimeHigh) && allTimeHigh > 0
        ? Math.max(0, ((allTimeHigh - currentPrice) / allTimeHigh) * 100) : null,
      sma50,
      sma200,
      vix: Number.isFinite(vixValue) ? vixValue : null,
      vixAsOfDate: hasSheetVix || fundId === "scbnk225" ? null : vixHistory?.asOfDate || null,
      vixSource: hasSheetVix ? "Google Sheets INDEXCBOE:VIX"
        : fundId === "scbnk225" ? "ไม่ใช้ VIX สหรัฐฯ สำหรับ SCBNK225" : "Yahoo Finance ^VIX",
      sheetAsOfDate: sheetMetrics?.date || null,
      sheetSource: sheetMetrics && (sheetMetrics.vix || useSheetTrend) ? "Google Sheets" : null,
      valuationPe: null,
      epsGrowthPercent: null,
      macroScore: null
    },
    errors: [...errors, ...marketErrors]
  });
}

async function getNav(response, fundId) {
  const fund = navFunds[fundId];
  if (!fund) {
    sendJson(response, 400, { error: "ไม่รองรับกองทุนที่เลือก" });
    return;
  }

  const subscriptionKey = readSubscriptionKey();
  if (!subscriptionKey) {
    sendJson(response, 503, { error: "ไม่พบ API key ใน .env.local" });
    return;
  }

  let queryDate = startNavDate();
  let records = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const historyStart = new Date(`${queryDate}T00:00:00.000Z`);
    historyStart.setUTCDate(historyStart.getUTCDate() - 30);
    const url = new URL(apiUrl);
    url.search = new URLSearchParams({
      proj_id: fund.projId,
      start_nav_date: historyStart.toISOString().slice(0, 10),
      end_nav_date: queryDate,
      page_size: "100",
      fund_class_name: fund.fundClassName
    }).toString();

    let upstream;
    try {
      upstream = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Ocp-Apim-Subscription-Key": subscriptionKey
        },
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      const status = error.name === "TimeoutError" ? 504 : 502;
      sendJson(response, status, { error: status === 504 ? "SEC API ใช้เวลาตอบกลับนานเกินไป" : "เชื่อมต่อ SEC API ไม่สำเร็จ" });
      return;
    }

    if (upstream.status === 204) {
      queryDate = previousWeekday(queryDate);
      continue;
    }
    if (!upstream.ok) {
      sendJson(response, 502, { error: `SEC API ตอบกลับสถานะ ${upstream.status}` });
      return;
    }

    let payload;
    try {
      payload = await upstream.json();
    } catch {
      sendJson(response, 502, { error: "SEC API ส่งข้อมูลที่อ่านไม่ได้" });
      return;
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    records = items
      .filter((item) => item.proj_id === fund.projId && item.fund_class_name === fund.fundClassName)
      .filter((item) => Number.isFinite(Number(item.last_val)) && Number(item.last_val) > 0)
      .sort((left, right) => String(right.nav_date).localeCompare(String(left.nav_date)));
    if (records.length) break;
    queryDate = previousWeekday(queryDate);
  }

  const [record, previousRecord] = records;
  const nav = Number(record?.last_val);

  if (!record || !Number.isFinite(nav) || nav <= 0) {
    sendJson(response, 404, { error: `ไม่พบ NAV ของ ${fund.fundClassName} ในวันที่มีข้อมูลล่าสุด` });
    return;
  }

  sendJson(response, 200, {
    fundId,
    nav,
    navDate: record.nav_date,
    previousNav: previousRecord ? Number(previousRecord.last_val) : null,
    previousNavDate: previousRecord?.nav_date || null,
    history: records.slice().reverse().map((item) => ({
      nav: Number(item.last_val),
      navDate: item.nav_date
    })),
    lastUpdated: record.last_upd_date,
    fundClassName: record.fund_class_name
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/google-sheets") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await getGoogleSheetData(response);
    return;
  }
  if (url.pathname === "/api/nav") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await getNav(response, url.searchParams.get("fund") || "scbnk225");
    return;
  }
  if (url.pathname === "/api/fund-analysis") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await getFundAnalysis(response, url.searchParams.get("fund") || "scbnk225");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const file = staticFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  fs.readFile(path.join(root, file[0]), (error, contents) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to read app file");
      return;
    }
    response.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-cache" });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});

server.listen(port, host, () => {
  console.log(`SCBNK225 calculator running at http://localhost:${port}`);
});