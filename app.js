/* ==========================================================================
   Ghoomgali Itinerary Maker - application logic (v2)
   ========================================================================== */
(function () {
  'use strict';

  var STORE = 'gg-itinerary-v2';
  var $ = function (id) { return document.getElementById(id); };

  var docEl       = $('doc');
  var paperScroll = $('paperScroll');
  var emptyState  = $('emptyState');
  var itemTools   = $('itemTools');
  var filePhoto   = $('filePhoto');
  var fileProject = $('fileProject');

  var FIELDS = ['title', 'titleAccent', 'subtitle', 'dates', 'duration',
                'party', 'children', 'destinations', 'preparedOn', 'preparedBy', 'fileName'];

  var ZOOMS = ['fit', 0.5, 0.75, 1, 1.25, 1.5];

  var state = { model: null, zoom: 0, photoPath: null, activeCard: null };

  /* ---- paths ------------------------------------------------------------ */

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) {
      if (o[k] == null) o[k] = /^\d+$/.test(k) ? [] : {};
      return o[k];
    }, obj);
    target[last] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return o == null ? undefined : o[k];
    }, obj);
  }

  /* ---- chrome ----------------------------------------------------------- */

  var toastTimer;
  function toast(msg, warn) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('warn', !!warn);
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('on');
      setTimeout(function () { t.hidden = true; }, 320);
    }, 3600);
  }

  function overlay(on, title, msg) {
    if (title) $('overlayTitle').textContent = title;
    if (msg) $('overlayMsg').textContent = msg;
    $('overlay').hidden = !on;
  }

  /* ---- persistence ------------------------------------------------------ */

  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE, JSON.stringify({
          model: state.model, raw: $('raw').value, fields: readFields(),
          themeChoice: $('f-theme').value
        }));
        var s = $('saveState');
        s.classList.add('on');
        setTimeout(function () { s.classList.remove('on'); }, 1400);
      } catch (e) { /* private window or quota - not fatal */ }
    }, 700);
  }

  function readFields() {
    var out = {};
    FIELDS.forEach(function (k) { out[k] = $('f-' + k).value.trim(); });
    return out;
  }

  function writeFields(meta) {
    FIELDS.forEach(function (k) { if (meta[k]) $('f-' + k).value = meta[k]; });
  }

  function restore() {
    var data;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return false; }
    if (!data) return false;
    if (data.raw) $('raw').value = data.raw;
    if (data.fields) FIELDS.forEach(function (k) {
      if (data.fields[k]) $('f-' + k).value = data.fields[k];
    });
    $('f-theme').value = data.themeChoice || '';
    syncThemeSwatchUI();
    if (data.model && data.model.days) {
      state.model = data.model;
      rerender();
      return true;
    }
    return false;
  }

  /* ---- generate --------------------------------------------------------- */

  function generate() {
    var raw = $('raw').value;
    if (!raw.trim()) {
      toast('Paste your plan first, then hit Generate.', true);
      $('raw').focus();
      return;
    }

    var model = window.GGParser.parse(raw);
    var fields = readFields();
    FIELDS.forEach(function (k) { if (fields[k]) model.meta[k] = fields[k]; });

    var themeChoice = $('f-theme').value;
    if (themeChoice) model.meta.theme = themeChoice;

    window.GGParser.recompute(model);

    if (state.model) carryPhotos(state.model, model);

    state.model = model;
    rerender();
    writeFields(model.meta);
    save();

    if (!model.days.length) {
      toast('No days found — start lines with "Day 1", "Day 2" and generate again.', true);
      return;
    }
    toast('Built — ' + model.days.length + ' days, ' +
          docEl.querySelectorAll('.page').length + ' pages. Click any text to edit, or a photo slot to fill it.');
  }

  /* A re-generate must not wipe photos the client already placed. */
  function carryPhotos(oldM, newM) {
    if (oldM.cover && oldM.cover.image) newM.cover.image = oldM.cover.image;

    (newM.hotels || []).forEach(function (h, i) {
      var o = oldM.hotels && oldM.hotels[i];
      if (o && o.image && o.name === h.name) h.image = o.image;
    });

    newM.days.forEach(function (d, i) {
      var od = oldM.days && oldM.days[i];
      if (!od) return;
      if (od.image) d.image = od.image;
      d.items.forEach(function (it, j) {
        var oi = od.items && od.items[j];
        if (oi && oi.image && oi.title === it.title) it.image = oi.image;
      });
    });
  }

  /* ---- render ----------------------------------------------------------- */

  function rerender() {
    if (!state.model) return;
    var top = paperScroll.scrollTop;
    window.GGRender.render(state.model, docEl);
    emptyState.hidden = true;
    applyZoom();
    paperScroll.scrollTop = top;
  }

  function applyZoom() {
    var z = ZOOMS[state.zoom];
    var scale;
    if (z === 'fit') {
      scale = Math.min(1, (paperScroll.clientWidth - 56) / 794);
      $('zoomLabel').textContent = 'Fit';
    } else {
      scale = z;
      $('zoomLabel').textContent = Math.round(z * 100) + '%';
    }
    docEl.style.transform = 'scale(' + scale + ')';
    docEl.style.marginBottom = -(docEl.scrollHeight * (1 - scale)) + 'px';
  }

  /* ---- inline editing --------------------------------------------------- */

  docEl.addEventListener('input', function (e) {
    var node = e.target.closest('[data-path]');
    if (!node || !state.model) return;
    var path = node.dataset.path;
    var value = node.textContent.trim();
    setPath(state.model, path, value);

    // Prices are edited as text but live in the model as numbers.
    if (/\.priceText$/.test(path)) {
      setPath(state.model, path.replace(/Text$/, ''), window.GGParser.toNumber(value));
    } else if (/\.totalText$/.test(path)) {
      var d = getPath(state.model, path.replace(/\.totalText$/, ''));
      if (d) { d.total = window.GGParser.toNumber(value); d.totalLocked = true; }
    }

    // The same value can appear on more than one page.
    Array.prototype.slice.call(docEl.querySelectorAll('[data-path="' + path + '"]'))
      .forEach(function (other) {
        if (other !== node && other.textContent.trim() !== value) other.textContent = value;
      });

    if (/^meta\./.test(path)) {
      var key = path.slice(5);
      if (FIELDS.indexOf(key) > -1) $('f-' + key).value = value;
    }
    save();
  });

  /* Totals only settle once the caret leaves - re-rendering mid-keystroke
     would throw the cursor away. */
  docEl.addEventListener('focusout', function (e) {
    var node = e.target.closest('[data-path]');
    if (!node || !state.model) return;
    if (!/\.(priceText|totalText)$/.test(node.dataset.path)) return;
    window.GGParser.recompute(state.model);
    rerender();
    save();
  });

  docEl.addEventListener('paste', function (e) {
    if (!e.target.closest('[data-path]')) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
  });

  docEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.closest('[data-path]')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  /* ---- photos ----------------------------------------------------------- */

  docEl.addEventListener('click', function (e) {
    var target = e.target.closest('[data-photo]');
    if (!target || e.target.closest('[data-path]')) return;
    state.photoPath = target.dataset.photo;
    filePhoto.value = '';
    filePhoto.click();
  });

  filePhoto.addEventListener('change', function () {
    var f = filePhoto.files && filePhoto.files[0];
    if (!f || !state.photoPath) return;
    if (f.size > 12 * 1024 * 1024) { toast('That image is over 12MB — try a smaller one.', true); return; }
    readImage(f, state.photoPath);
  });

  function readImage(file, path) {
    var r = new FileReader();
    r.onload = function () {
      shrink(r.result, 1600, function (dataUrl) {
        setPath(state.model, path, dataUrl);
        rerender();
        save();
        toast('Photo added.');
      });
    };
    r.readAsDataURL(file);
  }

  /* Downscale before storing: keeps local storage and the PDF a sane size. */
  function shrink(dataUrl, maxW, done) {
    var im = new Image();
    im.onload = function () {
      if (im.naturalWidth <= maxW) return done(dataUrl);
      var w = maxW, h = Math.round(maxW * im.naturalHeight / im.naturalWidth);
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      done(cv.toDataURL('image/jpeg', 0.88));
    };
    im.onerror = function () { done(dataUrl); };
    im.src = dataUrl;
  }

  ['dragover', 'drop'].forEach(function (type) {
    docEl.addEventListener(type, function (e) {
      var target = e.target.closest('[data-photo]');
      if (!target) return;
      e.preventDefault();
      if (type === 'dragover') { target.style.opacity = '.6'; return; }
      target.style.opacity = '';
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) readImage(f, target.dataset.photo);
    });
  });

  /* ---- per-card toolbar ------------------------------------------------- */

  docEl.addEventListener('mouseover', function (e) {
    var card = e.target.closest('.card[data-card]');
    if (!card) return;
    state.activeCard = card.dataset.card;
    var r = card.getBoundingClientRect();
    itemTools.hidden = false;
    itemTools.style.left = Math.max(8, r.right - itemTools.offsetWidth) + 'px';
    itemTools.style.top = Math.max(8, r.top - itemTools.offsetHeight - 4) + 'px';
  });

  paperScroll.addEventListener('mouseleave', function () { itemTools.hidden = true; });

  itemTools.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn || !state.activeCard || !state.model) return;

    var act = btn.dataset.act;
    if (act === 'photo') {
      state.photoPath = state.activeCard + '.image';
      filePhoto.value = '';
      filePhoto.click();
      return;
    }

    var m = state.activeCard.match(/^days\.(\d+)\.items\.(\d+)$/);
    var list, idx;
    if (m) { list = state.model.days[+m[1]].items; idx = +m[2]; }
    else {
      var hm = state.activeCard.match(/^hotels\.(\d+)$/);
      if (!hm) return;
      list = state.model.hotels; idx = +hm[1];
    }

    if (act === 'delete') list.splice(idx, 1);
    else if (act === 'up' && idx > 0) list.splice(idx - 1, 0, list.splice(idx, 1)[0]);
    else if (act === 'down' && idx < list.length - 1) list.splice(idx + 1, 0, list.splice(idx, 1)[0]);
    else if (act === 'bullet') (list[idx].bullets = list[idx].bullets || []).push('New line');
    else return;

    itemTools.hidden = true;
    window.GGParser.recompute(state.model);
    rerender();
    save();
  });

  /* ---- exports ---------------------------------------------------------- */

  $('btnPdf').addEventListener('click', async function () {
    if (!state.model) { toast('Generate an itinerary first.', true); return; }
    var pages = docEl.querySelectorAll('.page').length;
    overlay(true, 'Building your PDF', 'Preparing ' + pages + ' pages…');
    try {
      await window.GGExport.pdf(docEl, state.model, function (i, n) {
        $('overlayMsg').textContent = 'Rendering page ' + i + ' of ' + n + '…';
      });
      overlay(false);
      toast('PDF saved to your Downloads folder — ' + pages + ' pages, print ready.');
    } catch (err) {
      overlay(false);
      toast('PDF failed: ' + err.message, true);
    }
  });

  $('btnExport').addEventListener('click', function (e) {
    e.stopPropagation();
    var menu = $('exportMenu');
    menu.hidden = !menu.hidden;
    $('btnExport').setAttribute('aria-expanded', String(!menu.hidden));
  });

  document.addEventListener('click', function () {
    $('exportMenu').hidden = true;
    $('btnExport').setAttribute('aria-expanded', 'false');
  });

  $('exportMenu').addEventListener('click', async function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var kind = btn.dataset.export;
    $('exportMenu').hidden = true;

    if (kind === 'open') { fileProject.value = ''; fileProject.click(); return; }
    if (!state.model) { toast('Generate an itinerary first.', true); return; }

    try {
      if (kind === 'docx') {
        overlay(true, 'Building the Word file', 'Packing text and photos…');
        await window.GGExport.docx(state.model);
        overlay(false);
        toast('Word file saved — open it in Word or Google Docs to edit.');
      } else if (kind === 'html') {
        overlay(true, 'Building the web page', 'Inlining styles and artwork…');
        await window.GGExport.html(docEl, state.model);
        overlay(false);
        toast('Editable web page saved — open it in any browser.');
      } else if (kind === 'ggi') {
        window.GGExport.project(state.model);
        toast('Project file saved — reopen it here to duplicate this trip.');
      }
    } catch (err) {
      overlay(false);
      toast('Export failed: ' + err.message, true);
    }
  });

  fileProject.addEventListener('change', async function () {
    var f = fileProject.files && fileProject.files[0];
    if (!f) return;
    try {
      var model = await window.GGExport.readProject(f);
      state.model = model;
      writeFields(model.meta || {});
      rerender();
      save();
      toast('Project loaded — ' + model.days.length + ' days.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  /* ---- theme picker ------------------------------------------------------ */

  function syncThemeSwatchUI() {
    var current = $('f-theme').value;
    Array.prototype.slice.call(document.querySelectorAll('#themeSwatches .swatch')).forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === current);
    });
  }

  var themeSwatches = $('themeSwatches');
  if (themeSwatches) {
    themeSwatches.addEventListener('click', function (e) {
      var btn = e.target.closest('.swatch');
      if (!btn) return;
      $('f-theme').value = btn.dataset.theme;
      syncThemeSwatchUI();
      if (state.model) {
        state.model.meta.theme = btn.dataset.theme || window.GGParser.autoTheme(state.model.meta);
        rerender();
      }
      save();
    });
  }

  /* ---- form and misc ---------------------------------------------------- */

  FIELDS.forEach(function (k) {
    $('f-' + k).addEventListener('input', function () {
      if (state.model) {
        state.model.meta[k] = $('f-' + k).value.trim();
        Array.prototype.slice.call(docEl.querySelectorAll('[data-path="meta.' + k + '"]'))
          .forEach(function (n) { n.textContent = state.model.meta[k]; });
      }
      save();
    });
  });

  $('raw').addEventListener('input', function () {
    var n = $('raw').value.split('\n').filter(function (l) { return l.trim(); }).length;
    $('rawCount').textContent = n + (n === 1 ? ' line' : ' lines');
    save();
  });

  $('btnGenerate').addEventListener('click', generate);

  $('btnSample').addEventListener('click', function () {
    $('raw').value = SAMPLE;
    FIELDS.forEach(function (k) { $('f-' + k).value = ''; });
    $('f-preparedOn').value = 'Nov 2026';
    $('f-preparedBy').value = 'Ghoom Gali Travel';
    $('raw').dispatchEvent(new Event('input'));
    generate();
  });

  $('btnReset').addEventListener('click', function () {
    if (!confirm('Clear this itinerary and start a new one? This cannot be undone.')) return;
    localStorage.removeItem(STORE);
    state.model = null;
    $('raw').value = '';
    FIELDS.forEach(function (k) { $('f-' + k).value = ''; });
    $('f-theme').value = '';
    syncThemeSwatchUI();
    docEl.textContent = '';
    emptyState.hidden = false;
    $('rawCount').textContent = '0 lines';
    toast('Cleared. Ready for the next trip.');
  });

  $('zoomIn').addEventListener('click', function () {
    state.zoom = Math.min(ZOOMS.length - 1, state.zoom + 1);
    applyZoom();
  });
  $('zoomOut').addEventListener('click', function () {
    state.zoom = Math.max(0, state.zoom - 1);
    applyZoom();
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyZoom, 140);
  });

  /* ---- sample ----------------------------------------------------------- */

  var SAMPLE = [
    'Vietnam *Escape.*',
    'Hanoi · Danang · Phu Quoc — an 8-day journey for 5',
    'Nov 22–29 | 8D / 7N | 5 adults | 2 children | 3 cities',
    '',
    'Hotels',
    'Hanoi | Sky Lark Hotel, Hanoi | Nov 22 – 24 | 2 nights | 21533',
    '- 1 x Superior Room, Double Bed (No window)',
    '- 1 x Triple Deluxe Room (with Window)',
    '- Breakfast included',
    '',
    'Danang | Santa Luxury Hotel, Danang | Nov 24 – 26 | 2 nights | 19382',
    '- 2 x Double or Twin Room (with Sea View)',
    '- Breakfast included',
    '',
    'Phu Quoc | Azura Resort, Phu Quoc | Nov 26 – 29 | 3 nights | 31441',
    '- 1 x Deluxe Triple Room (with Balcony)',
    '- 1 x Standard Room (with Balcony)',
    '- Breakfast included',
    '',
    'Day 1 | November 22 · Hanoi | Hanoi',
    '[On arrival · coordinated with flight]',
    'HAN Airport Pick-Up | 2100',
    'Arrival and private transfer from Hanoi (HAN) Airport to the hotel.',
    '- Private transfer vehicle',
    '',
    '[Half day · pick-up time to be confirmed]',
    'Hanoi City Half-Day Tour | 11590',
    'Guided sightseeing covering key locations across Hanoi City.',
    '- Shuttle bus transport',
    '- Seat-in-coach (SIC) format',
    '= INR 2,318 × 5 adults',
    '',
    'Day 2 | November 23 · Hanoi · Halong Bay | Hanoi / Halong Bay',
    '[Full day · morning pick-up to be confirmed]',
    'Halong Bay Luxury Day Cruise | 23500',
    'Excursion to Halong Bay featuring scenic cruising, a sunset party and kayaking.',
    '- Limo bus transport (SIC)',
    '- Luxury day cruise',
    '- Kayaking access',
    '- Buffet lunch',
    '- Sunset party',
    '= INR 4,700 × 5 adults',
    '',
    'Day 3 | November 24 · Hanoi → Danang | Hanoi to Danang',
    '[Coordinated with domestic flight]',
    'Hanoi → Danang Airport Transfers | 4200',
    'Hotel check-out, transfer to HAN Airport, and pick-up at DAD Airport on arrival in Danang.',
    '- Private transfer vehicle — HAN drop-off',
    '- Private transfer vehicle — DAD pick-up',
    '= INR 2,100 + INR 2,100',
    '',
    '[15:30 – 21:00]',
    'Marble Mountain + Hoi An Ancient Town | 12500',
    'Evening sightseeing of Marble Mountain followed by an exploration of Hoi An Ancient Town.',
    '- Seat-in-coach (SIC) transport',
    '- Guided tour',
    '- Local dinner',
    '= INR 2,500 × 5 adults',
    '',
    'Day 4 | November 25 · Danang | Danang',
    '[Full day · morning pick-up to be confirmed]',
    'Ba Na Hills Day Trip | 19500',
    'Exploration of Ba Na Hills, including the Golden Hands Bridge, French Village and Fantasy Park.',
    '- Seat-in-coach (SIC) transport',
    '- Round-trip cable car ride',
    '- Entry — Golden Hands Bridge, Fantasy Park & French Village',
    '= INR 3,900 × 5 adults · lunch not included',
    '',
    'Day 5 | November 26 · Danang → Phu Quoc | Danang to Phu Quoc',
    '[Coordinated with domestic flight]',
    'Danang → Phu Quoc Airport Transfers | 4200',
    'Hotel check-out, transfer to DAD Airport, and pick-up at PQC Airport on arrival in Phu Quoc.',
    '- Private transfer vehicle — DAD drop-off',
    '- Private transfer vehicle — PQC pick-up',
    '= INR 2,100 + INR 2,100',
    '',
    '[Afternoon / evening · pick-up to be confirmed]',
    'Grandworld Phu Quoc Visit | 4901',
    'Independent visit to Grandworld Phu Quoc from Central Phu Quoc.',
    '- Round-trip transport from Central PQ',
    '= Guide not included',
    '',
    'Day 6 | November 27 · Phu Quoc | Phu Quoc',
    '[Full day · morning pick-up to be confirmed]',
    'VinWonders + VinSafari Experience | 35000',
    'Visit to the VinWonders theme park and the VinSafari wildlife conservation park.',
    '- Round-trip transport from Central PQ (no guide)',
    '- Entry — VinWonders',
    '- Entry — VinSafari',
    '= Transport INR 6,500 + Tickets INR 28,500 (INR 5,700 × 5 adults)',
    '',
    'Day 7 | November 28 · Phu Quoc | Phu Quoc',
    '[Full day · morning pick-up to be confirmed]',
    '4 Island Hopping Tour | 30000',
    'Boat excursion to explore four islands around Phu Quoc.',
    '- Seat-in-coach (SIC) transport',
    '- Boat access',
    '- One-way cable car ride',
    '- Local lunch',
    '= INR 6,000 × 5 adults',
    '',
    'Day 8 | November 29 · Departure | Departure',
    '[Coordinated with departure flight]',
    'PQC Airport Drop-Off | 2100',
    'Hotel check-out and departure transfer from Central Phu Quoc to PQC Airport.',
    '- Private transfer vehicle',
    '',
    'Pricing',
    'Margin | 45000',
    'GST | 5%',
    'TCS | 2%',
    '',
    'Notes',
    'Domestic flights within Vietnam are quoted separately and confirmed once dates are locked.',
    'E-visa approval letters take five working days — please share passport scans early.'
  ].join('\n');

  /* ---- boot ------------------------------------------------------------- */

  /* Read the logo SVGs once and hold them as data URIs: html2canvas rasterises
     inline data far more reliably than linked SVG, and it makes the exported
     HTML self-contained. Falls back to paths when opened from disk. */
  function preloadLogos() {
    var L = window.GG.logos;
    return Promise.all(Object.keys(L).map(function (k) {
      if (L[k].indexOf('data:') === 0) return Promise.resolve();
      return fetch(L[k])
        .then(function (r) { return r.text(); })
        .then(function (svg) {
          L[k] = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        })
        .catch(function () { /* keep the path */ });
    }));
  }

  preloadLogos().then(function () {
    if (!restore()) { emptyState.hidden = false; syncThemeSwatchUI(); }
    $('raw').dispatchEvent(new Event('input'));
  });
})();
