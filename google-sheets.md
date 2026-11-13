# Google Sheets data endpoint

The app reads a configured range through its Node server at `GET /api/google-sheets`. It refreshes the Google OAuth access token on the server, so OAuth credentials are never sent to the browser. The endpoint returns the Google Sheets row values as JSON:

```json
{
  "range": "FundData!A1:C10",
  "values": [["fund", "nav", "date"], ["scbnk225", "12.34", "2026-11-10"]]
}
```

Set these variables in the local `.env.local` file or in Render's environment settings:

```dotenv
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REFRESH_TOKEN=your-google-oauth-refresh-token
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SHEETS_RANGE=SCBS&P500A_Metrics!A7:K
GOOGLE_SHEETS_RANGE_SCBNK225=SCBNK225_Metrics!A7:K
```

The server also accepts `CLIENT_ID`, `CLIENT_SECRET`, and `REFRESH_TOKEN` as aliases for the OAuth values, matching the supplied MCP config. Use the `GOOGLE_` names in Render to avoid collisions. The spreadsheet ID is the part between `/d/` and `/edit` in its URL. The range must be a fixed A1 range or tab range; it cannot be supplied by the request.

`GOOGLE_SHEETS_RANGE` is used for `SCBS&P500A`; `GOOGLE_SHEETS_RANGE_SCBNK225` is used for `SCBNK225`. Set each range to start at the header row. The S&P tab uses `Date`, `IVV Price (USD)`, `IVV 50D SMA`, and `IVV 200D SMA` in columns A-D. The SCBNK225 tab accepts `Date`, `Nikkei 225 Price (JPY)`, `Nikkei 225 50D SMA`, and `Nikkei 225 200D SMA`, or the shorter headers `Price (JPY)`, `50D SMA`, and `200D SMA`. The S&P tab may provide VIX with a `VIX Index` header; if absent, its VIX comes from Yahoo Finance. SCBNK225 does not use U.S. VIX: since its sheet has no VIX measure, that score remains unavailable until a Japan-appropriate measure is configured. The 50D and 200D headers also accept `50-day SMA` and `200-day SMA`. Keep adding the newest daily data as the last row. Currency-formatted cells such as `$756.05` are supported.

`SCBS&P500A` uses the IVV price and SMA columns for its trend score, while `SCBNK225` uses the Nikkei 225 price and SMA columns. Each sheet is used only when all three trend values contain numbers; otherwise the app falls back to Yahoo Finance. The sheet source and date appear in the analysis status. SEC remains the fund NAV source, and Yahoo Finance remains the source for benchmark history and drawdown.

The refresh token must be authorized for the `https://www.googleapis.com/auth/spreadsheets.readonly` scope, and the Google account that authorized it must have access to the spreadsheet. A token issued only for a Google Drive MCP server may need to be re-authorized with the Sheets scope.

Run locally with `node server.js`, then request `http://localhost:3000/api/google-sheets`. Render serves the same endpoint at the deployed app's `/api/google-sheets` path. The MCP server config itself is for an MCP client and is not launched or consumed by Render; this app uses the Google Sheets API directly.

This endpoint is publicly readable wherever the app is publicly reachable. Configure only a range that is safe to disclose, or add application authentication before exposing private sheet data.