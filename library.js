/* ==========================================================================
   Ghoomgali Itinerary Maker - cost sheet library
   Reads the agency's own Excel cost sheets, entirely in the browser via
   SheetJS, and keeps them in this browser's storage. The rates are never
   bundled into the app or uploaded anywhere: the app is a public page, and
   net supplier rates must not be readable by anyone who has the link.
   ========================================================================== */
(function () {
  'use strict';

  var STORE = 'gg-library-v2';
  var CATS = ['hotel', 'transfer', 'activity', 'visa'];
  var CAT_LABEL = { hotel: 'Hotels', transfer: 'Transfers', activity: 'Activities', visa: 'Visa' };
  var CAT_SINGLE = { hotel: 'Hotel', transfer: 'Transfer', activity: 'Activity', visa: 'Visa' };

  function clean(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function titleCase(s) {
    return clean(s).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  /* ---- where a sheet belongs ------------------------------------------------
     The workbook names sheets loosely ("vietnam DAD pvt", "SGN SIC", "PVT
     SIC"), so the country and city are read from the name. A sheet whose name
     carries neither inherits them from the sheet before it - "PVT SIC" sits
     straight after "PQC PVT" and is Phu Quoc's SIC list. */

  var CITY_RULES = [
    [/hanoi|\bhan\b/i, 'Hanoi', 'Vietnam'],
    [/danang|da nang|\bdad\b/i, 'Da Nang', 'Vietnam'],
    [/saigon|\bsgn\b|hcm|ho chi minh/i, 'Ho Chi Minh City', 'Vietnam'],
    [/phu quoc|\bpqc\b/i, 'Phu Quoc', 'Vietnam'],
    [/sapa/i, 'Sapa', 'Vietnam'],
    [/bangkok|\bbkk\b/i, 'Bangkok', 'Thailand'],
    [/pattaya/i, 'Pattaya', 'Thailand'],
    [/phuket/i, 'Phuket', 'Thailand'],
    [/krabi/i, 'Krabi', 'Thailand']
  ];
  var COUNTRY_RULES = [
    [/vietnam/i, 'Vietnam'], [/thailand/i, 'Thailand'], [/bali|indonesia/i, 'Bali'],
    [/dubai|uae/i, 'Dubai'], [/malaysia/i, 'Malaysia'], [/singapore/i, 'Singapore']
  ];

  function placeFromName(name) {
    var out = { country: '', city: '' };
    // The earliest place mentioned wins, so a route like "Pattaya HTL -
    // BKK APT" is filed under where it starts.
    var best = Infinity;
    CITY_RULES.forEach(function (r) {
      var m = String(name).match(r[0]);
      if (m && m.index < best) { best = m.index; out.city = r[1]; out.country = r[2]; }
    });
    if (!out.country) {
      COUNTRY_RULES.some(function (r) {
        if (r[0].test(name)) { out.country = r[1]; return true; }
        return false;
      });
    }
    return out;
  }

  /* ---- rate columns ----------------------------------------------------------
     A rate table is any row with two or more price headers side by side:
     vehicle sizes (4 SEATER, Innova (4-7)), traveller types (Adult, Child
     (3-5)) or SIC/Private price. Each becomes one selectable rate on the item. */

  var RATE_HEADER = /seater|small car|sedan|suv|innova|\bvan\b|coach|\bbus\b|adult|child|infant|sic price|private price|pvt price|^price$|^rate$|per person|per pax/i;

  function rateColumn(label) {
    var l = clean(label);
    var lower = l.toLowerCase();
    var col = { label: l, basis: 'vehicle', band: null };
    if (/adult/.test(lower)) { col.basis = 'person'; col.band = 'adult'; }
    else if (/child|infant/.test(lower)) { col.basis = 'person'; col.band = 'child'; }
    else if (/sic|per person|per pax/.test(lower)) { col.basis = 'person'; col.band = 'all'; }
    else if (/^price$|^rate$/.test(lower)) { col.basis = 'unit'; }
    col.label = l.replace(/\s*\n\s*/g, ' ')
      .replace(/(\d+)\s*SEATER\s*(.*)$/i, function (m, n, rest) {
        return n + ' seater' + (rest ? ', ' + rest.toLowerCase() : '');
      })
      .replace(/^SIC PRICE$/i, 'SIC per person')
      .replace(/^PRIVATE PRICE$/i, 'Private');
    return col;
  }

  function findRateHeader(row) {
    var cols = [];
    row.forEach(function (cell, i) {
      if (RATE_HEADER.test(clean(cell))) cols.push({ idx: i, col: rateColumn(cell) });
    });
    return cols.length >= 2 ? cols : null;
  }

  var SERVICE_WORD = /^(pvt|pvt transfer|private|sic|tour|transfer|only tickets?|include|included|no service)$/i;
  var SEASON = /\d{1,2}\s+[a-z]{3,}\s+\d{4}\s*[-–]\s*\d{1,2}\s+[a-z]{3,}\s+\d{4}/i;

  function toRate(raw) {
    if (typeof raw === 'number') return raw > 0 ? { price: Math.round(raw) } : null;
    var s = clean(raw);
    if (!s) return null;
    var n = parseFloat(s.replace(/,/g, ''));
    if (/^[\d.,]+$/.test(s)) return n > 0 ? { price: Math.round(n) } : null;
    // Values like "400 NP" carry a note the agent needs to read, not a price
    // the app should silently add up.
    return { price: null, text: s };
  }

  function categorise(name, service, tableHead) {
    var s = (name + ' ' + service).toLowerCase();
    if (/visa/.test(s)) return 'visa';
    if (/\bhotel stay|resort stay|room night/.test(s)) return 'hotel';
    if (/route/i.test(tableHead) || /pick ?up|drop ?off|airport|transfer|limo?sine|shuttle|surcharge|car at disposal|round trip|one way/.test(s)) {
      // Tours that merely include a transfer read as tours.
      if (/tour|cruise|day trip|park|show/.test(s) && !/pick ?up|drop ?off|airport/.test(s)) return 'activity';
      return 'transfer';
    }
    return 'activity';
  }

  /* Private or SIC, read from the row's own service cell first, then its
     name ("... Tour PVT"), then the sheet name ("SGN SIC"). */
  function serviceLabel(service, name, sheetName) {
    if (/only ticket/i.test(service)) return 'Tickets only';
    var sources = [service, name, sheetName];
    for (var i = 0; i < sources.length; i++) {
      if (/\bsic\b|sharing basis/i.test(sources[i])) return 'SIC';
      if (/\bpvt\b|private/i.test(sources[i])) return 'Private';
    }
    return '';
  }

  /* One worksheet in the agency's rate-table layout -> items. */
  function readRateSheet(rows, sheetName, place) {
    var items = [];
    var header = null, headerRowText = '', cityCol = -1, season = '';

    rows.forEach(function (row) {
      var cells = row.map(clean);
      if (!cells.some(Boolean)) return;

      var seasonCell = cells.find(function (c) { return SEASON.test(c); });
      if (seasonCell && cells.filter(Boolean).length <= 2) { season = seasonCell; return; }

      var h = findRateHeader(row);
      if (h) {
        header = h;
        headerRowText = cells.join(' ');
        cityCol = cells.findIndex(function (c) { return /^city$/i.test(c); });
        return;
      }
      if (!header) return;

      var firstRate = header[0].idx;
      var before = cells.slice(0, firstRate);
      var service = before.find(function (c) { return SERVICE_WORD.test(c); }) || '';
      var name = before.find(function (c, i) {
        return c && i !== cityCol && !SERVICE_WORD.test(c) && !/^\d+$/.test(c) && c.length > 2;
      });
      if (!name) return;
      if (/^(name|route|activity|service|duty code)$/i.test(name)) return;

      var rates = [], notes = [];
      header.forEach(function (h) {
        var r = toRate(row[h.idx]);
        if (!r) return;
        if (r.price == null) { notes.push(h.col.label + ': ' + r.text); return; }
        rates.push({ label: h.col.label, price: r.price, basis: h.col.basis, band: h.col.band });
      });
      if (!rates.length) return;

      var city = cityCol > -1 && cells[cityCol] ? titleCase(cells[cityCol]) : (place.city || placeFromName(name).city);
      items.push({
        category: categorise(name, service, headerRowText),
        name: name,
        city: city || '',
        service: serviceLabel(service, name, sheetName),
        description: '',
        rates: rates,
        price: Math.min.apply(null, rates.map(function (r) { return r.price; })),
        notes: notes.join(' · '),
        season: season,
        sheet: sheetName.trim(),
        image: ''
      });
    });
    return items;
  }

  /* ---- the simple template layout (Category / Name / Price ...) ------------ */

  var HEADERS = {
    name:        ['name', 'title', 'item', 'activity', 'hotel', 'hotel name'],
    category:    ['category', 'type', 'kind'],
    description: ['description', 'detail', 'details', 'about'],
    price:       ['price', 'cost', 'amount', 'rate'],
    meta:        ['meta', 'pax', 'dates', 'nights', 'room', 'room type'],
    notes:       ['notes', 'note', 'basis', 'cost basis'],
    image:       ['image', 'photo', 'image url', 'imageurl', 'photo url']
  };

  function pick(row, keys) {
    var found = Object.keys(row).find(function (k) {
      return keys.indexOf(String(k).trim().toLowerCase()) > -1;
    });
    if (found == null) return '';
    return clean(row[found]);
  }

  function normaliseCategory(raw) {
    var s = String(raw || '').toLowerCase();
    if (/hotel|stay|resort|accommodation/.test(s)) return 'hotel';
    if (/transfer|transport|cab|taxi|coach/.test(s)) return 'transfer';
    if (/visa/.test(s)) return 'visa';
    return 'activity';
  }

  function readTemplateSheet(ws, place) {
    var objs = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!objs.length) return [];
    var keys = Object.keys(objs[0]).map(function (k) { return k.trim().toLowerCase(); });
    // Both a name and a price column are required - a leads list or a hotel
    // roster with a "Name" column is not a cost sheet.
    var hasName = HEADERS.name.some(function (k) { return keys.indexOf(k) > -1; });
    var hasPrice = HEADERS.price.some(function (k) { return keys.indexOf(k) > -1; });
    if (!hasName || !hasPrice) return [];

    return objs.map(function (row) {
      var name = pick(row, HEADERS.name);
      var price = window.GGParser.toNumber(pick(row, HEADERS.price));
      if (!name || !price) return null;
      return {
        category: normaliseCategory(pick(row, HEADERS.category)),
        name: name,
        city: place.city || '',
        service: '',
        description: pick(row, HEADERS.description),
        rates: [{ label: 'Price', price: price, basis: 'unit', band: null }],
        price: price,
        meta: pick(row, HEADERS.meta),
        notes: pick(row, HEADERS.notes),
        season: '',
        image: pick(row, HEADERS.image)
      };
    }).filter(Boolean);
  }

  /* ---- whole workbook ---------------------------------------------------------
     Returns { library: { Country: [items] }, used: [sheet names], skipped: [...] }.
     Sheets are grouped by country, so every Vietnam city sheet lands under one
     "Vietnam" tab and the search covers all of them at once. */

  function workbookToLibrary(wb) {
    var lib = {}, used = [], skipped = [];
    var last = { country: '', city: '' };

    wb.SheetNames.forEach(function (sheetName) {
      var ws = wb.Sheets[sheetName];
      var place = placeFromName(sheetName);
      if (!place.country && /^(pvt|sic|pvt sic|sic pvt)$/i.test(sheetName.trim())) place = last;

      var rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      var items = readRateSheet(rows, sheetName, place);
      if (!items.length) items = readTemplateSheet(ws, place);
      if (!items.length) { skipped.push(sheetName.trim()); return; }

      var country = place.country || sheetName.trim();
      lib[country] = (lib[country] || []).concat(items);
      used.push(sheetName.trim());
      if (place.country) last = place;
    });
    return { library: lib, used: used, skipped: skipped };
  }

  function readWorkbookFile(file) {
    return file.arrayBuffer().then(function (buf) {
      return workbookToLibrary(window.XLSX.read(buf, { type: 'array' }));
    });
  }

  /* A starter workbook in the same rate-table layout the agency already uses,
     so a new country can be added by copying it. */
  function downloadTemplate() {
    var wb = window.XLSX.utils.book_new();
    var pvt = window.XLSX.utils.aoa_to_sheet([
      ['Service', 'Type', '4 SEATER', '7 SEATER', '16 SEATER'],
      ['Airport Pick Up - City Hotel', 'PVT', 1200, 1500, 2600],
      ['City Tour Full Day - Transport + Guide', 'PVT', 7600, 8800, 9800]
    ]);
    var sic = window.XLSX.utils.aoa_to_sheet([
      ['Name', 'Service', 'Adult', 'Child (3-5)', 'Child (6-11)'],
      ['City Tour Half Day - SIC', 'Tour', 1850, 970, 1400],
      ['Observation Deck', 'Only Ticket', 800, 440, 620]
    ]);
    window.XLSX.utils.book_append_sheet(wb, pvt, 'Country City PVT');
    window.XLSX.utils.book_append_sheet(wb, sic, 'Country City SIC');
    window.XLSX.writeFile(wb, 'ghoom-gali-cost-sheet-template.xlsx');
  }

  /* ---- validity ----------------------------------------------------------------- */

  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  /* The end date of a season like "1 Jan 2025 - 31 Mar 2026", or null. */
  function seasonEnd(season) {
    var m = String(season || '').match(/(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})\s*$/i);
    if (!m || MONTHS[m[2].toLowerCase()] == null) return null;
    return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1], 23, 59, 59);
  }

  function isExpired(season) {
    var end = seasonEnd(season);
    return !!end && end < new Date();
  }

  /* ---- persistence -------------------------------------------------------------- */

  function loadLibrary() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) return JSON.parse(raw);
      // The first version stored single-price items; carry them forward.
      var old = JSON.parse(localStorage.getItem('gg-library-v1') || 'null');
      if (!old) return {};
      Object.keys(old).forEach(function (d) {
        old[d] = old[d].map(function (it) {
          if (!it.rates) it.rates = it.price != null ? [{ label: 'Price', price: it.price, basis: 'unit', band: null }] : [];
          return it;
        }).filter(function (it) { return it.rates.length; });
      });
      return old;
    } catch (e) { return {}; }
  }

  function saveLibrary(lib) {
    try {
      localStorage.setItem(STORE, JSON.stringify(lib));
      localStorage.removeItem('gg-library-v1');
      return true;
    } catch (e) { return false; }
  }

  function replaceDestinations(existing, incoming) {
    var out = {};
    Object.keys(existing || {}).forEach(function (d) { out[d] = existing[d]; });
    Object.keys(incoming).forEach(function (d) { out[d] = incoming[d]; });
    return out;
  }

  window.GGLibrary = {
    CATS: CATS,
    CAT_LABEL: CAT_LABEL,
    CAT_SINGLE: CAT_SINGLE,
    readWorkbookFile: readWorkbookFile,
    workbookToLibrary: workbookToLibrary,
    downloadTemplate: downloadTemplate,
    loadLibrary: loadLibrary,
    saveLibrary: saveLibrary,
    replaceDestinations: replaceDestinations,
    isExpired: isExpired,
    seasonEnd: seasonEnd
  };
})();
