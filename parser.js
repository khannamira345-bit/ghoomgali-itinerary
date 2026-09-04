/* ==========================================================================
   Ghoomgali Itinerary Maker - raw text parser (v2)
   Rule based, runs entirely in the browser. No API key, no network, no limits.

   Understands a light, forgiving markup:
     Day 3 | Nov 24 · Hanoi → Danang | Hanoi to Danang
     [Coordinated with domestic flight]        eyebrow above a card
     Hanoi → Danang Airport Transfers | 4200   title | price
     Hotel check-out, transfer to HAN...       description
     - Private transfer vehicle                bullet
     = INR 2,100 + INR 2,100                   cost basis note
   Sections: Hotels, Pricing, Inclusions, Exclusions, Notes.
   Everything is optional and anything unrecognised still becomes a card.
   ========================================================================== */
(function () {
  'use strict';

  var MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|' +
               'jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

  var WORD_NUM = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
                  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
                  seventeen:17,eighteen:18,nineteen:19,twenty:20};

  var RE = {
    dayHead:     new RegExp('^\\s*day\\s*[-–—:.#]?\\s*(\\d{1,2})\\b\\s*(.*)$', 'i'),
    dayHeadOrd:  new RegExp('^\\s*(\\d{1,2})(?:st|nd|rd|th)\\s+day\\b\\s*(.*)$', 'i'),
    dayHeadWord: new RegExp('^\\s*day\\s+(' + Object.keys(WORD_NUM).join('|') + ')\\b\\s*(.*)$', 'i'),

    bullet:  /^\s*[-–—*•·▪●]\s+/,
    note:    /^\s*=\s*/,
    eyebrow: /^\s*\[(.+?)\]\s*$/,

    money:   /(?:₹|Rs\.?|INR|USD|\$|EUR|€)\s?([\d][\d,]*(?:\.\d{1,2})?)/i,
    bareNum: /^\s*([\d][\d,]{2,})\s*$/,
    pct:     /(\d{1,2}(?:\.\d+)?)\s*%/,

    dateAny: new RegExp('\\b(\\d{1,2}\\s*(?:st|nd|rd|th)?\\s+(?:' + MONTHS + ')\\w*(?:\\s+\\d{2,4})?|' +
                        '(?:' + MONTHS + ')\\w*\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?|' +
                        '\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4})\\b', 'i'),

    // lines that read as a timing / framing label rather than a title
    timingish: new RegExp('^(?:\\d{1,2}[:.]\\d{2}\\s*[-–—]\\s*\\d{1,2}[:.]\\d{2}' +
                          '|\\d{1,2}[:.]\\d{2}\\s*(?:am|pm)?' +
                          '|full\\s+day|half\\s+day|on\\s+arrival|morning|afternoon|evening|overnight|' +
                          'early\\s+morning|late\\s+evening|all\\s+day)\\b', 'i'),

    // A colon or dash may be followed by trailing text ("Inclusions - what's covered");
    // that text is ignored, but its presence must not stop the heading matching.
    secHotels: /^\s*(?:hotels?|accommodations?|stays?|where\s+you\s+stay)\s*(?:[:\-–—]\s*.*)?$/i,
    secPrice:  /^\s*(?:pricing|price|cost\s+summary|costing|charges|totals?)\s*(?:[:\-–—]\s*.*)?$/i,
    secIncl:   /^\s*(?:inclusions?|includes?|included|what'?s\s+included|(?:cost|package|price|tour)\s+includes?)\s*(?:[:\-–—]\s*.*)?$/i,
    secExcl:   /^\s*(?:exclusions?|excludes?|excluded|not\s+included|what'?s\s+not\s+included|(?:cost|package|price|tour)\s+excludes?)\s*(?:[:\-–—]\s*.*)?$/i,
    secNote:   /^\s*(?:notes?|important\s+notes?|please\s+note|good\s+to\s+know|terms(?:\s+(?:and|&)\s+conditions)?)\s*(?:[:\-–—]\s*.*)?$/i
  };

  var THEME_TONES = ['mint', 'chai', 'lantern'];

  /* A trip's lead accent, chosen deterministically from its title so the same
     trip keeps the same colour on a re-generate, but different trips differ. */
  function hashTone(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return THEME_TONES[Math.abs(h) % THEME_TONES.length];
  }

  function autoTheme(meta) {
    var seed = ((meta && meta.title) || '') + ((meta && meta.titleAccent) || '');
    return hashTone(seed || 'ghoomgali');
  }

  /* ---- helpers ---------------------------------------------------------- */

  function splitPipes(s) {
    return s.split('|').map(function (p) { return p.trim(); }).filter(function (p) { return p; });
  }

  function toNumber(s) {
    if (s == null) return null;
    var m = String(s).match(RE.money) || String(s).match(RE.bareNum);
    if (!m) return null;
    var n = parseFloat(String(m[1]).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  /* Indian digit grouping - correct for an INR-denominated brand. */
  function groupINR(n) {
    var s = String(Math.round(Math.abs(n)));
    if (s.length <= 3) return s;
    var last3 = s.slice(-3);
    var rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }

  function money(n, currency) {
    if (n == null || !isFinite(n)) return '';
    return (currency || 'INR') + ' ' + groupINR(n);
  }

  function dayHeading(line) {
    var m = line.match(RE.dayHead);
    if (m) return { n: parseInt(m[1], 10), rest: m[2] || '' };
    m = line.match(RE.dayHeadOrd);
    if (m) return { n: parseInt(m[1], 10), rest: m[2] || '' };
    m = line.match(RE.dayHeadWord);
    if (m) return { n: WORD_NUM[m[1].toLowerCase()], rest: m[2] || '' };
    return null;
  }

  function stripEdges(s) {
    return s.replace(/^[\s\-–—:|,.]+|[\s\-–—:|,]+$/g, '').trim();
  }

  /* ---- main ------------------------------------------------------------- */

  function parse(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');

    var model = {
      meta: { currency: 'INR' },
      cover: { image: '' },
      hotels: [],
      days: [],
      pricing: { margin: null, gstPct: null, tcsPct: null, extras: [] },
      inclusions: [],
      exclusions: [],
      notes: '',
      preamble: []
    };

    var mode = 'top';
    var day = null;
    var card = null;
    var hotel = null;
    var pendingEyebrow = '';
    var noteLines = [];

    function closeCard() { card = null; }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) { closeCard(); hotel = null; return; }

      var isBullet = RE.bullet.test(line);
      var isNote = RE.note.test(line);
      var body = line.replace(RE.bullet, '').replace(RE.note, '').trim();
      if (!body) return;

      /* -- day heading -- */
      var head = !isBullet && dayHeading(body);
      if (head) {
        var parts = splitPipes(head.rest);
        var when = '', title = '';
        if (parts.length >= 2) { when = parts[0]; title = parts.slice(1).join(' · '); }
        else {
          var rest = stripEdges(head.rest);
          var dm = rest.match(RE.dateAny);
          if (dm) {
            when = rest.slice(0, dm.index + dm[0].length).replace(/^[\s\-–—:|,]+/, '').trim();
            title = stripEdges(rest.slice(dm.index + dm[0].length));
            // "Nov 22 · Hanoi" - pull a trailing place into the label
            var tail = title.split(/\s*·\s*/);
            if (tail.length > 1) { when += ' · ' + tail[0]; title = tail.slice(1).join(' · '); }
          } else title = rest;
        }
        day = {
          n: head.n,
          when: when || '',
          title: title || ('Day ' + head.n),
          image: '',
          items: [],
          total: null
        };
        model.days.push(day);
        mode = 'day';
        closeCard();
        pendingEyebrow = '';
        return;
      }

      /* -- section switches -- */
      if (!isBullet) {
        if (RE.secHotels.test(body)) { mode = 'hotels'; closeCard(); hotel = null; return; }
        if (RE.secPrice.test(body))  { mode = 'price';  closeCard(); return; }
        if (RE.secIncl.test(body))   { mode = 'incl';   closeCard(); return; }
        if (RE.secExcl.test(body))   { mode = 'excl';   closeCard(); return; }
        if (RE.secNote.test(body))   { mode = 'note';   closeCard(); return; }
      }

      /* -- simple list sections -- */
      if (mode === 'incl') { model.inclusions.push(stripEdges(body)); return; }
      if (mode === 'excl') { model.exclusions.push(stripEdges(body)); return; }
      if (mode === 'note') { noteLines.push(body); return; }

      /* -- hotels -- */
      if (mode === 'hotels') {
        if (isBullet && hotel) { hotel.bullets.push(body); return; }
        hotel = makeHotel(body);
        model.hotels.push(hotel);
        return;
      }

      /* -- pricing -- */
      if (mode === 'price') {
        applyPricing(model.pricing, body);
        return;
      }

      /* -- before the first day -- */
      if (mode === 'top' || !day) { model.preamble.push(body); return; }

      /* -- inside a day -- */
      var eb = body.match(RE.eyebrow);
      if (eb && !isBullet) { pendingEyebrow = eb[1].trim(); closeCard(); return; }

      if (isBullet && card) { card.bullets.push(body); return; }
      if (isNote && card) { card.note = body; return; }

      // a day total stated explicitly
      var dt = body.match(/^day\s*\d*\s*total\b\s*[:|-]?\s*(.+)$/i);
      if (dt) { day.total = toNumber(dt[1]); closeCard(); return; }

      // a bare timing line becomes the eyebrow for the card that follows
      if (!card && !isBullet && RE.timingish.test(body) && body.length < 70 && !RE.money.test(body)) {
        pendingEyebrow = body;
        return;
      }

      if (card && !card.detail && !card.bullets.length && !isBullet) {
        card.detail = body;                      // the line under a title
        return;
      }

      card = makeCard(body, pendingEyebrow);
      pendingEyebrow = '';
      day.items.push(card);
    });

    model.notes = noteLines.join(' ');
    finish(model);
    return model;
  }

  /* ---- builders --------------------------------------------------------- */

  function makeCard(text, eyebrow) {
    var parts = splitPipes(text);
    var title = parts[0] || text;
    var price = null;

    if (parts.length > 1) {
      price = toNumber(parts[parts.length - 1]);
      if (price != null) parts.pop();
      title = parts[0];
    }
    if (price == null) {
      var m = title.match(RE.money);
      if (m) {
        price = toNumber(m[0]);
        title = stripEdges(title.replace(m[0], ''));
      }
    }
    return {
      eyebrow: eyebrow || '',
      title: title || text,
      detail: parts.length > 2 ? parts.slice(1).join(' · ') : '',
      bullets: [],
      note: '',
      price: price,
      image: ''
    };
  }

  function makeHotel(text) {
    var p = splitPipes(text);
    var h = { city: '', name: '', dates: '', nights: '', price: null, bullets: [], badge: '', image: '' };

    if (p.length >= 2) {
      h.city = p[0];
      h.name = p[1];
      p.slice(2).forEach(function (bit) {
        var n = toNumber(bit);
        if (n != null && RE.money.test(bit)) { h.price = n; return; }
        if (/night/i.test(bit)) { h.nights = bit; return; }
        if (RE.dateAny.test(bit) || /[–—-]/.test(bit)) { h.dates = bit; return; }
        if (n != null) { h.price = n; return; }
        if (!h.dates) h.dates = bit;
      });
    } else {
      h.name = text;
      var m = text.match(RE.money);
      if (m) { h.price = toNumber(m[0]); h.name = stripEdges(text.replace(m[0], '')); }
    }
    return h;
  }

  function applyPricing(pricing, text) {
    var p = splitPipes(text);
    var label = p[0] || text;
    var value = p.length > 1 ? p.slice(1).join(' ') : text;

    if (/margin/i.test(label))  { pricing.margin = toNumber(value); return; }
    if (/\bgst\b/i.test(label)) { pricing.gstPct = pctOf(value); return; }
    if (/\btcs\b/i.test(label)) { pricing.tcsPct = pctOf(value); return; }

    var n = toNumber(value);
    if (n != null && p.length > 1) pricing.extras.push({ label: label, amount: n });
  }

  function pctOf(s) {
    var m = String(s).match(RE.pct);
    if (m) return parseFloat(m[1]);
    var n = toNumber(s);
    return n != null && n <= 100 ? n : null;
  }

  /* ---- totals and meta -------------------------------------------------- */

  function finish(model) {
    // "Breakfast included" reads better as a pill than as another room type.
    model.hotels.forEach(function (h) {
      for (var i = h.bullets.length - 1; i >= 0; i--) {
        if (/^(?:breakfast|half board|full board|all meals|meals)\b.*\bincluded\b/i.test(h.bullets[i])) {
          h.badge = h.bullets.splice(i, 1)[0];
          break;
        }
      }
    });

    model.days.forEach(function (d) {
      if (!d.title || /^day\s*\d+$/i.test(d.title)) {
        d.title = (d.items[0] && d.items[0].title) || ('Day ' + d.n);
      }
    });
    deriveMeta(model);
    recompute(model);
  }

  /* Re-derive every total from the current prices. Safe to call after an
     edit in the preview - it touches numbers only, never wording. */
  function recompute(model) {
    model.days.forEach(function (d) {
      if (d.totalLocked) return;
      var sum = 0, any = false;
      d.items.forEach(function (it) { if (it.price != null) { sum += it.price; any = true; } });
      d.total = any ? sum : d.total;
    });

    // Re-read the child count from meta.children every time, so editing that
    // field by hand immediately affects the per-person split below.
    var childMatch = String(model.meta.children || '').match(/\d+/);
    model.meta.childCount = childMatch ? parseInt(childMatch[0], 10) : 0;

    var p = model.pricing;
    p.activityTotal = model.days.reduce(function (a, d) { return a + (d.total || 0); }, 0);
    p.hotelTotal = model.hotels.reduce(function (a, h) { return a + (h.price || 0); }, 0);
    p.baseCost = p.activityTotal + p.hotelTotal;
    p.extrasTotal = p.extras.reduce(function (a, e) { return a + e.amount; }, 0);
    p.subtotal = p.baseCost + (p.margin || 0) + p.extrasTotal;
    p.gst = p.gstPct ? p.subtotal * p.gstPct / 100 : 0;
    p.tcs = p.tcsPct ? p.subtotal * p.tcsPct / 100 : 0;
    p.grandTotal = p.subtotal + p.gst + p.tcs;

    var heads = (model.meta.partyCount || 0) + (model.meta.childCount || 0);
    p.heads = heads || null;
    p.perPerson = heads ? p.grandTotal / heads : null;

    if (p.grandTotal) model.meta.total = money(p.grandTotal, model.meta.currency);
  }

  function deriveMeta(model) {
    var meta = model.meta;
    var pre = model.preamble;

    if (pre.length && !meta.title) {
      var t = pre[0].trim();
      var star = t.match(/^(.*?)\*(.+?)\*(.*)$/);      // Vietnam *Escape.*
      if (star) {
        meta.title = (star[1] + star[3]).trim();
        meta.titleAccent = star[2].trim();
      } else {
        var words = t.split(/\s+/);
        if (words.length > 1) {
          meta.titleAccent = words.pop();
          meta.title = words.join(' ');
        } else meta.title = t;
      }
    }
    if (pre.length > 1 && !meta.subtitle) meta.subtitle = pre[1].trim();

    var joined = pre.join(' | ');

    var dates = joined.match(new RegExp(
      '((?:' + MONTHS + ')\\w*\\s*\\d{1,2}\\s*[–—-]\\s*(?:(?:' + MONTHS + ')\\w*\\s*)?\\d{1,2}' +
      '|\\d{1,2}\\s*(?:' + MONTHS + ')\\w*\\s*[–—-]\\s*\\d{1,2}\\s*(?:' + MONTHS + ')\\w*)', 'i'));
    if (dates && !meta.dates) meta.dates = dates[0].replace(/\s+/g, ' ').trim();
    else if (!meta.dates) {
      var one = joined.match(RE.dateAny);
      if (one) meta.dates = one[0].trim();
    }

    var dur = joined.match(/(\d+)\s*d\w*\s*[\/&]?\s*(\d+)\s*n\w*|(\d+)\s*n\w*\s*[\/&]?\s*(\d+)\s*d\w*/i);
    if (dur && !meta.duration) meta.duration = dur[0].replace(/\s+/g, '').toUpperCase().replace(/([DN])/g, '$1 ').replace(/\s*\/\s*/, ' / ').trim();

    var pax = joined.match(/(\d+)\s*(adults?|pax|people|persons?|travell?ers?|guests?)/i);
    if (pax) {
      meta.partyCount = parseInt(pax[1], 10);
      if (!meta.party) meta.party = pax[1] + ' ' + (/adult/i.test(pax[2]) ? 'Adults' : 'Travelers');
    }

    var kids = joined.match(/(\d+)\s*(child(?:ren)?|kids?)/i);
    if (kids && !meta.children) {
      var kn = parseInt(kids[1], 10);
      meta.children = kids[1] + ' ' + (kn === 1 ? 'Child' : 'Children');
    }

    var cities = joined.match(/(\d+)\s*(cities|citys|destinations?|places?)/i);
    if (cities && !meta.destinations) meta.destinations = cities[1] + ' ' + 'Cities';

    // Fall back to counting the distinct places named in the hotel list.
    if (!meta.destinations && model.hotels.length) {
      var set = {};
      model.hotels.forEach(function (h) { if (h.city) set[h.city.toLowerCase()] = 1; });
      var c = Object.keys(set).length;
      if (c) meta.destinations = c + ' ' + (c === 1 ? 'City' : 'Cities');
    }
    if (!meta.duration && model.days.length) {
      meta.duration = model.days.length + 'D / ' + Math.max(0, model.days.length - 1) + 'N';
    }

    // Give every itinerary its own lead accent from the brand palette, so two
    // trips don't default to the same mint-heavy look.
    if (!meta.theme) meta.theme = autoTheme(meta);

    // Sensible default copy, all of it editable in the preview afterwards.
    var name = [meta.title, meta.titleAccent].filter(Boolean).join(' ').replace(/[.]+$/, '');
    if (!meta.overviewLede) {
      meta.overviewLede = 'A complete overview of the ' + (name || 'trip') +
        ' package — travel dates, party size and accommodation' +
        (meta.destinations ? ' across all ' + meta.destinations.toLowerCase() : '') + '.';
    }
    if (!meta.pricingLede) {
      meta.pricingLede = 'Complete cost breakdown for the ' +
        (meta.duration ? meta.duration + ' ' : '') + (name || '') +
        ' package' + (meta.party ? ', covering all ' + meta.party.toLowerCase() : '') + '.';
    }
    if (!meta.closing) {
      meta.closing = '“The world has highways. We know the galis.” Thank you for planning ' +
        'your journey with Ghoom Gali — we can’t wait to help you explore every lane of it.';
    }
  }

  window.GGParser = {
    parse: parse,
    recompute: recompute,
    money: money,
    groupINR: groupINR,
    toNumber: toNumber,
    autoTheme: autoTheme,
    THEME_TONES: THEME_TONES
  };
})();
