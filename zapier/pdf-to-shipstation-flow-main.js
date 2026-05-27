const data = inputData || {};
const SHIPSTATION_TAG_IDS = {
  createdByZapier: 123078,
  printSalesOrder: 123079,
};
const pdfUrl = getInputValue(['pdf_url']);

const reviewReasons = [];
const parsedOrder = getParsedOrder();
const normalizedItemsResult = normalizeItems(parsedOrder && parsedOrder.items);
const carrierCode = getCarrierCode(parsedOrder && parsedOrder.carrierCode);
const routing = resolveRouting(parsedOrder);
const shipstationOrder = canCreateOrder(parsedOrder, normalizedItemsResult.items)
  ? normalizeOrder(parsedOrder, routing, normalizedItemsResult.items, carrierCode)
  : null;

if (!parsedOrder) reviewReasons.push('Missing order inputs.');
if (parsedOrder && !cleanString(parsedOrder.orderNumber)) reviewReasons.push('Missing order number.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.name)) reviewReasons.push('Missing ship-to name.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.street1)) reviewReasons.push('Missing ship-to street1.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.city)) reviewReasons.push('Missing ship-to city.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.state)) reviewReasons.push('Missing ship-to state.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.postalCode)) reviewReasons.push('Missing ship-to postal code.');
if (parsedOrder && (!Array.isArray(parsedOrder.items) || !parsedOrder.items.length)) reviewReasons.push('Missing line items.');
if (parsedOrder && cleanString(parsedOrder.carrierCode) && !carrierCode) reviewReasons.push('Unrecognized carrierCode: ' + cleanString(parsedOrder.carrierCode) + '.');
if (normalizedItemsResult.issues.length) reviewReasons.push.apply(reviewReasons, normalizedItemsResult.issues);

output = [{
  shipstationCreateOrderApiCallBody: JSON.stringify(shipstationOrder || {}),
  orderNumber: shipstationOrder ? shipstationOrder.orderNumber : '',
  storeId: routing ? routing.storeId : '',
  requiresManualReview: reviewReasons.length > 0,
  manualReviewReasons: reviewReasons.join(' | '),
}];

function getParsedOrder() {

  const order = {
    orderNumber: getInputValue(['orderNumber', 'Order Number']),
    orderDate: getInputValue(['orderDate', 'Order Date']),
    customerUsername: getInputValue(['customerUsername', 'Customer Username']),
    customerEmail: getInputValue(['customerEmail', 'Customer Email']),
    customerNotes: getInputValue(['customerNotes', 'Customer Notes']),
    carrierCode: getInputValue(['carrierCode', 'Carrier Code']),
    shipDate: getInputValue(['shipDate', 'Ship Date']),
    sourceCompany: getInputValue(['sourceCompany', 'Source Company', 'storeName', 'Store Name']),
    billTo: parseJson(getInputValue(['billTo', 'Bill To'])) || {},
    shipTo: parseJson(getInputValue(['shipTo', 'Ship To'])) || {},
    items: parseJson(getInputValue(['items', 'Items'])) || [],
    amountPaid: getInputValue(['amountPaid', 'Amount Paid']),
    taxAmount: getInputValue(['taxAmount', 'Tax Amount']),
    shippingAmount: getInputValue(['shippingAmount', 'Shipping Amount']),
    orderTotal: getInputValue(['orderTotal', 'Order Total']),
    poNumber: getInputValue(['poNumber', 'PO Number']),
    advancedOptions: parseJson(getInputValue(['advancedOptions', 'Advanced Options'])) || {},
  };

  return hasAnyOrderData(order) ? order : null;
}

function hasAnyOrderData(order) {
  return Boolean(
    order.orderNumber &&
    order.orderDate &&
    order.sourceCompany &&
    order.shipTo?.name &&
    order.items?.length
  );
}

function canCreateOrder(order, normalizedItems) {
  if (!order) return false;

  return Boolean(
    cleanString(order.orderNumber) &&
    cleanString(order.shipTo && order.shipTo.name) &&
    cleanString(order.shipTo && order.shipTo.street1) &&
    cleanString(order.shipTo && order.shipTo.city) &&
    cleanString(order.shipTo && order.shipTo.state) &&
    cleanString(order.shipTo && order.shipTo.postalCode) &&
    Array.isArray(normalizedItems) &&
    normalizedItems.length
  );
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    const jsonText = String(value).match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonText) return null;

    try {
      return JSON.parse(jsonText[0]);
    } catch (innerError) {
      return null;
    }
  }
}

function normalizeOrder(order, routing, normalizedItems, carrierCode) {
  if (!order) return null;
  const sourceCompany = cleanString(order.sourceCompany);
  const normalizedOrder = {
    orderNumber: cleanString(order.orderNumber),
    orderKey: buildOrderKey(routing, order),
    orderDate: checkDateFormat(order.orderDate),
    orderStatus: 'on_hold',
    customerUsername: cleanString(order.customerUsername),
    customerEmail: cleanString(order.customerEmail),
    customerNotes: pdfUrl || cleanString(order.customerNotes),
    internalNotes: "DEV TEST - DO NOT SHIP",
    carrierCode: getInputValue(['carrierCode', 'Carrier Code']),
    shipDate: checkDateFormat(order.shipDate),
    billTo: normalizeAddress(order.billTo),
    shipTo: normalizeAddress(order.shipTo),
    items: normalizedItems,
    amountPaid: toNumber(order.amountPaid),
    taxAmount: toNumber(order.taxAmount),
    shippingAmount: toNumber(order.shippingAmount),
    orderTotal: toNumber(order.orderTotal),
    poNumber: cleanString(order.poNumber),
    tagIds: routing && Array.isArray(routing.tagIds) ? routing.tagIds : [],
    advancedOptions: {
      storeId: routing ? routing.storeId : null,
      source: sourceCompany,
    },
  };

  if (carrierCode) normalizedOrder.carrierCode = carrierCode;

  return normalizedOrder;
}

function buildOrderKey(routing, order) {
  const storeId = routing && routing.storeId;
  const orderNumber = cleanString(order && order.orderNumber);

  if (!storeId || !orderNumber) return '';

  return String(storeId) + '-' + orderNumber;
}

function resolveRouting(order) {
  const sourceCompany = cleanString(order && order.sourceCompany);
  const normalizedSourceCompany = normalizeForMatch(sourceCompany);
  const routes = [
    {
      sourceCompanies: ['New Enterprises'],
      storeName: 'New Enterprises Co',
      storeId: 515242,
      tagIds: [SHIPSTATION_TAG_IDS.createdByZapier],
    },
    {
      sourceCompanies: ['Kola Goodies'],
      storeName: 'Kola Goodies Manual',
      storeId:490139,
      tagIds: [
        SHIPSTATION_TAG_IDS.createdByZapier,
        SHIPSTATION_TAG_IDS.printSalesOrder,
      ],
    },
    {
      sourceCompanies: ['Mobi USA LLC', 'Mobi USA', 'Mobi'],
      storeName: 'Mobi USA Quickbooks',
      storeId:511893,
      tagIds: [SHIPSTATION_TAG_IDS.createdByZapier],
    },
    {
      sourceCompanies: ['munchrooms', 'Munchrooms'],
      storeName: 'Munchrooms Manual',
      storeId:473886,
      tagIds: [
        SHIPSTATION_TAG_IDS.createdByZapier,
        SHIPSTATION_TAG_IDS.printSalesOrder,
      ],
    },
  ];

  const defaultStore = {
    storeName: 'Golden Gate Fulfillment',
    storeId: 452106,
    tagIds: [SHIPSTATION_TAG_IDS.createdByZapier],
  };

  for (const route of routes) {
    if (matchesSourceCompany(route.sourceCompanies, normalizedSourceCompany)) {
      return buildRoutingResult(route, 'sourceCompany');
    }
  }

  return defaultStore;
}

function buildRoutingResult(route, matchedBy) {
  const sourceCompanies = Array.isArray(route.sourceCompanies)
    ? route.sourceCompanies.filter(Boolean)
    : [];

  return {
    sourceCompany: sourceCompanies[0] || '',
    sourceCompanies,
    matchedBy,
    storeName: route.storeName,
    storeId: route.storeId,
    tagIds: Array.isArray(route.tagIds)
      ? route.tagIds.filter((tagId) => Number.isInteger(tagId))
      : [],
  };
}

function matchesSourceCompany(sourceCompanies, normalizedSourceCompany) {
  if (!normalizedSourceCompany || !Array.isArray(sourceCompanies)) return false;

  return sourceCompanies.some(
    (sourceCompany) => normalizeForMatch(sourceCompany) === normalizedSourceCompany
  );
}

function normalizeAddress(address) {
  address ??= {};

  return {
    name: cleanString(address.name),
    company: cleanString(address.company),
    street1: cleanString(address.street1),
    street2: cleanString(address.street2),
    city: cleanString(address.city),
    state: cleanString(address.state),
    postalCode: cleanString(address.postalCode),
    country: cleanString(address.country),
    phone: cleanString(address.phone),
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return {
      items: [],
      issues: ['Items payload is not a valid array.'],
    };
  }

  const normalizedItems = [];
  const issues = [];

  items.forEach((item, index) => {
    const sku = cleanString(item && item.sku);
    const name = cleanString(item && item.name);
    const quantity = parseNumberOrNull(item && item.quantity);
    const unitPrice = parseNumberOrNull(item && item.unitPrice);
    const missingFields = [];

    if (!sku) missingFields.push('sku');
    if (!name) missingFields.push('name');
    if (quantity === null) missingFields.push('quantity');
    if (unitPrice === null) missingFields.push('unitPrice');

    if (missingFields.length) {
      issues.push(
        'Line item ' +
          (index + 1) +
          ' skipped: missing or invalid ' +
          missingFields.join(', ') +
          '.'
      );
      return;
    }

    normalizedItems.push({
      sku,
      name,
      quantity,
      unitPrice,
    });
  });

  return {
    items: normalizedItems,
    issues,
  };
}

function getInputValue(names) {
  for (const name of names) {
    if (data[name] !== undefined && data[name] !== null && String(data[name]).trim() !== '') {
      if (typeof data[name] === 'object') return data[name];
      return String(data[name]).trim();
    }
  }
  return '';
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeForMatch(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCarrierCode(value) {
  const normalizedCarrier = normalizeForMatch(value);
  if (!normalizedCarrier) return '';

  const carrierMap = {
    fedex: 'fedex',
    'federal express': 'fedex',
    ups: 'ups',
    'united parcel service': 'ups',
    usps: 'usps',
    'united states postal service': 'usps',
    dhl: 'dhl_express',
    'dhl express': 'dhl_express',
    ontrac: 'ontrac',
    'canada post': 'canada_post',
  };

  return carrierMap[normalizedCarrier] || '';
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(number) ? 0 : number;
}

function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(number) ? null : number;
}

function checkDateFormat(value) {
  const normalizedValue = cleanString(value);
  const isoDateTimeWithOffsetPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

  if (!isoDateTimeWithOffsetPattern.test(normalizedValue)) {
    throw new Error(
      'Invalid date format: "' +
        normalizedValue +
        '". Expected format like 2025-12-15T00:00:00-08:00.'
    );
  }

  return normalizedValue;
}
