# Order Pagination And Filtering Plan

## Goal

Make the admin Orders screen work efficiently with large order volumes, including 100,000+ orders, without loading every order into the browser.

Current behavior subscribes to all `orders` and filters in memory. That is simple, but it will become slow and expensive at scale.

## Target Approach

Use Firestore server-side queries with cursor pagination. Filters should be applied in Firestore wherever possible, and the UI should only load one page of orders at a time.

## Data Model Changes

Add denormalized report/filter fields onto each order document.

Recommended order fields:

```js
{
  customerId,
  customerName,
  customerNameLower,
  customerEmail,
  customerPhone,
  salesPersonId,
  salesPersonName,
  referralCode,
  status,
  total,
  createdAt,
  updatedAt,
  searchTokens
}
```

Notes:

- `salesPersonId`, `salesPersonName`, and `referralCode` are snapshots copied from the customer at order creation time.
- Sales person still belongs to the customer/client. The order snapshot exists only to make reports and filtering fast.
- `customerNameLower` supports simple normalized matching.
- `customerPhone` supports exact phone lookup.
- `searchTokens` can support basic token search with `array-contains`.

## New Order Creation Changes

Update customer order creation in:

- `customer/src/services/firestoreService.js`

When creating an order:

1. Read sales-person values from `customer`.
2. Store them onto the order:
   - `salesPersonId`
   - `salesPersonName`
   - `referralCode`
3. Store customer filter fields:
   - `customerNameLower`
   - `customerPhone`
4. Store basic search tokens if wanted.

Update admin manual order creation/editing in:

- `admin/src/pages/OrderFormPage.js`

When an admin creates or edits an order:

1. If `customerId` is selected, look up that customer from already loaded `customers`.
2. Copy customer phone and sales-person snapshot onto the order payload.
3. Recompute denormalized fields when customer/product/order fields change.

## Admin Orders Querying

Replace the full collection subscription in:

- `admin/src/pages/OrdersPage.js`

Current:

```js
subscribeToCollection('orders', setOrders, { orderBy: ['createdAt', 'desc'] })
```

Target:

- Query only one page at a time.
- Use `limit(pageSize)`.
- Use `startAfter(lastVisibleDoc)` for next page.
- Keep a stack of cursors for previous page support.
- Do not use a realtime listener for all orders. Prefer `getDocs` page loads.

Suggested helper functions in:

- `admin/src/services/firestoreService.js`

Add something like:

```js
fetchOrdersPage({
  pageSize,
  cursor,
  filters
})
```

Return:

```js
{
  orders,
  firstDoc,
  lastDoc,
  hasNextPage
}
```

## Filter Strategy

Supported server-side filters:

- Date range:
  - `where('createdAt', '>=', startDate)`
  - `where('createdAt', '<=', endDate)`
- Sales person:
  - `where('salesPersonId', '==', selectedSalesPersonId)`
- Status:
  - `where('status', '==', selectedStatus)`
- Exact/min/max total:
  - `where('total', '==', exactTotal)`
  - `where('total', '>=', minTotal)`
  - `where('total', '<=', maxTotal)`
- Customer phone exact search:
  - `where('customerPhone', '==', normalizedPhone)`
- Token search:
  - `where('searchTokens', 'array-contains', token)`

Important:

- Firestore has limitations around multiple inequality filters and ordering.
- Each supported combination may need a composite index.
- Keep the first implementation conservative: date range, sales person, status, and phone lookup are the best high-value filters.

## Search Strategy

Firestore is not a full-text search engine.

Recommended stages:

1. Short term:
   - Phone exact search.
   - Customer name token search using `searchTokens`.
   - Product token search using `searchTokens`.
2. Later:
   - Add Algolia, Meilisearch, Typesense, or another search service if rich search is needed.

Suggested `searchTokens`:

```js
[
  customerName words,
  customerPhone,
  product names words,
  referralCode
]
```

Normalize tokens:

- lowercase
- trim
- remove empty values
- optionally keep phone digits only

## Pagination UI

In `admin/src/pages/OrdersPage.js`, add:

- Page size select: `25`, `50`, `100`
- Previous button
- Next button
- Current page number
- Loading state while fetching page

Behavior:

- Changing filters resets to page `1`.
- Changing page size resets to page `1`.
- Next uses `startAfter(lastDoc)`.
- Previous uses stored cursor stack.

## Existing Orders

Existing orders do not have denormalized fields. There are three options:

1. Minimal:
   - New orders get denormalized fields.
   - Old orders may not appear in sales-person/search filters until edited/backfilled.
2. Better:
   - Add a one-time backfill script.
3. Best:
   - Backfill all existing orders before enabling server-side-only filters.

Recommended: do option 2.

## Backfill Plan

Create a script outside the frontend apps, for example:

- `scripts/backfill-order-search-fields.js`

The script should:

1. Read all customers.
2. Build a map by customer id.
3. Page through all orders.
4. For each order:
   - Find its customer.
   - Add:
     - `customerNameLower`
     - `customerPhone`
     - `salesPersonId`
     - `salesPersonName`
     - `referralCode`
     - `searchTokens`
5. Write updates in Firestore batches.

Use Firebase Admin SDK for the script, not client SDK.

Important:

- Test on a small subset first.
- Keep batch size below Firestore limits, for example 400 writes per batch.
- Make the script idempotent.

## Firestore Indexes

Likely indexes needed:

- `orders`: `salesPersonId ASC`, `createdAt DESC`
- `orders`: `status ASC`, `createdAt DESC`
- `orders`: `createdAt DESC`
- `orders`: `customerPhone ASC`, `createdAt DESC`
- `orders`: `searchTokens ARRAY_CONTAINS`, `createdAt DESC`

Exact indexes depend on the final query combinations.

Firestore will also provide direct index creation links in console errors during development.

## Implementation Phases

### Phase 1: Denormalize New Orders

Files:

- `customer/src/services/firestoreService.js`
- `admin/src/pages/OrderFormPage.js`

Add customer/sales/search snapshot fields to new and edited orders.

### Phase 2: Build Fetch Page API

Files:

- `admin/src/services/firestoreService.js`

Add Firestore `getDocs`, `limit`, `startAfter`, and query builder helpers.

### Phase 3: Replace Orders Screen Data Loading

Files:

- `admin/src/pages/OrdersPage.js`

Replace all-orders subscription with paged Firestore queries.

### Phase 4: Add Pagination UI

Files:

- `admin/src/pages/OrdersPage.js`

Add page size and previous/next controls.

### Phase 5: Backfill Existing Orders

Files:

- `scripts/backfill-order-search-fields.js`
- possibly a service account or documented local setup

Run once after testing.

### Phase 6: Add/Deploy Indexes

Files:

- `admin/firestore.indexes.json`

Add stable composite indexes after final query choices are known.

## Acceptance Criteria

- Admin Orders page does not load all orders.
- Initial order load reads only one page.
- Next/previous pagination works.
- Date range filter works server-side.
- Sales-person filter works server-side.
- Search has a defined limited behavior, such as phone exact or token search.
- New orders contain denormalized filter fields.
- Old orders are handled by a migration/backfill or explicitly documented as legacy.
- Builds pass for both apps.

## Deployment Notes

After implementation:

```bash
cd admin
npm run build
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only hosting
```

```bash
cd customer
npm run build
firebase deploy --only hosting
```
