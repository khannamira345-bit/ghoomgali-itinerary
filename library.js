/* ==========================================================================
   Ghoomgali Itinerary Maker - activity library
   An alternative to pasting text: import an Excel cost sheet - one worksheet
   per destination - then click items into days. Runs entirely client-side
   via SheetJS; the library lives in the browser and as an exportable file,
   same as everything else in this app. No server, no API, no per-use cost.
   ========================================================================== */
(function () {
  'use strict';

  var STORE = 'gg-library-v1';
  var CATS = ['hotel', 'transfer', 'activity', 'visa'];
  var CAT_LABEL = { hotel: 'Hotels', transfer: 'Transfers', activity: 'Activities', visa: 'Visa' };

  /* ---- header matching ---------------------------------------------------
     Column names are matched case-insensitively and in any order, so a sheet
     built in Excel, Google Sheets or exported from another tool still reads
     correctly as long as the ideas - not the exact wording - are present. */

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
    return String(row[found]).trim();
  }

  function normaliseCategory(raw) {
    var s = String(raw || '').toLowerCase();
    if (/hotel|stay|resort|accommodation/.test(s)) return 'hotel';
    if (/transfer|transport|cab|taxi|coach/.test(s)) return 'transfer';
    if (/visa/.test(s)) return 'visa';
    return 'activity';
  }

  /* One Excel row, or null if it carries no usable name. */
  function rowToItem(row) {
    var name = pick(row, HEADERS.name);
    if (!name) return null;
    var priceRaw = pick(row, HEADERS.price);
    return {
      category: normaliseCategory(pick(row, HEADERS.category)),
      name: name,
      description: pick(row, HEADERS.description),
      price: priceRaw ? window.GGParser.toNumber(priceRaw) : null,
      meta: pick(row, HEADERS.meta),
      notes: pick(row, HEADERS.notes),
      image: pick(row, HEADERS.image)
    };
  }

  /* Each worksheet is one destination - "har destination k cost sheet alg
     alg", a separate sheet per place, exactly as asked for. */
  function workbookToLibrary(wb) {
    var lib = {};
    wb.SheetNames.forEach(function (sheetName) {
      var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      var items = rows.map(rowToItem).filter(Boolean);
      if (items.length) lib[sheetName.trim()] = items;
    });
    return lib;
  }

  function readWorkbookFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = window.XLSX.read(buf, { type: 'array' });
      return workbookToLibrary(wb);
    });
  }

  /* A blank starter workbook, so the client always has an exact format to
     copy rather than guessing at column names. */
  function downloadTemplate() {
    var header = ['Category', 'Name', 'Description', 'Price', 'Meta', 'Notes', 'Image URL'];
    var sample = [
      ['Hotel', 'Sky Lark Hotel, Hanoi', 'Superior Room, Double Bed', 21533, '2 nights', 'Breakfast included', ''],
      ['Transfer', 'Airport to Hotel', 'Private transfer, up to 5 pax', 2100, '', '', ''],
      ['Activity', 'Singapore City Tour', 'Guided half-day tour of the city', 11590, '2 adults', '', ''],
      ['Visa', 'Tourist Visa, 30 Days', 'Single entry, minimal documentation', 3200, '', 'Processed in 5 working days', '']
    ];
    var wb = window.XLSX.utils.book_new();
    ['Hanoi', 'Danang'].forEach(function (name, i) {
      var ws = window.XLSX.utils.aoa_to_sheet([header].concat(i === 0 ? sample : sample.slice(0, 2)));
      window.XLSX.utils.book_append_sheet(wb, ws, name);
    });
    window.XLSX.writeFile(wb, 'ghoom-gali-cost-sheet-template.xlsx');
  }

  /* ---- persistence ---------------------------------------------------- */

  function loadLibrary() {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveLibrary(lib) {
    try { localStorage.setItem(STORE, JSON.stringify(lib)); } catch (e) { /* not fatal */ }
  }

  function mergeLibrary(existing, incoming) {
    var out = {};
    Object.keys(existing).forEach(function (d) { out[d] = existing[d].slice(); });
    Object.keys(incoming).forEach(function (d) {
      out[d] = (out[d] || []).concat(incoming[d]);
    });
    return out;
  }

  window.GGLibrary = {
    CATS: CATS,
    CAT_LABEL: CAT_LABEL,
    readWorkbookFile: readWorkbookFile,
    downloadTemplate: downloadTemplate,
    loadLibrary: loadLibrary,
    saveLibrary: saveLibrary,
    mergeLibrary: mergeLibrary
  };
})();
