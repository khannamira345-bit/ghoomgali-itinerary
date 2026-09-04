/* ==========================================================================
   Ghoomgali Itinerary Maker - document renderer (v2)
   Cover, trip overview with accommodation, day-by-day cards flowed two days
   to a page, optional inclusions, and a cost summary.
   Overflow always opens a continuation page, so nothing is ever clipped.
   ========================================================================== */
(function () {
  'use strict';

  var PAGE_BODY_H = 937;          // 1123 - 104 top - 82 bottom
  var L = window.GG.logos;
  var P = window.GGParser;
  var TONES = P.THEME_TONES || ['mint', 'chai', 'lantern'];

  /* Rotate the tone list so it starts at the itinerary's own lead accent -
     day 1 (and hotel 1) picks up the theme colour, later ones still cycle. */
  function tonesFrom(theme) {
    var i = TONES.indexOf(theme);
    if (i < 0) i = 0;
    return TONES.slice(i).concat(TONES.slice(0, i));
  }

  /* ---- DOM helpers ------------------------------------------------------ */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function edit(tag, cls, text, path, placeholder) {
    var n = el(tag, cls, text || '');
    n.setAttribute('contenteditable', 'true');
    n.dataset.path = path;
    if (placeholder) n.dataset.placeholder = placeholder;
    return n;
  }

  function img(src, cls) {
    var n = document.createElement('img');
    n.src = src;
    n.alt = '';
    if (cls) n.className = cls;
    return n;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* A photo area: shows the image, or a dashed slot inviting one. */
  function photo(cls, url, path, label) {
    var n = el('div', cls + (url ? ' has-photo' : ''));
    n.dataset.photo = path;
    if (url) n.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    else {
      var s = el('div', 'photo-slot', label || 'Add photo');
      s.dataset.photo = path;
      n.appendChild(s);
    }
    return n;
  }

  function bulletList(items, basePath) {
    var ul = el('ul', 'bullets');
    items.forEach(function (b, i) {
      ul.appendChild(edit('li', null, b, basePath + '.' + i, 'Detail'));
    });
    return ul;
  }

  /* ---- page scaffolding ------------------------------------------------- */

  function newPage(model, opts) {
    var page = el('div', 'page' + (opts.dark ? ' page--dark' : ''));

    if (!opts.bare) {
      var head = el('div', 'page-head');
      var left = el('div', 'page-head-brand');
      left.appendChild(img(opts.dark ? L.markPaper : L.markAbyss));
      head.appendChild(left);

      var label = el('div', 'page-head-label');
      label.appendChild(el('span', 'l1', opts.l1 || ''));
      label.appendChild(el('span', 'l2', opts.l2 || ''));
      head.appendChild(label);
      page.appendChild(head);

      var body = el('div', 'page-body');
      page.appendChild(body);
      page._body = body;
    }

    var foot = el('div', 'page-foot');
    var title = [model.meta.title, model.meta.titleAccent]
      .filter(Boolean).join(' ').replace(/[.]+$/, '') || 'Itinerary';
    foot.appendChild(el('span', null, opts.dark ? window.GG.tagline : 'Ghoom Gali · ' + title));
    foot.appendChild(el('span', 'mid', opts.dark ? '' : window.GG.tagline));
    foot.appendChild(el('span', 'page-no'));
    page.appendChild(foot);

    return page;
  }

  /* ---- cover ------------------------------------------------------------ */

  function coverPage(model) {
    var m = model.meta;
    var page = newPage(model, {
      dark: true,
      l1: 'Travel Itinerary',
      l2: m.preparedOn ? 'Prepared ' + m.preparedOn : ''
    });

    var band = photo('cover-photo', model.cover.image, 'cover.image', 'Add a cover photo');
    page.insertBefore(band, page.firstChild);
    if (model.cover.image) {
      var veil = el('div', 'cover-veil');
      page.insertBefore(veil, band.nextSibling);
    }

    page.appendChild(el('div', 'cover-arc a1'));
    page.appendChild(el('div', 'cover-arc a2'));

    var inner = el('div', 'cover-inner');
    inner.appendChild(img(L.lockupWhite, 'cover-logo'));

    var h1 = el('h1', 'cover-title');
    h1.appendChild(edit('span', null, m.title, 'meta.title', 'Trip title'));
    h1.appendChild(document.createTextNode(' '));
    var accent = edit('em', null, m.titleAccent, 'meta.titleAccent', 'Accent');
    h1.appendChild(accent);
    inner.appendChild(h1);

    inner.appendChild(edit('p', 'cover-sub', m.subtitle, 'meta.subtitle', 'A one-line description of the trip'));

    var stats = el('div', 'cover-stats');
    var coverRows = [
      ['meta.dates', m.dates, 'Travel dates'],
      ['meta.duration', m.duration, 'Duration'],
      ['meta.party', m.party, 'Travelers'],
      ['meta.destinations', m.destinations, 'Destinations']
    ];
    if (m.children) coverRows.splice(3, 0, ['meta.children', m.children, 'Children']);
    coverRows.forEach(function (row) {
      var d = el('div');
      d.appendChild(edit('div', 'v', row[1], row[0], '—'));
      d.appendChild(el('div', 'k', row[2]));
      stats.appendChild(d);
    });
    inner.appendChild(stats);

    page.insertBefore(inner, page.querySelector('.page-foot'));
    return page;
  }

  /* ---- overview blocks -------------------------------------------------- */

  function overviewBlocks(model) {
    var m = model.meta;
    var blocks = [];

    var head = el('div');
    head.appendChild(el('h2', 'sec-title', 'Your journey at a glance'));
    head.appendChild(edit('p', 'sec-lede', m.overviewLede,
      'meta.overviewLede', 'A short summary of the package — dates, party size and where they stay.'));

    var stats = el('div', 'stats');
    var overviewRows = [
      ['meta.duration', m.duration, 'Duration'],
      ['meta.party', m.party, 'Travelers'],
      ['meta.destinations', m.destinations, 'Destinations'],
      ['meta.total', m.total, 'Grand total']
    ];
    if (m.children) overviewRows.splice(2, 0, ['meta.children', m.children, 'Children']);
    overviewRows.forEach(function (row) {
      var s = el('div', 'stat');
      s.appendChild(edit('div', 'v', row[1], row[0], '—'));
      s.appendChild(el('div', 'k', row[2]));
      stats.appendChild(s);
    });
    head.appendChild(stats);

    if (model.hotels.length > 1) head.appendChild(routeStrip(model));
    blocks.push({ node: head });

    if (model.hotels.length) {
      blocks.push({ node: el('h3', 'sub-title', 'Accommodation') });
      var hotelTones = tonesFrom(model.meta.theme);
      model.hotels.forEach(function (h, i) {
        blocks.push({ node: hotelCard(h, i, hotelTones) });
      });
    }
    return blocks;
  }

  function routeStrip(model) {
    var strip = el('div', 'route');
    model.hotels.forEach(function (h, i) {
      if (i) strip.appendChild(el('span', 'arrow', '→'));
      var leg = el('div', 'leg');
      leg.appendChild(edit('div', 'city', h.city || h.name, 'hotels.' + i + '.city', 'City'));
      leg.appendChild(edit('div', 'when', h.dates, 'hotels.' + i + '.dates', 'Dates'));
      strip.appendChild(leg);
    });
    return strip;
  }

  function hotelCard(h, i, tones) {
    var base = 'hotels.' + i;
    var tone = 'card--' + (tones || TONES)[i % (tones || TONES).length];
    var card = el('div', 'card ' + tone + (h.image ? ' has-photo' : ''));
    card.dataset.card = base;

    var body = el('div', 'card-body');
    body.appendChild(edit('div', 'card-eyebrow', h.city, base + '.city', 'City'));
    body.appendChild(edit('h4', 'card-title', h.name, base + '.name', 'Hotel name'));

    var meta = h.meta != null ? h.meta : [h.dates, h.nights].filter(Boolean).join(' · ');
    body.appendChild(edit('p', 'card-meta', meta, base + '.meta', 'Dates · nights'));

    if (h.bullets.length) body.appendChild(bulletList(h.bullets, base + '.bullets'));
    if (h.badge) body.appendChild(el('span', 'badge', h.badge));
    card.appendChild(body);

    if (h.price != null) {
      card.appendChild(edit('div', 'card-price', P.money(h.price, 'INR'), base + '.priceText'));
    }
    card.appendChild(photo('card-photo', h.image, base + '.image', 'Add hotel photo'));
    return card;
  }

  /* ---- day blocks ------------------------------------------------------- */

  /* Colour follows the place, the way the reference deck does: a new
     destination picks up the next brand accent. */
  function dayTones(days, theme) {
    var tones = tonesFrom(theme);
    var out = [], idx = 0, prev = null;
    days.forEach(function (d) {
      var key = String(d.when || d.title || '').split('·').pop().trim().toLowerCase();
      if (prev !== null && key !== prev) idx = (idx + 1) % tones.length;
      prev = key;
      out.push(tones[idx]);
    });
    return out;
  }

  function dayBlocks(model) {
    var tones = dayTones(model.days, model.meta.theme);
    var blocks = [];

    model.days.forEach(function (d, i) {
      var base = 'days.' + i;
      var tone = tones[i];

      var head = el('div', 'day-head');
      head.appendChild(el('div', 'day-n day-n--' + tone, pad2(d.n || i + 1)));
      var txt = el('div');
      txt.appendChild(edit('div', 'day-when', d.when, base + '.when', 'Date · place'));
      txt.appendChild(edit('h3', 'day-title', d.title, base + '.title', 'Day title'));
      head.appendChild(txt);

      // Offered as a floating button rather than an empty band, so a day
      // without a banner takes exactly the same height in preview and PDF.
      var btn = el('div', 'day-photo-btn', d.image ? 'Replace day photo' : '+ Day photo');
      btn.dataset.photo = base + '.image';
      head.appendChild(btn);
      blocks.push({ node: head, day: i, keepWithNext: true });

      if (d.image) {
        blocks.push({
          node: photo('day-banner', d.image, base + '.image'),
          day: i, keepWithNext: true
        });
      }

      d.items.forEach(function (it, j) {
        blocks.push({ node: activityCard(it, base + '.items.' + j, tone), day: i });
      });

      if (d.total != null) {
        var total = el('div', 'day-total day-total--' + tone);
        total.appendChild(el('div', 'k', 'Day ' + pad2(d.n || i + 1) + ' total'));
        total.appendChild(edit('div', 'v', P.money(d.total, 'INR'), base + '.totalText'));
        blocks.push({ node: total, day: i });
      }
    });

    return blocks;
  }

  function activityCard(it, base, tone) {
    var card = el('div', 'card card--' + tone + (it.image ? ' has-photo' : ''));
    card.dataset.card = base;

    var body = el('div', 'card-body');
    body.appendChild(edit('div', 'card-eyebrow', it.eyebrow, base + '.eyebrow', 'Timing or note'));
    body.appendChild(edit('h4', 'card-title', it.title, base + '.title', 'What happens'));
    body.appendChild(edit('p', 'card-detail', it.detail, base + '.detail', 'A sentence of description'));

    if (it.bullets.length) body.appendChild(bulletList(it.bullets, base + '.bullets'));
    body.appendChild(edit('p', 'card-note', it.note, base + '.note', ''));
    card.appendChild(body);

    if (it.price != null) {
      card.appendChild(edit('div', 'card-price', P.money(it.price, 'INR'), base + '.priceText'));
    }
    card.appendChild(photo('card-photo', it.image, base + '.image', 'Add photo'));
    return card;
  }

  /* ---- extras ----------------------------------------------------------- */

  function inclusionsBlocks(model) {
    var blocks = [];
    var head = el('div');
    head.appendChild(el('h2', 'sec-title', 'Inclusions & exclusions'));
    head.appendChild(el('p', 'sec-lede', 'What this package covers, and what it does not.'));
    blocks.push({ node: head });

    var hasIn = model.inclusions.length > 0;
    var hasEx = model.exclusions.length > 0;
    var cols = el('div', 'cols' + (hasIn && hasEx ? '' : ' cols--single'));

    if (hasIn) {
      var a = el('div');
      a.appendChild(el('div', 'col-title in', 'Included'));
      var ul1 = el('ul', 'tick in');
      model.inclusions.forEach(function (t, i) {
        ul1.appendChild(edit('li', null, t, 'inclusions.' + i, 'Add an inclusion'));
      });
      a.appendChild(ul1);
      cols.appendChild(a);
    }

    if (hasEx) {
      var b = el('div');
      b.appendChild(el('div', 'col-title ex', 'Not included'));
      var ul2 = el('ul', 'tick ex');
      model.exclusions.forEach(function (t, i) {
        ul2.appendChild(edit('li', null, t, 'exclusions.' + i, 'Add an exclusion'));
      });
      b.appendChild(ul2);
      cols.appendChild(b);
    }

    blocks.push({ node: cols });
    return blocks;
  }

  function notesBlocks(model) {
    var blocks = [];
    var head = el('div');
    head.appendChild(el('h2', 'sec-title', 'Good to know'));
    blocks.push({ node: head });

    var nb = el('div', 'notes-block');
    nb.appendChild(el('h4', null, 'Please note'));
    nb.appendChild(edit('p', null, model.notes, 'notes', 'Visas, insurance, altitude, anything worth flagging'));
    blocks.push({ node: nb });
    return blocks;
  }

  /* ---- pricing ---------------------------------------------------------- */

  function pricingBlocks(model) {
    var p = model.pricing;
    var m = model.meta;
    var blocks = [];

    var head = el('div');
    head.appendChild(el('h2', 'sec-title', 'Pricing summary'));
    head.appendChild(edit('p', 'sec-lede', m.pricingLede, 'meta.pricingLede',
      'Complete cost breakdown for the package.'));
    blocks.push({ node: head });

    var rows = el('div');
    function row(container, label, amount, hi) {
      if (amount == null || !isFinite(amount)) return;
      var r = el('div', 'price-row' + (hi ? ' price-row--hi' : ''));
      r.appendChild(el('div', 'k', label));
      r.appendChild(el('div', 'v', P.money(amount, 'INR')));
      container.appendChild(r);
    }

    var span = model.days.length ? ' (Days 1–' + model.days.length + ')' : '';
    if (p.activityTotal) row(rows, 'Total activity cost' + span, p.activityTotal);
    if (p.hotelTotal) row(rows, 'Total accommodation cost (' + model.hotels.length + ' hotels)', p.hotelTotal);
    if (p.activityTotal && p.hotelTotal) row(rows, 'Total base cost', p.baseCost, true);
    p.extras.forEach(function (e) { row(rows, e.label, e.amount); });
    if (p.margin) row(rows, 'Margin', p.margin);
    if (p.margin || p.extrasTotal) row(rows, 'Subtotal', p.subtotal, true);
    blocks.push({ node: rows });

    // GST and TCS get their own clearly separated block rather than blending
    // into the cost-breakdown list above.
    if (p.gst || p.tcs) {
      blocks.push({ node: el('h3', 'sub-title', 'Taxes & charges') });
      var taxRows = el('div', 'tax-rows');
      if (p.gst) row(taxRows, 'GST (' + p.gstPct + '% of subtotal)', p.gst);
      if (p.tcs) row(taxRows, 'TCS (' + p.tcsPct + '% of subtotal)', p.tcs);
      blocks.push({ node: taxRows });
    }

    if (p.grandTotal) {
      var partyLabel = [m.party, m.children].filter(Boolean).join(' · ');
      var grand = el('div', 'grand');
      grand.appendChild(el('div', 'k',
        'Grand total' + (partyLabel ? ' · for ' + partyLabel.toLowerCase() : '')));
      grand.appendChild(el('div', 'v', P.money(p.grandTotal, 'INR')));
      blocks.push({ node: grand });

      if (p.perPerson) {
        var pp = el('div', 'per-person');
        pp.appendChild(el('div', 'k',
          'Cost per person (' + P.money(p.grandTotal, 'INR') + ' ÷ ' + p.heads + ')'));
        pp.appendChild(el('div', 'v', P.money(p.perPerson, 'INR')));
        blocks.push({ node: pp });
      }
    }

    blocks.push({
      node: edit('p', 'closing-note', model.meta.closing, 'meta.closing',
        'A closing line to sign off on.')
    });
    return blocks;
  }

  /* ---- flow ------------------------------------------------------------- */

  /* makePage() must return a page already in the document: a detached element
     reports scrollHeight 0, which would defeat every measurement here. */
  function flow(makePage, blocks) {
    var page = makePage();
    var body = page._body;
    var placed = 0;

    for (var i = 0; i < blocks.length; i++) {
      var entry = blocks[i];
      body.appendChild(entry.node);

      if (body.scrollHeight <= PAGE_BODY_H) {
        entry.page = page;
        placed++;
        continue;
      }
      if (placed === 0) { entry.page = page; placed++; continue; }

      body.removeChild(entry.node);

      // A day heading must never end a page on its own.
      var rewind = [];
      while (placed > 0 && blocks[i - 1] && blocks[i - 1].keepWithNext &&
             blocks[i - 1].page === page) {
        i--;
        body.removeChild(blocks[i].node);
        rewind.unshift(blocks[i]);
        placed--;
      }

      page = makePage();
      body = page._body;
      placed = 0;
      rewind.forEach(function (b) { body.appendChild(b.node); b.page = page; placed++; });
      body.appendChild(entry.node);
      entry.page = page;
      placed++;
    }
  }

  /* ---- entry point ------------------------------------------------------ */

  function render(model, host) {
    host.textContent = '';
    var pages = [];

    // The itinerary's lead accent, available to doc.css as --accent so the
    // handful of document-wide accents (stat values, badges, grand total)
    // follow it without every rule needing a JS-driven tone class.
    var accentTone = TONES.indexOf(model.meta.theme) > -1 ? model.meta.theme : 'mint';
    host.style.setProperty('--accent', window.GG.colour[accentTone]);

    function mount(p) { pages.push(p); host.appendChild(p); return p; }

    mount(coverPage(model));

    if (model.hotels.length || model.meta.duration) {
      flow(function () {
        return mount(newPage(model, { l1: 'Package summary', l2: 'Trip overview' }));
      }, overviewBlocks(model));
    }

    if (model.days.length) {
      var dblocks = dayBlocks(model);
      flow(function () {
        return mount(newPage(model, { l1: 'Day-by-day itinerary', l2: '' }));
      }, dblocks);

      // Label each day page with the range of days it actually carries.
      var seen = new Map();
      dblocks.forEach(function (b) {
        if (!b.page || b.day == null) return;
        var r = seen.get(b.page) || { lo: b.day, hi: b.day };
        r.lo = Math.min(r.lo, b.day); r.hi = Math.max(r.hi, b.day);
        seen.set(b.page, r);
      });
      seen.forEach(function (r, page) {
        var lo = model.days[r.lo], hi = model.days[r.hi];
        var a = pad2(lo.n || r.lo + 1), b = pad2(hi.n || r.hi + 1);
        page.querySelector('.l2').textContent = a === b ? 'Day ' + a : 'Days ' + a + '–' + b;
      });
    }

    if (model.inclusions.length || model.exclusions.length) {
      flow(function () {
        return mount(newPage(model, { l1: 'Before you go', l2: 'Inclusions & exclusions' }));
      }, inclusionsBlocks(model));
    }

    if (model.notes) {
      flow(function () {
        return mount(newPage(model, { l1: 'Before you go', l2: 'Notes' }));
      }, notesBlocks(model));
    }

    if (model.pricing.grandTotal) {
      flow(function () {
        return mount(newPage(model, { l1: 'Cost summary', l2: 'Final package pricing' }));
      }, pricingBlocks(model));
    }

    var total = pages.length;
    pages.forEach(function (p, i) {
      var no = p.querySelector('.page-no');
      if (no) no.textContent = pad2(i + 1) + ' / ' + pad2(total);
    });

    return pages;
  }

  window.GGRender = { render: render, PAGE_BODY_H: PAGE_BODY_H };
})();
