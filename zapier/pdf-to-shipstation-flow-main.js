const data = inputData || {};
const SHIPSTATION_TAG_IDS = {
  billToThirdParty: 123204,
  clientRequestedCarrier: 123133,
  createdByZapier: 123078,
  printSalesOrder: 123079,
};
const LOS_ANGELES_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'shortOffset',
});
const LOS_ANGELES_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  timeZoneName: 'shortOffset',
});
const MONTH_NUMBERS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const pdfUrl = getInputValue(['pdf_url']);

const reviewReasons = [];
const parsedOrder = getParsedOrder();
const normalizedItemsResult = normalizeItems(parsedOrder && parsedOrder.items);
const normalizedCarrierCode = getCarrierCode(parsedOrder && parsedOrder.carrierCode);
const routing = resolveRouting(parsedOrder);
const shipstationOrder = canCreateOrder(parsedOrder, normalizedItemsResult.items)
  ? normalizeOrder(parsedOrder, routing, normalizedItemsResult.items, normalizedCarrierCode)
  : null;

if (!parsedOrder) reviewReasons.push('Missing order inputs.');
if (parsedOrder && !cleanString(parsedOrder.orderNumber)) reviewReasons.push('Missing order number.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.street1)) reviewReasons.push('Missing ship-to street1.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.city)) reviewReasons.push('Missing ship-to city.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.state)) reviewReasons.push('Missing ship-to state.');
if (parsedOrder && !cleanString(parsedOrder.shipTo && parsedOrder.shipTo.postalCode)) reviewReasons.push('Missing ship-to postal code.');
if (parsedOrder && (!Array.isArray(parsedOrder.items) || !parsedOrder.items.length)) reviewReasons.push('Missing line items.');
if (parsedOrder && cleanString(parsedOrder.carrierCode) && !normalizedCarrierCode) reviewReasons.push('Unrecognized carrierCode: ' + cleanString(parsedOrder.carrierCode) + '.');
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
    internalNotes: getInputValue(['internalNotes', 'Internal Notes']),
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
    billToAccount: getInputValue(['billToAccount', 'Bill to Account']),
    advancedOptions: parseJson(getInputValue(['advancedOptions', 'Advanced Options'])) || {},
  };

  return hasAnyOrderData(order) ? order : null;
}

function hasAnyOrderData(order) {
  return Boolean(
    cleanString(order.orderNumber) &&
    cleanString(order.shipTo && order.shipTo.street1) &&
    order.items?.length
  );
}

function canCreateOrder(order, normalizedItems) {
  if (!order) return false;

  return Boolean(
    cleanString(order.orderNumber) &&
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

function normalizeOrder(order, routing, normalizedItems, normalizedCarrierCode) {
  if (!order) return null;
  const sourceCompany = cleanString(order.sourceCompany);
  const shipstationOrderNumber = buildShipStationOrderNumber(order);
  const normalizedOrder = {
    orderNumber: shipstationOrderNumber,
    orderKey: buildOrderKey(routing, order),
    orderDate: normalizeOrderDate(order.orderDate),
    orderStatus: 'on_hold',
    customerUsername: cleanString(order.customerUsername),
    customerEmail: cleanString(order.customerEmail),
    customerNotes: cleanString(order.customerNotes),
    internalNotes: [pdfUrl, cleanString(order.internalNotes), 'DEV TEST - DO NOT SHIP'].filter(Boolean).join('\n'),
    shipDate: normalizeOptionalIsoDate(order.shipDate),
    billTo: normalizeAddress(order.billTo),
    shipTo: normalizeAddress(order.shipTo),
    items: normalizedItems,
    amountPaid: toNumber(order.amountPaid),
    taxAmount: toNumber(order.taxAmount),
    shippingAmount: toNumber(order.shippingAmount),
    orderTotal: toNumber(order.orderTotal),
    poNumber: cleanString(order.poNumber),
    tagIds: buildTagIds(routing, normalizedCarrierCode, getThirdPartyBillingOptions(order)),
    advancedOptions: buildAdvancedOptions(order, routing, sourceCompany, normalizedCarrierCode),
  };

  return normalizedOrder;
}

function buildAdvancedOptions(order, routing, sourceCompany, normalizedCarrierCode) {
  const advancedOptions = Object.assign({}, getPlainObject(order && order.advancedOptions), {
    storeId: routing ? routing.storeId : null,
    source: sourceCompany,
  });

  if (normalizedCarrierCode) advancedOptions.customField1 = normalizedCarrierCode;

  const thirdPartyBilling = getThirdPartyBillingOptions(order);

  if (thirdPartyBilling && thirdPartyBilling.account) {
    advancedOptions.billToParty = 'third_party';
    advancedOptions.billToAccount = thirdPartyBilling.account;
  }

  return advancedOptions;
}

function getThirdPartyBillingOptions(order) {
  const account = cleanString(
    order && order.billToAccount ||
    getPlainObject(order && order.advancedOptions).billToAccount
  );
  if (!account) return null;

  return {
    account
  };
}

function getPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function buildTagIds(routing, normalizedCarrierCode, thirdPartyBilling) {
  const tagIds = routing && Array.isArray(routing.tagIds) ? routing.tagIds.slice() : [];

  if (normalizedCarrierCode && !tagIds.includes(SHIPSTATION_TAG_IDS.clientRequestedCarrier)) {
    tagIds.push(SHIPSTATION_TAG_IDS.clientRequestedCarrier);
  }

  if (thirdPartyBilling && !tagIds.includes(SHIPSTATION_TAG_IDS.billToThirdParty)) {
    tagIds.push(SHIPSTATION_TAG_IDS.billToThirdParty);
  }

  return tagIds;
}

function buildOrderKey(routing, order) {
  const storeId = routing && routing.storeId;
  const orderNumber = cleanString(order && order.orderNumber);

  if (!storeId || !orderNumber) return '';

  return String(storeId) + '-' + orderNumber;
}

function buildShipStationOrderNumber(order) {
  const orderNumber = cleanString(order && order.orderNumber);
  const poNumber = normalizePoNumberForOrderNumber(order && order.poNumber);
  if (!orderNumber || !poNumber) return limitShipStationOrderNumber(orderNumber);

  const normalizedOrderNumber = normalizeForMatch(orderNumber);
  const normalizedPoNumber = normalizeForMatch(poNumber);
  if (normalizedOrderNumber.includes('po ' + normalizedPoNumber)) {
    return limitShipStationOrderNumber(orderNumber);
  }

  return limitShipStationOrderNumber(orderNumber + ' PO ' + poNumber);
}

function limitShipStationOrderNumber(value) {
  return cleanString(value).slice(0, 50);
}

function normalizePoNumberForOrderNumber(value) {
  return cleanString(value)
    .replace(/^(?:p[./]?\s*o\.?|purchase\s+order)\s*(?:number|num|no\.?|#)?\s*[:#-]?\s*/i, '')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizeOrderDate(value) {
  const orderDate = normalizeOptionalIsoDate(value);
  if (orderDate) return orderDate;
  return formatPstDateTime(new Date());
}

function normalizeOptionalIsoDate(value) {
  const rawValue = cleanString(value);
  if (!rawValue) return '';

  const parsedValue = parseSupportedDateValue(rawValue);
  if (!parsedValue) return '';

  if (parsedValue.type === 'dateOnly') {
    return formatLosAngelesDateOnly(parsedValue);
  }

  return formatLosAngelesDateTime(parsedValue.date);
}

function parseSupportedDateValue(value) {
  const isoLikeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
  );
  if (isoLikeMatch) {
    if (!isoLikeMatch[4]) {
      return buildDateOnlyResult(
        Number(isoLikeMatch[1]),
        Number(isoLikeMatch[2]),
        Number(isoLikeMatch[3])
      );
    }

    const normalizedValue = value.includes(' ') && !value.includes('T')
      ? value.replace(' ', 'T')
      : value;
    const parsedIsoDate = new Date(normalizedValue);
    if (!Number.isNaN(parsedIsoDate.getTime())) {
      return { type: 'dateTime', date: parsedIsoDate };
    }
  }

  return parseDateOnlyText(value);
}

function parseDateOnlyText(value) {
  const slashDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDateMatch) {
    return buildDateOnlyResult(
      Number(slashDateMatch[3]),
      Number(slashDateMatch[1]),
      Number(slashDateMatch[2])
    );
  }

  const dayMonthYearMatch = value.match(/^(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})$/);
  if (dayMonthYearMatch) {
    return buildDateOnlyResult(
      Number(dayMonthYearMatch[3]),
      monthNameToNumber(dayMonthYearMatch[2]),
      Number(dayMonthYearMatch[1])
    );
  }

  const monthDayYearMatch = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (monthDayYearMatch) {
    return buildDateOnlyResult(
      Number(monthDayYearMatch[3]),
      monthNameToNumber(monthDayYearMatch[1]),
      Number(monthDayYearMatch[2])
    );
  }

  return null;
}

function buildDateOnlyResult(year, month, day) {
  if (!isValidDateParts(year, month, day)) return null;

  return {
    type: 'dateOnly',
    year,
    month,
    day,
  };
}

function monthNameToNumber(value) {
  return MONTH_NUMBERS[cleanString(value).toLowerCase()] || 0;
}

function isValidDateParts(year, month, day) {
  if (!year || !month || !day) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatPstDateTime(date) {
  return formatLosAngelesDateTime(date);
}

function formatLosAngelesDateOnly(dateParts) {
  return (
    padNumber(dateParts.year, 4) + '-' +
    padNumber(dateParts.month, 2) + '-' +
    padNumber(dateParts.day, 2) +
    'T00:00:00' +
    getLosAngelesOffset(dateParts.year, dateParts.month, dateParts.day)
  );
}

function formatLosAngelesDateTime(date) {
  const parts = getFormatterParts(LOS_ANGELES_DATE_TIME_FORMATTER, date);

  return (
    parts.year + '-' +
    parts.month + '-' +
    parts.day + 'T' +
    parts.hour + ':' +
    parts.minute + ':' +
    parts.second +
    normalizeOffset(parts.timeZoneName)
  );
}

function getLosAngelesOffset(year, month, day) {
  const sampleUtcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = getFormatterParts(LOS_ANGELES_OFFSET_FORMATTER, sampleUtcDate);

  return normalizeOffset(parts.timeZoneName);
}

function getFormatterParts(formatter, date) {
  return formatter.formatToParts(date).reduce(function(parts, item) {
    if (item.type !== 'literal') parts[item.type] = item.value;
    return parts;
  }, {});
}

function normalizeOffset(value) {
  if (!value || value === 'GMT' || value === 'UTC') return 'Z';

  const match = value.match(/([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 'Z';

  return match[1] + padNumber(match[2], 2) + ':' + padNumber(match[3] || '00', 2);
}

function padNumber(value, length) {
  return String(value).padStart(length, '0');
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
  if (carrierMap[normalizedCarrier]) {
    return carrierMap[normalizedCarrier];
  }
  for (const alias in carrierMap) {
    if (normalizedCarrier.includes(alias)) {
      return carrierMap[alias];
    }
  }

  return '';
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
