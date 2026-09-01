// Netlify serverless function — SimpleFIN proxy
// Handles CORS and keeps the SimpleFIN access URL server-side

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { action, setupToken, accessUrl, startDate, endDate } = body;

  // ── ACTION: claim — exchange setup token for access URL ───────────────────
  if (action === "claim") {
    if (!setupToken) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing setupToken" }) };
    try {
      // Base64-decode the setup token to get the claim URL
      const claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf8");
      if (!claimUrl.startsWith("http")) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid setup token — make sure you copied the full token from SimpleFIN" }) };
      }
      const resp = await fetch(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
      if (!resp.ok) {
        const txt = await resp.text();
        return { statusCode: 400, headers, body: JSON.stringify({ error: `SimpleFIN error: ${txt}` }) };
      }
      const url = await resp.text();
      return { statusCode: 200, headers, body: JSON.stringify({ accessUrl: url.trim() }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Claim failed: ${e.message}` }) };
    }
  }

  // ── ACTION: fetch — pull accounts + transactions ──────────────────────────
  if (action === "fetch") {
    if (!accessUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing accessUrl" }) };
    try {
      // Parse access URL — format: https://user:pass@host/path
      const url = new URL(accessUrl);
      const username = url.username;
      const password = url.password;
      url.username = "";
      url.password = "";
      const baseUrl = url.toString().replace(/\/$/, "");

      // Build query params
      const params = new URLSearchParams({ version: "2" });
      if (startDate) params.append("start-date", String(Math.floor(new Date(startDate).getTime() / 1000)));
      if (endDate)   params.append("end-date",   String(Math.floor(new Date(endDate).getTime()   / 1000)));

      const resp = await fetch(`${baseUrl}/accounts?${params}`, {
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
        },
      });

      if (!resp.ok) {
        const txt = await resp.text();
        return { statusCode: resp.status, headers, body: JSON.stringify({ error: `SimpleFIN fetch error: ${txt}` }) };
      }

      const data = await resp.json();

      // Surface any SimpleFIN errors to the user
      if (data.errors?.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ warnings: data.errors, accounts: data.accounts || [] }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ accounts: data.accounts || [] }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Fetch failed: ${e.message}` }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
};
