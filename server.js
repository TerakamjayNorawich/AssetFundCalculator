"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const apiUrl = "https://api.sec.or.th/v2/fund/daily-info/nav";
const apiNames = new Set(["SEC_API_SUBSCRIPTION_KEY", "OCP_APIM_SUBSCRIPTION_KEY"]);
const navFunds = {
  "scbnk225": { projId: "M0429_2556", fundClassName: "SCBNK225" },
  "kjpx-aa": { projId: "M0074_2558", fundClassName: "K-JPX-A(A)" },
  "scbsp500a": { projId: "M0643_2555", fundClassName: "SCBS&P500A" },
  "scbrmdigi-a": { projId: "M0457_2565", fundClassName: "SCBRMDIGI(A)" }
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
  let record;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const url = new URL(apiUrl);
    url.search = new URLSearchParams({
      proj_id: fund.projId,
      start_nav_date: queryDate,
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
    record = items
      .filter((item) => item.proj_id === fund.projId && item.fund_class_name === fund.fundClassName)
      .sort((left, right) => String(right.nav_date).localeCompare(String(left.nav_date)))[0];
    if (record) break;
    queryDate = previousWeekday(queryDate);
  }

  const nav = Number(record?.last_val);

  if (!record || !Number.isFinite(nav) || nav <= 0) {
    sendJson(response, 404, { error: `ไม่พบ NAV ของ ${fund.fundClassName} ในวันที่มีข้อมูลล่าสุด` });
    return;
  }

  sendJson(response, 200, {
    fundId,
    nav,
    navDate: record.nav_date,
    lastUpdated: record.last_upd_date,
    fundClassName: record.fund_class_name
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/nav") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await getNav(response, url.searchParams.get("fund") || "scbnk225");
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