const data = inputData || {};

const MOBI_QUICKBOOKS_STORE_ID = 511893;
const MOBI_QUICKBOOKS_STORE_NAME = 'Mobi USA Quickbooks';
const REPORT_TIME_ZONE = 'America/Los_Angeles';
const SHIPSTATION_SHIPMENTS_URL = 'https://ssapi.shipstation.com/shipments';
const PAGE_SIZE = 500;
const EMAIL_TO_RECIPIENTS = [
  'neal@mobicreations.com',
];
const EMAIL_CC_RECIPIENTS = [
  'nick@ggfulfill.com',
  'dennis@ggfulfill.com',
  'neal@mobicreations.com',
  'team+ggfulfill@bassettewebsolutions.com',
];
const CSV_HEADERS = [
  'Store Name',
  'Order Number',
  'Ship Name',
  'Ship Company',
  'Ship Street 1',
  'Ship City',
  'Ship State',
  'Ship Postal Code',
  'Ship Country',
  'Ship Date',
  'Carrier Fee',
  'Fee+$5',
  'Cost * 1.3',
  'Carrier',
  'Shipping Service',
  'Tracking Number',
  'Weight',
  'Package Length',
  'Package Width',
  'Package Height',
  'Zone',
];

run()
  .then(function(result) {
    output = [result];
    if (typeof callback === 'function') callback(null, output);
  })
  .catch(function(error) {
    if (typeof callback === 'function') callback(error);
    else throw error;
  });

async function run() {
  const authorizationHeader = getShipStationAuthorizationHeader();
  const reportDate = getReportDate();
  const dateRange = buildDateRangeLabel(reportDate, reportDate);

  if (!authorizationHeader) {
    throw new Error(
      'Missing ShipStation credentials. Provide shipstationApiKey and shipstationApiSecret inputs.'
    );
  }

  const shipments = await fetchShipmentsForReportDate(authorizationHeader, reportDate);
  const reportShipments = shipments.filter(isReportableShipment);
  const rows = reportShipments.map(buildCsvRow).sort(compareRowsByOrderNumber);
  const totals = calculateTotals(rows);
  const csvContent = buildCsv(rows, totals);
  const csvFilename = 'mobi-daily-processed-orders-report-' + reportDate + '.csv';

  return {
    shouldSendEmail: reportShipments.length > 0,
    csvContent,
    csvFilename,
    recipientEmails: EMAIL_TO_RECIPIENTS.join(','),
    ccEmails: EMAIL_CC_RECIPIENTS.join(','),
    emailSubject: 'Mobi Daily Processed Orders Report - ' + dateRange,
    emailBody: buildEmailBody(dateRange, reportShipments.length),
    shipmentCount: reportShipments.length,
    carrierFeeTotal: formatMoney(totals.carrierFee),
    feePlusFiveTotal: formatMoney(totals.feePlusFive),
    costTimesOnePointThreeTotal: formatMoney(totals.costTimesOnePointThree),
    dateRange,
    DATE_RANGE: dateRange,
    reportDate,
    storeId: MOBI_QUICKBOOKS_STORE_ID,
    storeName: MOBI_QUICKBOOKS_STORE_NAME,
  };
}

async function fetchShipmentsForReportDate(authorizationHeader, reportDate) {
  const shipments = [];
  let page = 1;
  let totalPages = 1;

  do {
    const pageResult = await fetchShipmentsPage(authorizationHeader, reportDate, page);
    const pageShipments = Array.isArray(pageResult.shipments) ? pageResult.shipments : [];
    shipments.push.apply(shipments, pageShipments);

    totalPages = toPositiveInteger(pageResult.pages) || totalPages;
    page += 1;
  } while (page <= totalPages);

  return shipments;
}

async function fetchShipmentsPage(authorizationHeader, reportDate, page) {
  const url = buildShipmentsUrl(reportDate, page);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authorizationHeader,
      Accept: 'application/json',
    },
  });

  const responseText = await response.text();
  const responseBody = parseJson(responseText) || {};

  if (!response.ok) {
    throw new Error(
      'ShipStation shipments request failed with status ' +
        response.status +
        ': ' +
        (responseText || response.statusText)
    );
  }

  return responseBody;
}

function buildShipmentsUrl(reportDate, page) {
  const queryParams = {
    storeId: MOBI_QUICKBOOKS_STORE_ID,
    shipDateStart: reportDate,
    shipDateEnd: reportDate,
    includeShipmentItems: false,
    sortBy: 'ShipDate',
    sortDir: 'ASC',
    pageSize: PAGE_SIZE,
    page,
  };

  return SHIPSTATION_SHIPMENTS_URL + '?' + Object.keys(queryParams)
    .map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(queryParams[key]);
    })
    .join('&');
}

function isReportableShipment(shipment) {
  if (!shipment || typeof shipment !== 'object') return false;
  if (shipment.voided || shipment.voidDate) return false;
  if (shipment.isReturnLabel || shipment.returnLabel || shipment.isReturnShipment) return false;

  return true;
}

function buildCsvRow(shipment) {
  const shipTo = getPlainObject(shipment.shipTo);
  const dimensions = getPlainObject(shipment.dimensions);
  const carrierFee = toNumber(shipment.shipmentCost);
  const feePlusFive = carrierFee + 5;
  const costTimesOnePointThree = feePlusFive * 1.3;

  return {
    'Store Name': cleanString(shipment.storeName) || MOBI_QUICKBOOKS_STORE_NAME,
    'Order Number': cleanString(shipment.orderNumber),
    'Ship Name': cleanString(shipTo.name),
    'Ship Company': cleanString(shipTo.company),
    'Ship Street 1': cleanString(shipTo.street1),
    'Ship City': cleanString(shipTo.city),
    'Ship State': cleanString(shipTo.state),
    'Ship Postal Code': cleanString(shipTo.postalCode),
    'Ship Country': cleanString(shipTo.country),
    'Ship Date': formatDateForCsv(shipment.shipDate),
    'Carrier Fee': formatMoney(carrierFee),
    'Fee+$5': formatMoney(feePlusFive),
    'Cost * 1.3': formatMoney(costTimesOnePointThree),
    Carrier: cleanString(shipment.carrierCode),
    'Shipping Service': cleanString(shipment.serviceCode),
    'Tracking Number': cleanString(shipment.trackingNumber),
    Weight: formatWeight(shipment.weight),
    'Package Length': cleanString(dimensions.length),
    'Package Width': cleanString(dimensions.width),
    'Package Height': cleanString(dimensions.height),
    Zone: getShipmentZone(shipment),
  };
}

function compareRowsByOrderNumber(firstRow, secondRow) {
  return cleanString(firstRow['Order Number']).localeCompare(
    cleanString(secondRow['Order Number']),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );
}

function calculateTotals(rows) {
  const totals = rows.reduce(function(totals, row) {
    totals.carrierFee += toNumber(row['Carrier Fee']);
    totals.shipmentCount += 1;
    return totals;
  }, {
    carrierFee: 0,
    feePlusFive: 0,
    costTimesOnePointThree: 0,
    shipmentCount: 0,
  });

  totals.feePlusFive = totals.carrierFee + (totals.shipmentCount * 5);
  totals.costTimesOnePointThree = totals.feePlusFive * 1.3;

  return totals;
}

function buildCsv(rows, totals) {
  const csvRows = [CSV_HEADERS];

  rows.forEach(function(row) {
    csvRows.push(CSV_HEADERS.map(function(header) {
      return row[header];
    }));
  });

  if (rows.length) {
    csvRows.push([]);
    csvRows.push(buildSectionHeaderRow('Per-Order Totals'));
    calculateTotalsByOrder(rows).forEach(function(orderTotal) {
      csvRows.push(buildTotalRow(orderTotal.orderNumber, orderTotal));
    });

    csvRows.push([]);
    csvRows.push(buildTotalRow('Grand Total', totals));
  }

  return csvRows.map(formatCsvRow).join('\n');
}

function calculateTotalsByOrder(rows) {
  const totalsByOrderNumber = {};
  const orderNumbers = [];

  rows.forEach(function(row) {
    const orderNumber = cleanString(row['Order Number']);
    const orderKey = orderNumber || '(blank)';

    if (!totalsByOrderNumber[orderKey]) {
      totalsByOrderNumber[orderKey] = {
        orderNumber,
        carrierFee: 0,
        feePlusFive: 0,
        costTimesOnePointThree: 0,
        shipmentCount: 0,
      };
      orderNumbers.push(orderKey);
    }

    totalsByOrderNumber[orderKey].carrierFee += toNumber(row['Carrier Fee']);
    totalsByOrderNumber[orderKey].shipmentCount += 1;
  });

  return orderNumbers.map(function(orderKey) {
    totalsByOrderNumber[orderKey].feePlusFive =
      totalsByOrderNumber[orderKey].carrierFee +
      (totalsByOrderNumber[orderKey].shipmentCount * 5);
    totalsByOrderNumber[orderKey].costTimesOnePointThree =
      totalsByOrderNumber[orderKey].feePlusFive * 1.3;

    return totalsByOrderNumber[orderKey];
  });
}

function buildSectionHeaderRow(label) {
  return CSV_HEADERS.map(function(header) {
    return header === 'Order Number' ? label : '';
  });
}

function buildTotalRow(orderNumber, totals) {
  return CSV_HEADERS.map(function(header) {
    if (header === 'Order Number') return orderNumber;
    if (header === 'Carrier Fee') return formatMoney(totals.carrierFee);
    if (header === 'Fee+$5') return formatMoney(totals.feePlusFive);
    if (header === 'Cost * 1.3') return formatMoney(totals.costTimesOnePointThree);
    return '';
  });
}

function formatCsvRow(row) {
  return row.map(escapeCsvValue).join(',');
}

function escapeCsvValue(value) {
  const stringValue = cleanString(value);

  if (/[",\n\r]/.test(stringValue)) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }

  return stringValue;
}

function buildEmailBody(dateRange, shipmentCount) {
  const safeDateRange = escapeHtml(dateRange);
  const safeShipmentCount = escapeHtml(shipmentCount);

  return [
    '<p>Hello Mobi team,</p>',
    '<p>Please find attached the daily processed orders report for ' +
      safeDateRange +
      ' for the Mobi Quickbooks store.</p>',
    '<p>Total packages shipped: <strong>' + safeShipmentCount + '</strong></p>',
    '<p>Best,<br>Nick &amp; the GG Fulfillment Team</p>',
  ].join('');
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getReportDate() {
  return getLosAngelesDateParts(new Date()).date;
}

function buildDateRangeLabel(startDate, endDate) {
  const formattedStartDate = formatDisplayDate(startDate);
  const formattedEndDate = formatDisplayDate(endDate);

  if (!formattedStartDate || formattedStartDate === formattedEndDate) {
    return formattedEndDate || formattedStartDate;
  }

  return formattedStartDate + ' through ' + formattedEndDate;
}

function formatDisplayDate(value) {
  const match = cleanString(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return cleanString(value);

  return match[2] + '/' + match[3] + '/' + match[1];
}

function getLosAngelesDateParts(date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce(function(result, item) {
    if (item.type !== 'literal') result[item.type] = item.value;
    return result;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    date: parts.year + '-' + parts.month + '-' + parts.day,
  };
}

function formatDateForCsv(value) {
  const rawValue = cleanString(value);
  if (!rawValue) return '';
  if (!hasTimezone(rawValue)) return rawValue.replace('T', ' ').replace(/\.\d+$/, '');

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return rawValue;

  return getLosAngelesDateTime(parsedDate);
}

function hasTimezone(value) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(cleanString(value));
}

function getLosAngelesDateTime(date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce(function(result, item) {
    if (item.type !== 'literal') result[item.type] = item.value;
    return result;
  }, {});

  return (
    parts.year + '-' +
    parts.month + '-' +
    parts.day + ' ' +
    parts.hour + ':' +
    parts.minute + ':' +
    parts.second
  );
}

function getShipmentZone(shipment) {
  const advancedOptions = getPlainObject(shipment.advancedOptions);

  return (
    cleanString(shipment.zone) ||
    cleanString(advancedOptions.zone) ||
    cleanString(advancedOptions.Zone)
  );
}

function formatWeight(weight) {
  if (weight === null || weight === undefined || weight === '') return '';
  if (typeof weight !== 'object') return cleanString(weight);

  const value = cleanString(weight.value);
  const units = cleanString(weight.units);

  return [value, units].filter(Boolean).join(' ');
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

function getShipStationAuthorizationHeader() {
  const apiKey = getInputValue(['shipstationApiKey', 'ShipStation API Key']);
  const apiSecret = getInputValue(['shipstationApiSecret', 'ShipStation API Secret']);
  if (apiKey && apiSecret) return 'Basic ' + base64Encode(apiKey + ':' + apiSecret);

  return '';
}

function base64Encode(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value).toString('base64');
  }

  return btoa(value);
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(number) ? 0 : number;
}

function formatMoney(value) {
  return toNumber(value).toFixed(2);
}

function toPositiveInteger(value) {
  const integer = parseInt(value, 10);
  return Number.isInteger(integer) && integer > 0 ? integer : 0;
}

function getPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}
