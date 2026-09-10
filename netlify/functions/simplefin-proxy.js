exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const { action, setupToken, accessUrl, startDate } = body;
  if (action === "claim") {
    try {
      const claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf8").trim();
      if (!claimUrl.startsWith("https://")) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid token" }) };
      const resp = await fetch(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
      if (!resp.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: await resp.text() }) };
      return { statusCode: 200, headers, body: JSON.stringify({ accessUrl: (await resp.text()).trim() }) };
    } catch(e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
  }
  if (action === "fetch") {
    try {
      const url = new URL(accessUrl.trim());
      const username = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      url.username = ""; url.password = "";
      const base = url.toString().replace(/\/$/, "");
      const params = new URLSearchParams({ version: "2" });
      const start = startDate ? Math.floor(new Date(startDate).getTime()/1000) : Math.floor((Date.now()-90*24*60*60*1000)/1000);
      params.append("start-date", String(start));
      const resp = await fetch(`${base}/accounts?${params}`, { headers: { "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64") } });
      if (!resp.ok) return { statusCode: resp.status, headers, body: JSON.stringify({ error: await resp.text() }) };
      const data = await resp.json();
      return { statusCode: 200, headers, body: JSON.stringify({ accounts: data.accounts || [], errors: data.errors || [] }) };
    } catch(e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
  }
  return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
};
