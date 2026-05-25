const data = inputData || {};

const pdfUrl = getInputValue(['pdf_url']);

const reviewReasons = [];
const parsedOrder = getParsedOrder();
const routing = resolveRouting(parsedOrder);
const shipstationOrder = normalizeOrder(parsedOrder, routing);

if (!parsedOrder) reviewReasons.push('Missing order inputs.');
if (shipstationOrder && !shipstationOrder.orderNumber) reviewReasons.push('Missing order number.');
if (shipstationOrder && !shipstationOrder.shipTo.name) reviewReasons.push('Missing ship-to name.');
if (shipstationOrder && !shipstationOrder.shipTo.street1) reviewReasons.push('Missing ship-to street1.');
if (shipstationOrder && !shipstationOrder.shipTo.city) reviewReasons.push('Missing ship-to city.');
if (shipstationOrder && !shipstationOrder.shipTo.state) reviewReasons.push('Missing ship-to state.');
if (shipstationOrder && !shipstationOrder.shipTo.postalCode) reviewReasons.push('Missing ship-to postal code.');
if (shipstationOrder && !shipstationOrder.items.length) reviewReasons.push('Missing line items.');

output = [{
  shipstationOrderJson: JSON.stringify(shipstationOrder || {}),
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
    orderStatus: getInputValue(['orderStatus', 'Order Status']),
    customerUsername: getInputValue(['customerUsername', 'Customer Username']),
    customerEmail: getInputValue(['customerEmail', 'Customer Email']),
    customerNotes: getInputValue(['customerNotes', 'Customer Notes']),
    paymentMethod: getInputValue(['paymentMethod', 'Payment Method']),
    requestedShippingService: getInputValue(['requestedShippingService', 'Requested Shipping Service']),
    carrierCode: getInputValue(['carrierCode', 'Carrier Code']),
    serviceCode: getInputValue(['serviceCode', 'Service Code']),
    packageCode: getInputValue(['packageCode', 'Package Code']),
    confirmation: getInputValue(['confirmation', 'Confirmation']),
    shipDate: getInputValue(['shipDate', 'Ship Date']),
    holdUntilDate: getInputValue(['holdUntilDate', 'Hold Until Date']),
    sourceCompany: getInputValue(['sourceCompany', 'Source Company', 'storeName', 'Store Name']),
    weight: getInputValue(['weight', 'Weight']),
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

  return hasOrderData(order) ? order : null;
}

function hasOrderData(order) {
  return Boolean(
    order.orderNumber ||
    order.orderDate ||
    order.sourceCompany ||
    order.shipTo.name ||
    order.items.length
  );
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    const jsonText = String(value).match(/\{[\s\S]*\}/);
    if (!jsonText) return null;

    try {
      return JSON.parse(jsonText[0]);
    } catch (innerError) {
      return null;
    }
  }
}

function normalizeOrder(order, routing) {
  if (!order) return null;
  const sourceCompany = cleanString(order.sourceCompany);
  const customField3Value = [routing && routing.generalTag, routing && routing.printSalesOrderTag]
    .filter(Boolean)
    .join(' | ');

  return {
    orderNumber: cleanString(order.orderNumber),
    orderDate: cleanString(order.orderDate),
    orderStatus: 'on_hold',
    customerUsername: cleanString(order.customerUsername),
    customerEmail: cleanString(order.customerEmail),
    customerNotes: cleanString(order.customerNotes),
    internalNotes: "DEV TEST - DO NOT SHIP",
    paymentMethod: cleanString(order.paymentMethod),
    requestedShippingService: cleanString(order.requestedShippingService),
    carrierCode: cleanString(order.carrierCode),
    serviceCode: cleanString(order.serviceCode),
    packageCode: cleanString(order.packageCode),
    confirmation: cleanString(order.confirmation) || 'none',
    shipDate: cleanString(order.shipDate),
    holdUntilDate: cleanString(order.holdUntilDate),
    weight: {
      value: toNumber(order.weight && order.weight.value),
      units: cleanString(order.weight && order.weight.units) || 'ounces',
    },
    billTo: normalizeAddress(order.billTo),
    shipTo: normalizeAddress(order.shipTo),
    items: normalizeItems(order.items),
    amountPaid: toNumber(order.amountPaid),
    taxAmount: toNumber(order.taxAmount),
    shippingAmount: toNumber(order.shippingAmount),
    orderTotal: toNumber(order.orderTotal),
    poNumber: cleanString(order.poNumber),
    advancedOptions: {
      storeId: routing ? routing.storeId : null,
      customField1: pdfUrl,
      customField2: sourceCompany,
      customField3: customField3Value,
      source: cleanString(order.advancedOptions && order.advancedOptions.source) || 'Created by Zapier',
    },
  };
}

function resolveRouting(order) {
  const sourceCompany = cleanString(order && order.sourceCompany);
  const normalizedSourceCompany = normalizeForMatch(sourceCompany);
  const routes = [
    {
      sourceCompany: 'New Enterprises',
      storeName: 'New Enterprises Co',
      storeId: 1,
    },
    {
      sourceCompany: 'Kola Goodies',
      storeName: 'Kola Goodes Manual',
      storeId:2,
      printSalesOrderTag: 'Print Sales Order',
    },
    {
      sourceCompany: 'Mobi USA LLC',
      storeName: 'Mobi USA Quickbooks',
      storeId:3,
    },
    {
      sourceCompany: 'munchrooms',
      storeName: 'Munchrooms Manual',
      storeId:4,
      printSalesOrderTag: 'Print Sales Order',
    },
  ];

  for (const route of routes) {
    if (normalizedSourceCompany === normalizeForMatch(route.sourceCompany)) {
      return buildRoutingResult(route, 'sourceCompany');
    }
  }

  return {
    storeName: 'Golden Gate Fulfillment',
    storeId: 5,
  };
}

function buildRoutingResult(route, matchedBy) {
  const generalTag = 'Created by Zapier';
  const tagNames = [generalTag];

  if (route.printSalesOrderTag) {
    tagNames.push(route.printSalesOrderTag);
  }

  return {
    sourceCompany: route.sourceCompany,
    matchedBy,
    storeName: route.storeName,
    storeId: route.storeId,
    generalTag,
    printSalesOrderTag: route.printSalesOrderTag || '',
    tagNames,
  };
}

function normalizeAddress(address) {
  address = address || {};

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
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      sku: cleanString(item.sku),
      name: cleanString(item.name),
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice || item.unit_price),
    }))
    .filter((item) => item.sku || item.name);
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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(number) ? 0 : number;
}
