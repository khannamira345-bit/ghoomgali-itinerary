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
                'party', 'children', 'destinations', 'preparedOn', 'preparedBy', 'fileName',
                'guest', 'advisorPhone'];

  var ZOOMS = ['fit', 0.5, 0.75, 1, 1.25, 1.5];

  var state = {
    model: null, zoom: 0, photoPath: null, activeCard: null,
    library: {}, libDest: null, libCat: 'hotel', libDay: 0, libSearch: '',
    itinOpen: {}
  };

  /* Used by the activity library: a blank model to click items into when
     nothing has been pasted or generated yet. Same defaults as an empty
     paste, so everything downstream (rendering, costing, export) just works. */
  function ensureModel() {
    if (state.model) return state.model;
    var model = window.GGParser.parse('');
    var fields = readFields();
    FIELDS.forEach(function (k) { if (fields[k]) model.meta[k] = fields[k]; });
    var themeChoice = $('f-theme').value;
    if (themeChoice) model.meta.theme = themeChoice;
    var layoutChoice = $('f-layout').value;
    if (layoutChoice) model.meta.layout = layoutChoice;
    window.GGParser.recompute(model);
    state.model = model;
    emptyState.hidden = true;
    return model;
  }

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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Every field with the same data-path - the preview's contenteditable
     nodes and the Build panel's plain inputs alike - stays in sync without a
     full rerender, whichever side was actually edited. */
  function mirrorFieldValue(path, value, exceptNode) {
    Array.prototype.slice.call(document.querySelectorAll('[data-path="' + path + '"]'))
      .forEach(function (other) {
        if (other === exceptNode) return;
        if (other.tagName === 'INPUT' || other.tagName === 'TEXTAREA') {
          if (other.value !== value) other.value = value;
        } else if (other.textContent.trim() !== value) {
          other.textContent = value;
        }
      });
  }

  /* Used by the Build panel's plain inputs (Itinerary cards, Document lists) -
     the same edit the preview's contenteditable nodes already apply on
     'input', minus the caret-sensitive DOM node itself. */
  function applyFieldEdit(path, value, sourceNode) {
    if (!state.model) return;
    setPath(state.model, path, value);

    if (/\.priceText$/.test(path)) {
      setPath(state.model, path.replace(/Text$/, ''), window.GGParser.toNumber(value));
    } else if (/\.totalText$/.test(path)) {
      var d = getPath(state.model, path.replace(/\.totalText$/, ''));
      if (d) { d.total = window.GGParser.toNumber(value); d.totalLocked = true; }
    }

    mirrorFieldValue(path, value, sourceNode);

    if (/^meta\./.test(path)) {
      var key = path.slice(5);
      if (FIELDS.indexOf(key) > -1 && $('f-' + key)) $('f-' + key).value = value;
    }
    updateTripName();
    save();
  }

  /* A price or total is edited as text but lives in the model as a number -
     the display only settles once the field is done being typed into. */
  function commitIfNumeric(path) {
    if (!state.model || !/\.(priceText|totalText)$/.test(path)) return;
    window.GGParser.recompute(state.model);
    rerender();
    renderItinerary();
    refreshCosting();
    save();
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
      persistNow();
      if (!restoringHistory) pushHistory();
    }, 700);
  }

  function persistNow() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        model: state.model, raw: $('raw').value, fields: readFields(),
        themeChoice: $('f-theme').value, layoutChoice: $('f-layout').value
      }));
      var s = $('saveState');
      s.classList.add('on');
      setTimeout(function () { s.classList.remove('on'); }, 1400);
    } catch (e) { /* private window or quota - not fatal */ }
  }

  /* ---- undo / redo --------------------------------------------------------
     A history of whole-model snapshots. save() itself is already debounced
     700ms after the last edit, so a burst of keystrokes or a rapid sequence
     of clicks collapses into one undo step, the way most editors group them. */

  var history = [];
  var historyIndex = -1;
  var restoringHistory = false;

  function pushHistory() {
    if (!state.model) return;
    var snap = JSON.stringify(state.model);
    if (history[historyIndex] === snap) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if (history.length > 50) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function resetHistory() {
    history = state.model ? [JSON.stringify(state.model)] : [];
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    if ($('btnUndo')) $('btnUndo').disabled = historyIndex <= 0;
    if ($('btnRedo')) $('btnRedo').disabled = historyIndex >= history.length - 1;
  }

  function goHistory(delta) {
    var idx = historyIndex + delta;
    if (idx < 0 || idx >= history.length) return;
    historyIndex = idx;
    restoringHistory = true;
    state.model = JSON.parse(history[idx]);
    rerender();
    writeFields(state.model.meta);
    writeCostInputs();
    refreshCosting();
    renderItinerary();
    renderDocLists();
    renderLibraryUI();
    updateTripName();
    persistNow();
    restoringHistory = false;
    updateHistoryButtons();
  }

  var btnUndo = $('btnUndo'), btnRedo = $('btnRedo');
  if (btnUndo) btnUndo.addEventListener('click', function () { goHistory(-1); });
  if (btnRedo) btnRedo.addEventListener('click', function () { goHistory(1); });

  function updateTripName() {
    var el = $('tripName');
    if (!el) return;
    var m = state.model && state.model.meta;
    var name = m ? [m.title, m.titleAccent].filter(Boolean).join(' ').replace(/[.]+$/, '') : '';
    el.textContent = name || 'Untitled trip';
  }

  /* Any open ••• menu or dropdown closes when another one opens, or when
     the user clicks anywhere else - a single shared listener for all of them. */
  function closeAllPopovers() {
    Array.prototype.slice.call(document.querySelectorAll('.itin-menu-pop')).forEach(function (m) { m.hidden = true; });
    var em = $('exportMenuTop');
    if (em) { em.hidden = true; $('btnExportTop').setAttribute('aria-expanded', 'false'); }
  }
  document.addEventListener('click', closeAllPopovers);

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
    $('f-layout').value = data.layoutChoice || 'editorial';
    syncLayoutPickerUI();
    if (data.model && data.model.days) {
      state.model = data.model;
      rerender();
      writeCostInputs();
      refreshCosting();
      renderLibraryUI();
      renderItinerary();
      renderDocLists();
      updateTripName();
      resetHistory();
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

    var layoutChoice = $('f-layout').value;
    if (layoutChoice) model.meta.layout = layoutChoice;

    window.GGParser.recompute(model);

    if (state.model) {
      carryPhotos(state.model, model);
      pushHistory();          // capture the pre-regenerate state as its own undo step
    }

    state.model = model;
    updateTripName();
    // Must run before rerender(): pagination measures real scrollHeight, and
    // the wizard leaves the split view hidden until this point - rendering
    // into a still-hidden ancestor is the same mis-measurement bug a hidden
    // mobile tab caused earlier, just from a different hiding mechanism.
    endOnboarding();
    rerender();
    writeFields(model.meta);
    writeCostInputs();
    refreshCosting();
    state.libDay = 0;
    renderLibraryUI();
    renderItinerary();
    renderDocLists();
    save();
    setBuildTab('itinerary');

    if (!model.days.length) {
      toast('No days found — start lines with "Day 1", "Day 2" and generate again.', true);
      return;
    }
    toast('Built — ' + model.days.length + ' days, ' +
          docEl.querySelectorAll('.page').length + ' pages. Click any text to edit, or a photo slot to fill it.');
    // Deferred a tick so the switch always lands after this render has fully
    // settled, rather than racing it.
    setTimeout(showPreviewOnMobile, 0);
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
    setupPageObserver();
    updateTripName();
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

    // The same value can appear on more than one page, and now also in the
    // Itinerary/Document tabs of the Build panel - so this mirrors document-wide,
    // not just within the preview.
    mirrorFieldValue(path, value, node);

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
    commitIfNumeric(node.dataset.path);
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
        renderItinerary();
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

  /* ---- trip summary day-part reassignment -------------------------------- */

  docEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.sum-move');
    if (!btn || !state.model) return;
    var path = btn.dataset.movePart;
    var parts = window.GGParser.PARTS || ['morning', 'afternoon', 'evening'];
    var current = getPath(state.model, path);
    var next = parts[(parts.indexOf(current) + 1) % parts.length];
    setPath(state.model, path, next);
    rerender();
    save();
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
    renderItinerary();
    refreshCosting();
    save();
  });

  /* ---- exports ------------------------------------------------------------
     One menu in the topbar for every export kind, rather than a separate
     button per action - PDF and "Save project" are the two most reached for,
     the rest sit below a divider. */

  $('btnExportTop').addEventListener('click', function (e) {
    e.stopPropagation();
    closeAllPopovers();
    var menu = $('exportMenuTop');
    menu.hidden = !menu.hidden;
    $('btnExportTop').setAttribute('aria-expanded', String(!menu.hidden));
  });

  $('exportMenuTop').addEventListener('click', async function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var kind = btn.dataset.export;
    $('exportMenuTop').hidden = true;
    $('btnExportTop').setAttribute('aria-expanded', 'false');

    if (kind === 'open') { fileProject.value = ''; fileProject.click(); return; }
    if (!state.model) { toast('Generate an itinerary first.', true); return; }

    try {
      if (kind === 'pdf') {
        var pages = docEl.querySelectorAll('.page').length;
        overlay(true, 'Building your PDF', 'Preparing ' + pages + ' pages…');
        await window.GGExport.pdf(docEl, state.model, function (i, n) {
          $('overlayMsg').textContent = 'Rendering page ' + i + ' of ' + n + '…';
        });
        overlay(false);
        toast('PDF saved to your Downloads folder — ' + pages + ' pages, print ready.');
      } else if (kind === 'docx') {
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
      endOnboarding();
      rerender();
      writeCostInputs();
      refreshCosting();
      state.libDay = 0;
      renderLibraryUI();
      renderItinerary();
      renderDocLists();
      save();
      resetHistory();
      toast('Project loaded — ' + model.days.length + ' days.');
      setBuildTab('itinerary');
      setTimeout(showPreviewOnMobile, 0);
    } catch (err) {
      toast(err.message, true);
    }
  });

  /* ---- costing ----------------------------------------------------------- */

  /* The costing panel is the review step: every figure, margin included, is
     visible here before anything is downloaded. What reaches the traveller's
     PDF is controlled separately by the "show margin" box. */
  function refreshCosting() {
    refreshQuoSummary();
    refreshCostReview();
  }

  /* The client-facing summary at the top of the Quotation tab - Subtotal,
     Discount, GST/TCS, Client Total. Margin never appears here; the full
     internal breakdown (including margin) stays inside the Advanced disclosure. */
  function refreshQuoSummary() {
    var box = $('quoSummary');
    if (!state.model || !state.model.pricing) {
      box.innerHTML = '<div class="quo-empty">Generate an itinerary to see the costing.</div>';
      return;
    }
    var p = state.model.pricing;
    var money = window.GGParser.money;
    box.textContent = '';

    function row(label, amount, cls, prefix) {
      if (amount == null || !isFinite(amount) || !amount) return;
      var d = document.createElement('div');
      d.className = 'row' + (cls ? ' ' + cls : '');
      var dt = document.createElement('dt');
      dt.textContent = label;
      var dd = document.createElement('dd');
      dd.textContent = (prefix || '') + money(amount, 'INR');
      d.appendChild(dt); d.appendChild(dd);
      box.appendChild(d);
    }

    row('Subtotal', p.subtotal);
    row('Discount', p.discount, 'row--discount', '− ');
    if (p.gst) row('GST ' + p.gstPct + '%', p.gst);
    if (p.tcs) row('TCS ' + p.tcsPct + '%', p.tcs);
    row('Client total', p.grandTotal, 'row--grand');
    if (p.perPerson) row('Per person (÷ ' + p.heads + ')', p.perPerson);
    if (!p.subtotal && !p.grandTotal) box.innerHTML = '<div class="quo-empty">Add a price to a day or hotel to see the costing.</div>';
  }

  function refreshCostReview() {
    var box = $('costReview');
    if (!state.model || !state.model.pricing) {
      box.innerHTML = '<div class="cost-empty">Generate an itinerary to see the costing.</div>';
      return;
    }
    var p = state.model.pricing;
    var money = window.GGParser.money;
    box.textContent = '';

    function row(label, amount, cls, prefix) {
      if (amount == null || !isFinite(amount) || !amount) return;
      var d = document.createElement('div');
      d.className = 'row' + (cls ? ' ' + cls : '');
      var dt = document.createElement('dt');
      dt.textContent = label;
      var dd = document.createElement('dd');
      dd.textContent = (prefix || '') + money(amount, 'INR');
      d.appendChild(dt); d.appendChild(dd);
      box.appendChild(d);
    }

    row('Activities', p.activityTotal);
    row('Accommodation', p.hotelTotal);
    row('Base cost', p.baseCost, 'row--sum');
    p.extras.forEach(function (e) { row(e.label, e.amount); });
    row('Margin', p.margin, 'row--margin');
    row('Subtotal', p.subtotal, 'row--sum');
    if (p.gst) row('GST ' + p.gstPct + '%', p.gst);
    if (p.tcs) row('TCS ' + p.tcsPct + '%', p.tcs);
    row('Discount', p.discount, 'row--discount', '− ');
    row('Grand total', p.grandTotal, 'row--grand');
    if (p.perPerson) row('Per person (÷ ' + p.heads + ')', p.perPerson);
    if (p.perAdult && state.model.meta.childCount) row('Per adult', p.perAdult);
  }

  function writeCostInputs() {
    if (!state.model || !state.model.pricing) return;
    var p = state.model.pricing;
    $('c-margin').value = p.margin != null ? p.margin : '';
    $('c-gst').value = p.gstPct != null ? p.gstPct : '';
    $('c-tcs').value = p.tcsPct != null ? p.tcsPct : '';
    $('c-discount').value = p.discount != null ? p.discount : '';
    $('c-showMargin').checked = !!state.model.meta.showMargin;
  }

  function numOrNull(v) {
    var s = String(v).trim();
    if (!s) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  ['c-margin', 'c-gst', 'c-tcs', 'c-discount'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (!state.model) return;
      var p = state.model.pricing;
      if (id === 'c-margin') p.margin = numOrNull($(id).value);
      if (id === 'c-gst') p.gstPct = numOrNull($(id).value);
      if (id === 'c-tcs') p.tcsPct = numOrNull($(id).value);
      if (id === 'c-discount') p.discount = numOrNull($(id).value);
      window.GGParser.recompute(state.model);
      refreshCosting();
      rerender();
      save();
    });
  });

  $('c-showMargin').addEventListener('change', function () {
    if (!state.model) return;
    state.model.meta.showMargin = $('c-showMargin').checked;
    rerender();
    save();
    toast($('c-showMargin').checked
      ? 'Margin and base cost will print on the PDF — internal copy.'
      : 'Margin hidden. The PDF now shows only the package price and taxes.');
  });

  /* ---- layout picker ------------------------------------------------------ */

  function syncLayoutPickerUI() {
    var current = $('f-layout').value || 'editorial';
    Array.prototype.slice.call(document.querySelectorAll('#layoutPicker .layout-opt')).forEach(function (b) {
      b.classList.toggle('active', b.dataset.layout === current);
    });
  }

  var layoutPicker = $('layoutPicker');
  if (layoutPicker) {
    layoutPicker.addEventListener('click', function (e) {
      var btn = e.target.closest('.layout-opt');
      if (!btn) return;
      $('f-layout').value = btn.dataset.layout;
      syncLayoutPickerUI();
      if (state.model) {
        state.model.meta.layout = btn.dataset.layout;
        rerender();
      }
      save();
    });
  }

  /* ---- mobile screens ----------------------------------------------------
     Below the 960px breakpoint the two panels become two full-screen tabs,
     like moving from one screen to the next in a native app. Above it the
     classes are simply ignored, since app.css only reads them in that
     media query - the desktop split view is untouched. */

  var splitEl = document.querySelector('.split');
  var mobileTabs = $('mobileTabs');
  var isMobile = function () { return window.matchMedia('(max-width:960px)').matches; };

  var panelInputEl = document.querySelector('.panel-input');
  var panelPreviewEl = document.querySelector('.panel-preview');

  /* Only ever applies .mobile-panel-hidden when the real window is narrow.
     On desktop neither panel gets the class, so html2canvas's own narrow
     internal rendering pass (export.js asks for a 794px-wide context) never
     finds a reason to hide anything - see the CSS comment on the class
     itself for why this can't be a plain width-based media query. */
  /* A couple of topbar labels are too long for a phone-width bar - shortened
     there only, so the bar never needs a horizontal scroll of its own. */
  function updateChromeForWidth() {
    var narrow = window.matchMedia('(max-width:520px)').matches;
    var resetBtn = $('btnReset');
    if (resetBtn) resetBtn.textContent = narrow ? 'New' : 'New itinerary';
  }

  function setMobileTab(tab) {
    if (!splitEl) return;
    splitEl.classList.toggle('tab-build', tab === 'build');
    splitEl.classList.toggle('tab-preview', tab === 'preview');
    if (mobileTabs) {
      Array.prototype.slice.call(mobileTabs.querySelectorAll('.mobile-tab')).forEach(function (b) {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
    }
    var mobile = isMobile();
    if (panelInputEl) panelInputEl.classList.toggle('mobile-panel-hidden', mobile && tab !== 'build');
    if (panelPreviewEl) panelPreviewEl.classList.toggle('mobile-panel-hidden', mobile && tab !== 'preview');
  }

  /* A resize can cross the breakpoint without any tab click happening - keep
     the hidden state honest either way. */
  window.addEventListener('resize', function () {
    var current = splitEl && splitEl.classList.contains('tab-preview') ? 'preview' : 'build';
    setMobileTab(current);
    updateChromeForWidth();
  });

  if (mobileTabs) {
    mobileTabs.addEventListener('click', function (e) {
      var b = e.target.closest('.mobile-tab');
      if (b) setMobileTab(b.dataset.tab);
    });
  }

  /* Called after a successful build, so the phone moves forward to the
     result the way the reference app advances to its next screen. */
  function showPreviewOnMobile() {
    if (isMobile()) setMobileTab('preview');
  }

  /* ---- onboarding wizard ---------------------------------------------------
     First visit: a full-page "trip details, then paste the plan" wizard.
     Hitting Generate there ends it and reveals the split view. The wizard
     doesn't hold its own copies of the fields - it borrows the sidebar's own
     Trip details and Paste-the-plan sections by moving those exact DOM
     nodes in, then moving them straight back once Generate is clicked. One
     set of inputs, so there's nothing to keep in sync. */

  var onboardEl = $('onboarding');
  var fgTripDetails = $('fgTripDetails');
  var fgPastePlan = $('fgPastePlan');
  var fgTripDetailsSlot = $('fgTripDetailsSlot');
  var fgPastePlanSlot = $('fgPastePlanSlot');
  var onboardStep1 = $('onboardStep1');
  var onboardStep2 = $('onboardStep2');
  var onboardSlot1 = $('onboardSlot1');
  var onboardSlot2 = $('onboardSlot2');

  function setOnboardStep(step) {
    if (onboardStep1) onboardStep1.classList.toggle('active', step === 1);
    if (onboardStep2) onboardStep2.classList.toggle('active', step === 2);
    Array.prototype.slice.call(document.querySelectorAll('.onboard-dot')).forEach(function (d) {
      d.classList.toggle('active', +d.dataset.step === step);
    });
  }

  function startOnboarding() {
    if (!onboardEl) return;
    if (onboardSlot1 && fgTripDetails) onboardSlot1.appendChild(fgTripDetails);
    if (onboardSlot2 && fgPastePlan) onboardSlot2.appendChild(fgPastePlan);
    setOnboardStep(1);
    onboardEl.hidden = false;
    if (splitEl) splitEl.hidden = true;
    if (mobileTabs) mobileTabs.hidden = true;
  }

  /* Safe to call even when onboarding was never shown (a returning visitor)
     or has already ended - re-appending an already-placed node is a no-op. */
  function endOnboarding() {
    if (!onboardEl) return;
    if (fgTripDetailsSlot && fgTripDetails) fgTripDetailsSlot.appendChild(fgTripDetails);
    if (fgPastePlanSlot && fgPastePlan) fgPastePlanSlot.appendChild(fgPastePlan);
    onboardEl.hidden = true;
    if (splitEl) splitEl.hidden = false;
    if (mobileTabs) mobileTabs.hidden = false;
  }

  var btnOnboardNext = $('btnOnboardNext');
  if (btnOnboardNext) btnOnboardNext.addEventListener('click', function () { setOnboardStep(2); });

  var btnOnboardBack = $('btnOnboardBack');
  if (btnOnboardBack) btnOnboardBack.addEventListener('click', function () { setOnboardStep(1); });

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

  /* ---- activity library ---------------------------------------------------
     Built from an imported Excel cost sheet (one worksheet per destination),
     and stored in its own localStorage key so it survives across trips - a
     reusable inventory, the way the client described it as a "database". */

  function renderLibraryUI() {
    var destRow = $('libDestRow');
    var body = $('libBody');
    var empty = $('libEmpty');
    var dests = Object.keys(state.library);

    if (!dests.length) {
      destRow.hidden = true;
      body.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    destRow.hidden = false;
    body.hidden = false;

    if (!state.libDest || dests.indexOf(state.libDest) === -1) state.libDest = dests[0];

    destRow.textContent = '';
    dests.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lib-dest' + (d === state.libDest ? ' active' : '');
      b.textContent = d;
      b.dataset.dest = d;
      destRow.appendChild(b);
    });

    var items = state.library[state.libDest] || [];
    Array.prototype.slice.call(document.querySelectorAll('#libCatTabs .lib-tab')).forEach(function (t) {
      var cat = t.dataset.cat;
      var n = items.filter(function (it) { return it.category === cat; }).length;
      t.classList.toggle('active', cat === state.libCat);
      var badge = t.querySelector('.lib-tab-n');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'lib-tab-n';
        t.appendChild(badge);
      }
      badge.textContent = n ? '(' + n + ')' : '';
    });

    var dayCount = state.model ? state.model.days.length : 0;
    if (state.libDay >= dayCount) state.libDay = Math.max(0, dayCount - 1);

    var daysWrap = $('libDays');
    daysWrap.textContent = '';
    for (var i = 0; i < dayCount; i++) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lib-day-chip' + (i === state.libDay ? ' active' : '');
      chip.textContent = 'Day ' + (i + 1);
      chip.dataset.day = i;
      daysWrap.appendChild(chip);
    }
    var addChip = document.createElement('button');
    addChip.type = 'button';
    addChip.className = 'lib-day-add';
    addChip.textContent = '+ Day';
    daysWrap.appendChild(addChip);

    renderDayPlan(dayCount);

    var wrap = $('libItems');
    wrap.textContent = '';
    var shown = filteredLibraryItems(items);
    if (!shown.length) {
      var e = document.createElement('div');
      e.className = 'lib-empty';
      e.style.marginTop = '0';
      e.textContent = state.libSearch
        ? 'Nothing matches "' + state.libSearch + '" here.'
        : 'No ' + (window.GGLibrary.CAT_LABEL[state.libCat] || '').toLowerCase() + ' in this destination yet.';
      wrap.appendChild(e);
      return;
    }
    shown.forEach(function (it, idx) {
      var row = document.createElement('div');
      row.className = 'lib-item';

      var thumb = document.createElement('div');
      thumb.className = 'lib-item-thumb';
      if (it.image) thumb.style.backgroundImage = 'url("' + it.image.replace(/"/g, '%22') + '")';
      else thumb.textContent = (it.name || '?').trim().charAt(0).toUpperCase();
      row.appendChild(thumb);

      var b = document.createElement('div');
      b.className = 'lib-item-body';
      var name = document.createElement('div');
      name.className = 'lib-item-name';
      name.textContent = it.name;
      b.appendChild(name);
      if (it.description) {
        var meta = document.createElement('div');
        meta.className = 'lib-item-meta';
        meta.textContent = it.description;
        b.appendChild(meta);
      }
      if (it.price != null) {
        var price = document.createElement('div');
        price.className = 'lib-item-price';
        price.textContent = window.GGParser.money(it.price, 'INR');
        b.appendChild(price);
      }
      row.appendChild(b);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lib-item-add';
      btn.textContent = '+';
      btn.dataset.itemIndex = idx;
      if (it.category === 'hotel') {
        btn.title = 'Add to accommodation';
      } else if (dayCount === 0) {
        btn.title = 'Add a day first';
        btn.disabled = true;
      } else {
        btn.title = 'Add to Day ' + (state.libDay + 1);
      }
      row.appendChild(btn);
      wrap.appendChild(row);
    });
  }

  /* A compact route-style preview of what is already sitting in the day
     currently selected - the same shape as a finished trip's timeline, just
     drawn live while the day is still being assembled. */
  function renderDayPlan(dayCount) {
    var wrap = $('libDayPlan');
    if (!wrap) return;
    wrap.textContent = '';

    var day = (dayCount > 0 && state.model) ? state.model.days[state.libDay] : null;
    if (!day || !day.items.length) {
      var e = document.createElement('div');
      e.className = 'lib-day-plan-empty';
      e.textContent = dayCount ? 'Nothing added to Day ' + (state.libDay + 1) + ' yet.' : 'Add a day, then click items into it.';
      wrap.appendChild(e);
      return;
    }

    var total = 0, any = false;
    day.items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'lib-day-plan-row';
      row.appendChild(el('div', 'lib-day-plan-dot'));

      var body = el('div', 'lib-day-plan-body');
      body.appendChild(el('div', 'lib-day-plan-name', it.title));
      if (it.eyebrow) body.appendChild(el('div', 'lib-day-plan-meta', it.eyebrow));
      row.appendChild(body);

      if (it.price != null) {
        row.appendChild(el('div', 'lib-day-plan-price', window.GGParser.money(it.price, 'INR')));
        total += it.price;
        any = true;
      }
      wrap.appendChild(row);
    });

    var footer = el('div', 'lib-day-plan-footer');
    var left = document.createElement('span');
    left.appendChild(el('b', null, String(day.items.length)));
    left.appendChild(document.createTextNode(' item' + (day.items.length === 1 ? '' : 's')));
    footer.appendChild(left);
    if (any) {
      var right = document.createElement('span');
      right.appendChild(el('b', null, window.GGParser.money(total, 'INR')));
      footer.appendChild(right);
    }
    wrap.appendChild(footer);
  }

  /* Tiny DOM helper, matching the one render.js uses - kept local so this
     file has no dependency on render.js's internals. */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function addLibraryItem(item) {
    var model = ensureModel();
    if (item.category === 'hotel') {
      model.hotels.push({
        city: state.libDest || '', name: item.name, dates: '', nights: '',
        meta: item.meta || '', price: item.price,
        bullets: item.description ? [item.description] : [],
        badge: '', image: item.image || ''
      });
    } else {
      while (model.days.length <= state.libDay) {
        var n = model.days.length + 1;
        model.days.push({ n: n, when: '', title: 'Day ' + n, image: '', items: [], total: null });
      }
      model.days[state.libDay].items.push({
        eyebrow: window.GGLibrary.CAT_LABEL[item.category] || '',
        title: item.name, detail: item.description, bullets: [], note: item.notes || '',
        price: item.price, image: item.image || '',
        part: window.GGParser.inferPart(item.name + ' ' + item.description) || 'morning'
      });
    }
    window.GGParser.recompute(model);
    rerender();
    writeCostInputs();
    refreshCosting();
    renderLibraryUI();
    renderItinerary();
    save();
    toast(item.category === 'hotel'
      ? item.name + ' added as a stay.'
      : item.name + ' added to Day ' + (state.libDay + 1) + '.');
  }

  $('btnImportExcel').addEventListener('click', function () {
    $('fileExcel').value = '';
    $('fileExcel').click();
  });

  $('btnLibTemplate').addEventListener('click', function () {
    window.GGLibrary.downloadTemplate();
  });

  $('fileExcel').addEventListener('change', function () {
    var f = $('fileExcel').files && $('fileExcel').files[0];
    if (!f) return;
    $('libStatus').textContent = 'Reading…';
    window.GGLibrary.readWorkbookFile(f).then(function (incoming) {
      var destCount = Object.keys(incoming).length;
      $('libStatus').textContent = '';
      if (!destCount) {
        toast('No usable rows found — each row needs at least a Name. Try the template.', true);
        return;
      }
      state.library = window.GGLibrary.mergeLibrary(state.library, incoming);
      window.GGLibrary.saveLibrary(state.library);
      state.libDest = Object.keys(incoming)[0];
      renderLibraryUI();
      var itemCount = Object.keys(incoming).reduce(function (a, d) { return a + incoming[d].length; }, 0);
      toast('Imported ' + itemCount + ' item' + (itemCount === 1 ? '' : 's') +
            ' across ' + destCount + ' destination' + (destCount === 1 ? '' : 's') + '.');
    }).catch(function () {
      $('libStatus').textContent = '';
      toast('Could not read that file — is it a .xlsx or .csv?', true);
    });
  });

  $('libDestRow').addEventListener('click', function (e) {
    var b = e.target.closest('.lib-dest');
    if (!b) return;
    state.libDest = b.dataset.dest;
    renderLibraryUI();
  });

  $('libCatTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.lib-tab');
    if (!b) return;
    state.libCat = b.dataset.cat;
    renderLibraryUI();
  });

  $('libDays').addEventListener('click', function (e) {
    if (e.target.closest('.lib-day-add')) {
      var model = ensureModel();
      var n = model.days.length + 1;
      model.days.push({ n: n, when: '', title: 'Day ' + n, image: '', items: [], total: null });
      state.libDay = model.days.length - 1;
      window.GGParser.recompute(model);
      rerender();
      renderLibraryUI();
      renderItinerary();
      save();
      return;
    }
    var chip = e.target.closest('.lib-day-chip');
    if (!chip) return;
    state.libDay = +chip.dataset.day;
    renderLibraryUI();
  });

  $('libItems').addEventListener('click', function (e) {
    var btn = e.target.closest('.lib-item-add');
    if (!btn || btn.disabled) return;
    var items = filteredLibraryItems(state.library[state.libDest] || []);
    var item = items[+btn.dataset.itemIndex];
    if (item) addLibraryItem(item);
  });

  /* Shared by the render and the click handler so both agree on exactly
     which items - and which index - are on screen right now. */
  function filteredLibraryItems(items) {
    var byCat = items.filter(function (it) { return it.category === state.libCat; });
    var q = (state.libSearch || '').trim().toLowerCase();
    if (!q) return byCat;
    return byCat.filter(function (it) {
      return ((it.name || '') + ' ' + (it.description || '')).toLowerCase().indexOf(q) > -1;
    });
  }

  var libSearchEl = $('libSearch');
  if (libSearchEl) {
    libSearchEl.addEventListener('input', function () {
      state.libSearch = libSearchEl.value;
      renderLibraryUI();
    });
  }

  /* ---- build navigation ----------------------------------------------------
     Overview / Itinerary / Activities / Quotation / Document - the whole
     tool used to read as one long form; grouping it like this, with the
     itinerary itself as the centrepiece, is the actual point of this pass. */

  var buildTabs = $('buildTabs');
  var SECTION_PAGE_LABEL = { overview: 'Package summary', quotation: 'Cost summary', document: 'Before you' };

  function setBuildTab(name) {
    Array.prototype.slice.call(document.querySelectorAll('.build-tab')).forEach(function (b) {
      b.classList.toggle('active', b.dataset.section === name);
    });
    Array.prototype.slice.call(document.querySelectorAll('.build-section')).forEach(function (s) {
      s.classList.toggle('active', s.dataset.section === name);
    });
    var scrollEl = document.querySelector('.panel-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
    scrollPreviewToSection(name);
  }

  /* A loose, best-effort link from a Build tab to the matching page - matched
     by the label already printed in each page's own header, so it needs no
     extra bookkeeping in render.js. */
  function scrollPreviewToSection(name) {
    if (!state.model) return;
    var key = SECTION_PAGE_LABEL[name];
    if (!key) return;
    var labels = docEl.querySelectorAll('.l1');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent.indexOf(key) === 0) {
        var page = labels[i].closest('.page');
        if (page) page.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }

  function scrollPreviewToCard(base) {
    var node = docEl.querySelector('[data-card="' + base + '"]');
    if (!node) return;
    if (isMobile()) setMobileTab('preview');
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('flash-highlight');
    setTimeout(function () { node.classList.remove('flash-highlight'); }, 1400);
  }

  function scrollPreviewToDay(i) {
    var node = docEl.querySelector('[data-day-head="days.' + i + '"]');
    if (!node) return;
    if (isMobile()) setMobileTab('preview');
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (buildTabs) {
    buildTabs.addEventListener('click', function (e) {
      var b = e.target.closest('.build-tab');
      if (b) setBuildTab(b.dataset.section);
    });
  }

  /* ---- itinerary tab ---------------------------------------------------
     Day cards instead of one long form: a compact row per activity, opened
     only on click. Everything here writes straight into state.model at the
     same paths the preview's own contenteditable nodes use, so both sides
     of the split stay in sync without a second copy of the data. */

  var itinDaysEl = $('itinDays');
  var dragSrc = null;

  function renderItinerary() {
    if (!itinDaysEl) return;
    itinDaysEl.textContent = '';
    var days = state.model ? state.model.days : [];
    if (!days || !days.length) {
      itinDaysEl.appendChild(el('div', 'itin-empty',
        'No days yet — paste your plan below, or add a day and build it from the Activity Library.'));
      return;
    }
    days.forEach(function (day, i) { itinDaysEl.appendChild(dayCardEl(day, i)); });
  }

  function labeledField(tag, label, path, value, type) {
    var wrap = el('div', 'itin-field');
    wrap.appendChild(el('span', null, label));
    var input = document.createElement(tag);
    if (tag === 'input') input.type = type || 'text';
    input.value = value != null ? value : '';
    input.dataset.path = path;
    input.addEventListener('input', function () {
      applyFieldEdit(path, input.value, input);
      commitIfNumeric(path);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function photoFieldEl(path, url) {
    var wrap = el('div', 'itin-field itin-photo-field');
    wrap.appendChild(el('span', null, 'Photo'));
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-outline btn-sm';
    btn.textContent = url ? 'Replace photo' : 'Add photo';
    btn.addEventListener('click', function () {
      state.photoPath = path;
      filePhoto.value = '';
      filePhoto.click();
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function itinMenuEl(actions, onAct) {
    var wrap = el('div', 'itin-activity-menu');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'itin-menu-btn'; btn.textContent = '•••'; btn.title = 'More actions';
    wrap.appendChild(btn);

    var menu = el('div', 'itin-menu-pop');
    menu.hidden = true;
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.act = a[0]; b.textContent = a[1];
      if (a[0] === 'delete') b.className = 'danger';
      menu.appendChild(b);
    });
    wrap.appendChild(menu);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasHidden = menu.hidden;
      closeAllPopovers();
      menu.hidden = !wasHidden;
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      e.stopPropagation();
      menu.hidden = true;
      onAct(b.dataset.act);
    });
    return wrap;
  }

  function renumberDays(model) {
    model.days.forEach(function (d, i) { d.n = i + 1; });
  }

  function dayCardEl(day, i) {
    var card = el('div', 'itin-day');
    card.dataset.dayIndex = i;

    var head = el('div', 'itin-day-head');
    var numSpan = el('span', 'itin-day-num', 'DAY ' + pad2(day.n || i + 1));
    numSpan.title = 'Jump to this day in the preview';
    numSpan.addEventListener('click', function () { scrollPreviewToDay(i); });
    head.appendChild(numSpan);

    var titleInput = document.createElement('input');
    titleInput.type = 'text'; titleInput.className = 'itin-day-title';
    titleInput.value = day.title || ''; titleInput.placeholder = 'Day title';
    titleInput.dataset.path = 'days.' + i + '.title';
    titleInput.addEventListener('input', function () { applyFieldEdit('days.' + i + '.title', titleInput.value, titleInput); });
    head.appendChild(titleInput);

    head.appendChild(itinMenuEl([['duplicate', 'Duplicate day'], ['delete', 'Delete day']], function (act) {
      if (act === 'delete') {
        if (state.model.days.length <= 1) { toast('An itinerary needs at least one day.', true); return; }
        if (!confirm('Delete this day and everything in it?')) return;
        state.model.days.splice(i, 1);
      } else if (act === 'duplicate') {
        var copy = JSON.parse(JSON.stringify(day));
        state.model.days.splice(i + 1, 0, copy);
      } else return;
      renumberDays(state.model);
      window.GGParser.recompute(state.model);
      rerender(); renderItinerary(); refreshCosting(); save();
    }));
    card.appendChild(head);

    var whenInput = document.createElement('input');
    whenInput.type = 'text'; whenInput.className = 'itin-day-when';
    whenInput.value = day.when || ''; whenInput.placeholder = 'Date · place';
    whenInput.dataset.path = 'days.' + i + '.when';
    whenInput.addEventListener('input', function () { applyFieldEdit('days.' + i + '.when', whenInput.value, whenInput); });
    card.appendChild(whenInput);

    var items = el('div', 'itin-items');
    day.items.forEach(function (it, j) { items.appendChild(activityRowEl(it, i, j)); });
    card.appendChild(items);

    card.appendChild(addActivityButtonEl(i));
    return card;
  }

  function activityRowEl(it, dayIdx, itemIdx) {
    var base = 'days.' + dayIdx + '.items.' + itemIdx;
    var row = el('div', 'itin-activity');
    row.dataset.day = dayIdx; row.dataset.item = itemIdx;
    row.draggable = true;

    var open = !!state.itinOpen[base];

    var summary = el('div', 'itin-activity-summary');
    summary.appendChild(el('span', 'itin-activity-drag', '⠿'));
    summary.appendChild(el('span', 'itin-activity-time', it.eyebrow || '—'));
    summary.appendChild(el('span', 'itin-activity-title', it.title || 'Untitled activity'));
    if (it.price != null) summary.appendChild(el('span', 'itin-activity-price', window.GGParser.money(it.price, 'INR')));
    summary.appendChild(itinMenuEl(
      [['up', 'Move up'], ['down', 'Move down'], ['duplicate', 'Duplicate'], ['delete', 'Delete']],
      function (act) { runActivityAction(act, dayIdx, itemIdx); }
    ));
    row.appendChild(summary);

    var detail = el('div', 'itin-activity-detail');
    detail.hidden = !open;
    detail.appendChild(labeledField('input', 'Name', base + '.title', it.title));
    detail.appendChild(labeledField('input', 'Time / label', base + '.eyebrow', it.eyebrow));
    detail.appendChild(labeledField('textarea', 'Description', base + '.detail', it.detail));
    detail.appendChild(labeledField('input', 'Cost (₹)', base + '.priceText', it.price != null ? String(it.price) : '', 'number'));
    detail.appendChild(labeledField('textarea', 'Notes', base + '.note', it.note));
    detail.appendChild(photoFieldEl(base + '.image', it.image));
    row.appendChild(detail);
    if (open) row.classList.add('open');

    summary.addEventListener('click', function (e) {
      if (e.target.closest('.itin-activity-menu') || e.target.closest('.itin-activity-drag')) return;
      var willOpen = detail.hidden;
      detail.hidden = !willOpen;
      row.classList.toggle('open', willOpen);
      if (willOpen) { state.itinOpen[base] = true; scrollPreviewToCard(base); }
      else delete state.itinOpen[base];
    });

    return row;
  }

  function runActivityAction(act, dayIdx, itemIdx) {
    var list = state.model.days[dayIdx].items;
    if (act === 'delete') list.splice(itemIdx, 1);
    else if (act === 'up' && itemIdx > 0) list.splice(itemIdx - 1, 0, list.splice(itemIdx, 1)[0]);
    else if (act === 'down' && itemIdx < list.length - 1) list.splice(itemIdx + 1, 0, list.splice(itemIdx, 1)[0]);
    else if (act === 'duplicate') list.splice(itemIdx + 1, 0, JSON.parse(JSON.stringify(list[itemIdx])));
    else return;
    window.GGParser.recompute(state.model);
    rerender(); renderItinerary(); refreshCosting(); save();
  }

  function addActivityButtonEl(dayIdx) {
    var wrap = el('div', 'itin-add-activity');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'itin-add-btn'; btn.textContent = '+ Add activity';
    wrap.appendChild(btn);

    var menu = el('div', 'itin-menu-pop itin-add-menu');
    menu.hidden = true;
    [['new', 'Create new'], ['library', 'From Activity Library'],
     ['hotel', 'Hotel'], ['transfer', 'Transfer'], ['visa', 'Visa']].forEach(function (p) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.act = p[0]; b.textContent = p[1];
      menu.appendChild(b);
    });
    wrap.appendChild(menu);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasHidden = menu.hidden;
      closeAllPopovers();
      menu.hidden = !wasHidden;
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      e.stopPropagation();
      menu.hidden = true;
      addActivity(dayIdx, b.dataset.act);
    });
    return wrap;
  }

  function addActivity(dayIdx, kind) {
    var model = ensureModel();
    if (kind === 'library') {
      setBuildTab('activities');
      state.libDay = dayIdx;
      renderLibraryUI();
      if (libSearchEl) libSearchEl.focus();
      return;
    }
    if (kind === 'hotel') {
      model.hotels.push({ city: '', name: '', dates: '', nights: '', meta: '', price: null, bullets: [], badge: '', image: '' });
      window.GGParser.recompute(model); rerender(); renderItinerary(); refreshCosting(); save();
      toast('Hotel added — fill it in on the preview.');
      return;
    }
    while (model.days.length <= dayIdx) {
      var n = model.days.length + 1;
      model.days.push({ n: n, when: '', title: 'Day ' + n, image: '', items: [], total: null });
    }
    var eyebrow = kind === 'transfer' ? 'Transfer' : kind === 'visa' ? 'Visa' : '';
    model.days[dayIdx].items.push({
      eyebrow: eyebrow, title: '', detail: '', bullets: [], note: '', price: null, image: '', part: 'morning'
    });
    window.GGParser.recompute(model);
    rerender();
    var newIdx = model.days[dayIdx].items.length - 1;
    state.itinOpen['days.' + dayIdx + '.items.' + newIdx] = true;
    renderItinerary();
    refreshCosting();
    save();
    var input = itinDaysEl.querySelector(
      '.itin-activity[data-day="' + dayIdx + '"][data-item="' + newIdx + '"] .itin-field input');
    if (input) input.focus();
  }

  var btnAddDay = $('btnAddDay');
  if (btnAddDay) {
    btnAddDay.addEventListener('click', function () {
      var model = ensureModel();
      var n = model.days.length + 1;
      model.days.push({ n: n, when: '', title: 'Day ' + n, image: '', items: [], total: null });
      window.GGParser.recompute(model);
      rerender(); renderItinerary(); refreshCosting(); save();
    });
  }

  /* Drag to reorder activities, within a day or across days - plain HTML5
     drag and drop, no library, just another set of array splices. */
  if (itinDaysEl) {
    itinDaysEl.addEventListener('dragstart', function (e) {
      var row = e.target.closest('.itin-activity');
      if (!row) return;
      dragSrc = { day: +row.dataset.day, item: +row.dataset.item };
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    itinDaysEl.addEventListener('dragend', function (e) {
      var row = e.target.closest('.itin-activity');
      if (row) row.classList.remove('dragging');
      Array.prototype.slice.call(itinDaysEl.querySelectorAll('.drag-over')).forEach(function (r) {
        r.classList.remove('drag-over');
      });
    });
    itinDaysEl.addEventListener('dragover', function (e) {
      if (!dragSrc) return;
      var row = e.target.closest('.itin-activity');
      if (!row) return;
      e.preventDefault();
      row.classList.add('drag-over');
    });
    itinDaysEl.addEventListener('dragleave', function (e) {
      var row = e.target.closest('.itin-activity');
      if (row) row.classList.remove('drag-over');
    });
    itinDaysEl.addEventListener('drop', function (e) {
      var row = e.target.closest('.itin-activity');
      if (!row || !dragSrc) { dragSrc = null; return; }
      e.preventDefault();
      row.classList.remove('drag-over');
      var destDay = +row.dataset.day, destItem = +row.dataset.item;
      var model = state.model;
      var moved = model.days[dragSrc.day].items.splice(dragSrc.item, 1)[0];
      if (dragSrc.day === destDay && dragSrc.item < destItem) destItem--;
      model.days[destDay].items.splice(destItem, 0, moved);
      window.GGParser.recompute(model);
      rerender(); renderItinerary(); refreshCosting(); save();
      dragSrc = null;
    });
  }

  /* ---- document lists (inclusions / exclusions / terms) -------------------
     Plain text lists that already exist in the model and print on their own
     pages - editable here as add/remove rows, on top of editing them
     directly in the preview the way every other line already works. */

  var DOC_LISTS = { inclusions: 'docInclusions', exclusions: 'docExclusions', terms: 'docTerms' };

  function renderDocList(key) {
    var wrap = $(DOC_LISTS[key]);
    if (!wrap) return;
    wrap.textContent = '';
    var arr = state.model ? state.model[key] : [];
    if (!arr || !arr.length) {
      wrap.appendChild(el('div', 'doc-list-empty', 'Nothing yet — add the first one below.'));
      return;
    }
    arr.forEach(function (text, i) {
      var path = key + '.' + i;
      var row = el('div', 'doc-list-row');
      var input = document.createElement('input');
      input.type = 'text'; input.value = text; input.dataset.path = path;
      input.addEventListener('input', function () { applyFieldEdit(path, input.value, input); });
      row.appendChild(input);

      var del = document.createElement('button');
      del.type = 'button'; del.className = 'doc-list-del'; del.title = 'Remove'; del.textContent = '×';
      del.addEventListener('click', function () {
        state.model[key].splice(i, 1);
        rerender(); renderDocLists(); save();
      });
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function renderDocLists() {
    renderDocList('inclusions');
    renderDocList('exclusions');
    renderDocList('terms');
  }

  Array.prototype.slice.call(document.querySelectorAll('.doc-list-add')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.list;
      var model = ensureModel();
      model[key].push('');
      rerender(); renderDocLists(); save();
      var wrap = $(DOC_LISTS[key]);
      var last = wrap && wrap.querySelector('.doc-list-row:last-child input');
      if (last) last.focus();
    });
  });

  /* ---- preview toolbar extras --------------------------------------------- */

  var pageObserver = null;
  function setupPageObserver() {
    if (pageObserver) pageObserver.disconnect();
    var pages = Array.prototype.slice.call(docEl.querySelectorAll('.page'));
    var indicatorEl = $('pageIndicator');
    if (!pages.length) { if (indicatorEl) indicatorEl.textContent = ''; return; }
    var visible = new Map();
    pageObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible.set(en.target, en.intersectionRatio); });
      var best = 0, bestRatio = 0;
      pages.forEach(function (p, i) {
        var r = visible.get(p) || 0;
        if (r > bestRatio) { bestRatio = r; best = i; }
      });
      if (indicatorEl) indicatorEl.textContent = (best + 1) + ' / ' + pages.length;
    }, { root: paperScroll, threshold: [0, 0.25, 0.5, 0.75, 1] });
    pages.forEach(function (p) { pageObserver.observe(p); });
    if (indicatorEl) indicatorEl.textContent = '1 / ' + pages.length;
  }

  var zoomLabelBtn = $('zoomLabel');
  if (zoomLabelBtn) {
    zoomLabelBtn.addEventListener('click', function () { state.zoom = 0; applyZoom(); });
  }

  var btnFullscreen = $('btnFullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', function () {
      var target = document.querySelector('.panel-preview');
      var req = target.requestFullscreen || target.webkitRequestFullscreen;
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!document.fullscreenElement) { if (req) req.call(target); }
      else if (exit) exit.call(document);
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
    $('f-layout').value = 'editorial';
    syncLayoutPickerUI();
    ['c-margin', 'c-gst', 'c-tcs', 'c-discount'].forEach(function (id) { $(id).value = ''; });
    $('c-showMargin').checked = false;
    refreshCosting();
    // The library itself is reusable inventory, not part of one trip - it
    // is deliberately not cleared here.
    state.libDay = 0;
    state.itinOpen = {};
    renderLibraryUI();
    renderItinerary();
    renderDocLists();
    docEl.textContent = '';
    emptyState.hidden = false;
    $('rawCount').textContent = '0 lines';
    updateTripName();
    resetHistory();
    setBuildTab('overview');
    toast('Cleared. Ready for the next trip.');
    startOnboarding();
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
    'Discount | 5000',
    '',
    'Terms',
    'Cancellations accepted up to 7 days before departure; non-refundable components are deducted first.',
    'Flights, including any internal transfers, are not included and must be arranged independently.',
    'Hotel check-in is from 2:00 PM and check-out by 11:00 AM.',
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

  state.library = window.GGLibrary.loadLibrary();

  setMobileTab('build');
  updateChromeForWidth();

  /* Both the wizard and the split view start hidden in the HTML, so there is
     no flash of the wrong one. The split view is revealed first because
     restore() renders into it directly - pagination measures real
     scrollHeight, and a hidden ancestor at that moment would corrupt it the
     same way an inactive mobile tab did before. All of this runs
     synchronously before the browser's first paint, so a fresh visitor
     never actually sees the split view before the wizard replaces it. */
  if (splitEl) splitEl.hidden = false;
  if (mobileTabs) mobileTabs.hidden = false;
  if (restore()) {
    if (onboardEl) onboardEl.hidden = true;
    setBuildTab('itinerary');
  } else {
    emptyState.hidden = false;
    syncThemeSwatchUI();
    syncLayoutPickerUI();
    startOnboarding();
  }
  renderLibraryUI();
  $('raw').dispatchEvent(new Event('input'));

  preloadLogos().then(function () {
    // Re-render once the brand logos are inlined as data URIs, so a trip
    // restored before this resolved still exports reliably - see the
    // comment on preloadLogos() itself for why that inlining matters.
    if (state.model) rerender();
  });
})();
