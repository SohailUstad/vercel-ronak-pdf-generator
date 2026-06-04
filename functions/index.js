"use strict";

const admin = require("firebase-admin");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

admin.initializeApp();

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

const ZOHO_CLIENT_ID = defineSecret("ZOHO_CLIENT_ID");
const ZOHO_CLIENT_SECRET = defineSecret("ZOHO_CLIENT_SECRET");
const ZOHO_REFRESH_TOKEN = defineSecret("ZOHO_REFRESH_TOKEN");
const ZOHO_ORGANIZATION_ID = defineSecret("ZOHO_ORGANIZATION_ID");
const ZOHO_ACCOUNTS_URL = defineSecret("ZOHO_ACCOUNTS_URL");
const ZOHO_API_DOMAIN = defineSecret("ZOHO_API_DOMAIN");

function secretValue(secret, fallback = "") {
  const value = secret.value();
  return value ? value.trim() : fallback;
}

function getZohoConfig() {
  return {
    clientId: secretValue(ZOHO_CLIENT_ID),
    clientSecret: secretValue(ZOHO_CLIENT_SECRET),
    refreshToken: secretValue(ZOHO_REFRESH_TOKEN),
    organizationId: secretValue(ZOHO_ORGANIZATION_ID, "60073145369"),
    accountsUrl: secretValue(ZOHO_ACCOUNTS_URL, "https://accounts.zoho.in"),
    apiDomain: secretValue(ZOHO_API_DOMAIN, "https://www.zohoapis.in"),
  };
}

function requireConfig(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing Zoho configuration: ${missing.join(", ")}`);
  }
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

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function orderHasInvoice(order) {
  return Boolean(order && order.zoho && order.zoho.invoiceId);
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

async function readJsonResponse(response, context) {
  const text = await response.text();
  let body = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error(`${context} returned non-JSON response: ${text.slice(0, 300)}`);
    }
  }

  if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
    const message = body.message || body.error || response.statusText || "Unknown Zoho error";
    throw new Error(`${context} failed: ${message}`);
  }

  return body;
}

async function refreshZohoAccessToken(config) {
  const params = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(`${config.accountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const body = await readJsonResponse(response, "Zoho token refresh");
  if (!body.access_token) {
    throw new Error("Zoho token refresh did not return an access token.");
  }

  return body.access_token;
}

async function zohoRequest(config, accessToken, path, options = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${config.apiDomain}${path}${separator}organization_id=${encodeURIComponent(config.organizationId)}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return readJsonResponse(response, `Zoho ${options.method || "GET"} ${path}`);
}

function contactPayload(order, customer) {
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

async function getOrCreateZohoContact(config, accessToken, order, customerRef) {
  const customerSnapshot = await customerRef.get();
  const customer = customerSnapshot.exists ? customerSnapshot.data() : {};
  const existingContactId = customer.zohoContactId || customer.zoho?.contactId;

  if (existingContactId) {
    return existingContactId;
  }

  const body = await zohoRequest(config, accessToken, "/books/v3/contacts", {
    method: "POST",
    body: JSON.stringify(contactPayload(order, customer)),
  });

  const contactId = body.contact && body.contact.contact_id;
  if (!contactId) {
    throw new Error("Zoho contact creation did not return contact_id.");
  }

  await customerRef.set(
    {
      zohoContactId: contactId,
      zoho: {
        contactId,
        contactCreatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return contactId;
}

function invoicePayload(order, orderId, customerId) {
  return {
    customer_id: customerId,
    date: toIstDate(),
    reference_number: orderId,
    line_items: normalizeLineItems(order.items),
    notes: "Thanks for your business.",
  };
}

async function createZohoInvoice(config, accessToken, order, orderId, customerId) {
  const payload = invoicePayload(order, orderId, customerId);

  if (!payload.line_items.length) {
    throw new Error("Order has no billable line items.");
  }

  const body = await zohoRequest(config, accessToken, "/books/v3/invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const invoice = body.invoice || {};
  if (!invoice.invoice_id) {
    throw new Error("Zoho invoice creation did not return invoice_id.");
  }

  return invoice;
}

async function markOrderInvoiceCreated(orderRef, invoice) {
  await orderRef.set(
    {
      zoho: {
        status: "created",
        invoiceId: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number || "",
        invoiceUrl: invoice.invoice_url || "",
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function markOrderInvoiceFailed(orderRef, error) {
  await orderRef.set(
    {
      zoho: {
        status: "failed",
        errorMessage: error.message || "Unable to create Zoho invoice.",
        lastAttemptAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

exports.onOrderCreated = onDocumentCreated(
  {
    document: "orders/{orderId}",
    region: "asia-south1",
    secrets: [
      ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET,
      ZOHO_REFRESH_TOKEN,
      ZOHO_ORGANIZATION_ID,
      ZOHO_ACCOUNTS_URL,
      ZOHO_API_DOMAIN,
    ],
  },
  async (event) => {
    const orderId = event.params.orderId;
    const orderRef = event.data.ref;
    const order = event.data.data();

    if (!order || orderHasInvoice(order)) {
      logger.info("Skipping order invoice creation; order missing or already linked.", { orderId });
      return;
    }

    if (order.source === "admin_app" || order.status !== "pending") {
      logger.info("Skipping order invoice creation; order is not an invoiceable customer order.", {
        orderId,
        source: order.source || "",
        status: order.status || "",
      });
      return;
    }

    if (!order.customerId || !(order.items || []).length) {
      await markOrderInvoiceFailed(orderRef, new Error("Order requires customerId and at least one item."));
      return;
    }

    try {
      const config = getZohoConfig();
      requireConfig(config);

      const accessToken = await refreshZohoAccessToken(config);
      const customerRef = db.collection("customers").doc(order.customerId);
      const contactId = await getOrCreateZohoContact(config, accessToken, order, customerRef);
      const invoice = await createZohoInvoice(config, accessToken, order, orderId, contactId);

      await markOrderInvoiceCreated(orderRef, invoice);
      logger.info("Created Zoho invoice for order.", {
        orderId,
        invoiceId: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number,
      });
    } catch (error) {
      logger.error("Failed to create Zoho invoice for order.", {
        orderId,
        errorMessage: error.message || "",
        errorName: error.name || "",
        errorStack: error.stack || "",
      });
      await markOrderInvoiceFailed(orderRef, error);
    }
  },
);
