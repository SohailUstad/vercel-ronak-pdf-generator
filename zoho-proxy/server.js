"use strict";

const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const ZOHO_CLIENT_ID = "1000.BIH23SCUJL3CAQY9A5NT4QZDI3P3CA";
const ZOHO_CLIENT_SECRET = "e18c4ea7a8f8c62952fad03a3959f5446975f4e58f";
const ZOHO_REFRESH_TOKEN = "1000.e48f7f516e7df71fd5863dff819de9c0.689b5d7fbfff8581e10f5ba7cc31ec46";
const ZOHO_ORGANIZATION_ID = "60073145369";
const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.in";
const ZOHO_API_DOMAIN = "https://www.zohoapis.in";
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "https://ronak-admin-pwa-20260516-ustad.web.app",
]);

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ronak-admin-pwa-20260516-ustad.web.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function sendJson(response, statusCode, body, origin) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
  });
  response.end(JSON.stringify(body));
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toIstDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function normalizeLineItems(items) {
  return (items || [])
    .map((item) => ({
      name: String(item.name || "Product").trim() || "Product",
      description: item.productId ? `Product ID: ${item.productId}` : "",
      rate: safeNumber(item.rate),
      quantity: safeNumber(item.quantity),
    }))
    .filter((item) => item.quantity > 0 && item.rate >= 0);
}

async function readJsonBody(request) {
  let raw = "";

  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      throw new Error("Request body is too large.");
    }
  }

  return raw ? JSON.parse(raw) : {};
}

async function readZohoResponse(response, context) {
  const text = await response.text();
  let body = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${context} returned a non-JSON response.`);
    }
  }

  if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
    throw new Error(body.message || body.error || `${context} failed.`);
  }

  return body;
}

async function refreshAccessToken() {
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const body = await readZohoResponse(response, "Zoho token refresh");
  if (!body.access_token) {
    throw new Error("Zoho did not return an access token.");
  }

  return body.access_token;
}

async function zohoRequest(accessToken, path, options = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${ZOHO_API_DOMAIN}${path}${separator}organization_id=${encodeURIComponent(ZOHO_ORGANIZATION_ID)}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return readZohoResponse(response, `Zoho ${options.method || "GET"} ${path}`);
}

function makeContactPayload(order, customer = {}) {
  const name = String(order.customerName || customer.name || order.customerEmail || "Customer").trim();
  const email = String(order.customerEmail || customer.email || "").trim();
  const phone = String(customer.phone || order.customerPhone || "").trim();

  const payload = {
    contact_name: name,
    company_name: name,
    contact_type: "customer",
    billing_address: {
      attention: name,
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      country: customer.country || "India",
      phone,
    },
  };

  if (email) payload.email = email;
  if (phone) {
    payload.phone = phone;
    payload.mobile = phone;
  }

  return payload;
}

function makeInvoicePayload(order, contactId) {
  return {
    customer_id: contactId,
    date: toIstDate(),
    reference_number: order.id,
    line_items: normalizeLineItems(order.items),
    notes: "Thanks for your business.",
  };
}

async function createZohoInvoiceForOrder({ order, customer }) {
  if (!order || !order.id) {
    throw new Error("Order id is required.");
  }

  const accessToken = await refreshAccessToken();
  let contactId = customer?.zohoContactId || customer?.zoho?.contactId || "";
  let createdContact = null;

  if (!contactId) {
    const contactBody = await zohoRequest(accessToken, "/books/v3/contacts", {
      method: "POST",
      body: JSON.stringify(makeContactPayload(order, customer)),
    });
    contactId = contactBody.contact?.contact_id || "";
    createdContact = contactBody.contact || null;
  }

  if (!contactId) {
    throw new Error("Zoho did not return a contact id.");
  }

  const invoicePayload = makeInvoicePayload(order, contactId);
  if (!invoicePayload.line_items.length) {
    throw new Error("Order has no billable line items.");
  }

  const invoiceBody = await zohoRequest(accessToken, "/books/v3/invoices", {
    method: "POST",
    body: JSON.stringify(invoicePayload),
  });

  const invoice = invoiceBody.invoice || {};
  if (!invoice.invoice_id) {
    throw new Error("Zoho did not return an invoice id.");
  }

  return {
    contactId,
    createdContact,
    invoice,
  };
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true }, origin);
    return;
  }

  if (request.method !== "POST" || request.url !== "/zoho/invoice") {
    sendJson(response, 404, { error: "Not found" }, origin);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const result = await createZohoInvoiceForOrder(body);
    sendJson(response, 200, result, origin);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unable to create Zoho invoice." }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`Ronak Zoho proxy running at http://localhost:${PORT}`);
});
