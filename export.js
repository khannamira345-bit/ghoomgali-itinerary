/* ==========================================================================
   Ghoomgali Itinerary Maker - exports
   Everything runs in the browser: no server, no API, no per-document cost.
     PDF   print ready, page for page identical to the preview
     DOCX  a real Word file, text and images editable
     HTML  self contained, still editable, prints straight to PDF
     GGI   the project file, reopened by this app
   ========================================================================== */
(function () {
  'use strict';

  var C = window.GG.colour;

  /* ---- shared ----------------------------------------------------------- */

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function slug(s) {
    return String(s || 'itinerary').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'itinerary';
  }

  function fileName(model, ext) {
    return 'ghoom-gali-' + slug(model.meta.title) + '.' + ext;
  }

  /* Wait for every image inside a node to be decoded before rasterising. */
  function imagesReady(node) {
    var imgs = Array.prototype.slice.call(node.querySelectorAll('img'));
    return Promise.all(imgs.map(function (im) {
      if (im.complete && im.naturalWidth) return Promise.resolve();
      return new Promise(function (res) {
        im.addEventListener('load', res, { once: true });
        im.addEventListener('error', res, { once: true });
        setTimeout(res, 6000);
      });
    }));
  }

  /* ---- PDF -------------------------------------------------------------- */

  async function toPDF(docEl, model, progress) {
    var pages = Array.prototype.slice.call(docEl.querySelectorAll('.page'));
    if (!pages.length) throw new Error('Nothing to export yet.');

    var priorTransform = docEl.style.transform;
    docEl.style.transform = 'none';           // capture at true 1:1
    docEl.classList.add('exporting');

    try {
      await imagesReady(docEl);
      if (document.fonts && document.fonts.ready) await document.fonts.ready;

      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

      for (var i = 0; i < pages.length; i++) {
        if (progress) progress(i + 1, pages.length);
        var canvas = await html2canvas(pages[i], {
          scale: 2.5,                          // ~240 dpi on A4
          backgroundColor: null,
          useCORS: true,
          allowTaint: false,
          logging: false,
          windowWidth: 794,
          width: 794,
          height: 1123
        });
        var data = canvas.toDataURL('image/jpeg', 0.94);
        if (i) pdf.addPage();
        pdf.addImage(data, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }

      pdf.setProperties({
        title: model.meta.title || 'Itinerary',
        subject: 'Travel itinerary',
        author: model.meta.preparedBy || 'Ghoom Gali',
        creator: 'Ghoomgali Itinerary Maker'
      });
      pdf.save(fileName(model, 'pdf'));
    } finally {
      docEl.classList.remove('exporting');
      docEl.style.transform = priorTransform;
    }
  }

  /* ---- editable HTML ---------------------------------------------------- */

  async function inlineLogos(root) {
    var srcs = {};
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    await Promise.all(imgs.map(async function (im) {
      var src = im.getAttribute('src') || '';
      if (src.indexOf('data:') === 0) return;
      if (src.indexOf('assets/') !== 0) return;
      if (!srcs[src]) {
        try {
          var txt = await (await fetch(src)).text();
          srcs[src] = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(txt)));
        } catch (e) { srcs[src] = src; }
      }
      im.setAttribute('src', srcs[src]);
    }));
  }

  async function toHTML(docEl, model) {
    var css = '';
    try { css = await (await fetch('doc.css')).text(); } catch (e) {}

    var clone = docEl.cloneNode(true);
    clone.classList.remove('exporting');
    clone.style.transform = '';
    Array.prototype.slice.call(clone.querySelectorAll('.photo-slot')).forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    await inlineLogos(clone);

    var title = (model.meta.title || 'Itinerary') + ' — Ghoom Gali';
    var html =
'<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>' + esc(title) + '</title>\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">\n' +
'<style>\n' +
'body{margin:0;background:#E4DED7;font-family:"Hanken Grotesk",Helvetica,Arial,sans-serif}\n' +
'.wrap{display:flex;flex-direction:column;align-items:center;gap:22px;padding:26px}\n' +
'.editbar{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:14px;\n' +
'  background:#0C2027;color:#EEE9E3;padding:11px 18px;font-size:13px}\n' +
'.editbar b{font-weight:600}\n' +
'.editbar span{opacity:.7;font-size:12px}\n' +
'.editbar button{margin-left:auto;background:#41BF8F;border:none;color:#0C2027;font-weight:600;\n' +
'  font-size:12.5px;padding:8px 16px;border-radius:999px;cursor:pointer;font-family:inherit}\n' +
'@media print{.editbar{display:none}.wrap{padding:0;gap:0;background:#fff}\n' +
'  .page{box-shadow:none!important;page-break-after:always;break-after:page}\n' +
/* the editing hints must never reach paper */
'  [contenteditable]:empty::before{content:none!important}\n' +
'  [contenteditable]:empty{display:none!important}\n' +
'  [contenteditable]{box-shadow:none!important;background:none!important}}\n' +
css + '\n</style>\n</head>\n<body>\n' +
'<div class="editbar"><b>Editable copy</b>' +
'<span>Click any text to change it, then use Print to save a fresh PDF. Edits live in this file only until you print.</span>' +
'<button onclick="window.print()">Print / Save as PDF</button></div>\n' +
'<div class="wrap">' + clone.outerHTML + '</div>\n' +
'</body>\n</html>';

    download(new Blob([html], { type: 'text/html;charset=utf-8' }), fileName(model, 'html'));
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---- project file ----------------------------------------------------- */

  function toProject(model) {
    var payload = { app: 'ghoomgali-itinerary', version: 1, saved: new Date().toISOString(), model: model };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      fileName(model, 'ggi'));
  }

  function readProject(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result);
          if (!d || !d.model || !Array.isArray(d.model.days)) throw new Error('bad');
          res(d.model);
        } catch (e) { rej(new Error('That does not look like a Ghoom Gali project file.')); }
      };
      r.onerror = function () { rej(new Error('Could not read that file.')); };
      r.readAsText(file);
    });
  }

  /* ---- DOCX ------------------------------------------------------------- */
  /* A minimal but valid WordprocessingML package, written by hand so the app
     stays dependency free apart from JSZip. */

  var EMU_PER_CM = 360000;
  var media = [];      // {name, data(base64), w, h}

  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function run(text, o) {
    o = o || {};
    var f = o.font || window.GG.docxFonts.text;
    // CT_RPr is a strict sequence: rFonts, b, i, caps, color, spacing, sz, szCs.
    // Word rejects the file outright if these arrive out of order.
    var rpr = '<w:rPr>' +
      '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:cs="' + f + '"/>' +
      (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') +
      (o.caps ? '<w:caps/>' : '') +
      (o.color ? '<w:color w:val="' + o.color.replace('#', '') + '"/>' : '') +
      (o.spacing ? '<w:spacing w:val="' + o.spacing + '"/>' : '') +
      (o.size ? '<w:sz w:val="' + (o.size * 2) + '"/><w:szCs w:val="' + (o.size * 2) + '"/>' : '') +
      '</w:rPr>';
    return '<w:r>' + rpr + '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
  }

  function para(runs, o) {
    o = o || {};
    // CT_PPr is a strict sequence too: pBdr, shd, spacing, ind, jc.
    var ppr = '<w:pPr>' +
      (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="' +
        o.border.replace('#', '') + '"/></w:pBdr>' : '') +
      (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade.replace('#', '') + '"/>' : '') +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 120 : o.after) + '"' +
      (o.line ? ' w:line="' + o.line + '" w:lineRule="auto"' : '') + '/>' +
      (o.indent ? '<w:ind w:left="' + o.indent + '"/>' : '') +
      (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') +
      '</w:pPr>';
    return '<w:p>' + ppr + (Array.isArray(runs) ? runs.join('') : runs) + '</w:p>';
  }

  function pageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  /* Load any image source into base64 + natural size. SVG is rasterised
     through a canvas so Word (which cannot place SVG) still shows the mark. */
  function loadImage(src, rasterWidth) {
    return new Promise(function (res) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () {
        try {
          var w = rasterWidth || im.naturalWidth || 600;
          var h = Math.round(w * (im.naturalHeight / im.naturalWidth));
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.drawImage(im, 0, 0, w, h);
          var url = cv.toDataURL('image/png');
          res({ data: url.split(',')[1], w: w, h: h, ext: 'png' });
        } catch (e) { res(null); }         // tainted canvas (remote host, no CORS)
      };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }

  async function addImage(src, rasterWidth) {
    var got = await loadImage(src, rasterWidth || 900);
    if (!got) return null;
    var name = 'image' + (media.length + 1) + '.png';
    media.push({ name: name, data: got.data, w: got.w, h: got.h });
    return { rid: 'rIdImg' + media.length, index: media.length, w: got.w, h: got.h };
  }

  function drawing(ref, cmWide) {
    var cx = Math.round(cmWide * EMU_PER_CM);
    var cy = Math.round(cx * (ref.h / ref.w));
    var id = 100 + ref.index;
    return '<w:p><w:pPr><w:spacing w:before="60" w:after="160"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="Picture ' + id + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="Picture ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + ref.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  async function toDOCX(model) {
    media = [];
    var F = window.GG.docxFonts;
    var P = window.GGParser;
    var m = model.meta;
    var body = [];
    var i, j;

    function inr(n) { return n == null || !isFinite(n) ? '' : P.money(n, 'INR'); }

    async function picture(src, cm) {
      if (!src) return;
      var ref = await addImage(src, 1200);
      if (ref) body.push(drawing(ref, cm));
    }

    /* ---- cover ---- */
    var logo = await addImage(window.GG.logos.lockupAbyss, 900);
    if (logo) body.push(drawing(logo, 5.4));

    body.push(para(run('TRAVEL ITINERARY' + (m.preparedOn ? '  ·  PREPARED ' + m.preparedOn.toUpperCase() : ''),
      { font: F.mono, size: 8, color: C.chai, spacing: 60 }), { after: 220 }));
    body.push(para([
      run((m.title || 'Itinerary') + ' ', { font: F.display, size: 30, color: C.abyss }),
      run(m.titleAccent || '', { font: F.display, size: 30, i: true, color: C.chai })
    ], { after: 110 }));
    if (m.subtitle) {
      body.push(para(run(m.subtitle, { size: 11.5, color: '4A585D' }), { after: 240 }));
    }
    [['Travel dates', m.dates], ['Duration', m.duration],
     ['Travelers', m.party], ['Destinations', m.destinations]
    ].forEach(function (row) {
      if (!row[1]) return;
      body.push(para([
        run(row[0].toUpperCase() + '   ', { font: F.mono, size: 8, color: C.chai, spacing: 40 }),
        run(row[1], { size: 11, color: C.abyss, b: true })
      ], { after: 80 }));
    });
    await picture(model.cover && model.cover.image, 16);

    /* ---- accommodation ---- */
    if (model.hotels.length) {
      body.push(pageBreak());
      body.push(para(run('PACKAGE SUMMARY', { font: F.mono, size: 9, color: C.chai, spacing: 60 }), { after: 60 }));
      body.push(para(run('Your journey at a glance', { font: F.display, size: 22, color: C.abyss }),
        { after: 220, border: C.mint }));

      for (i = 0; i < model.hotels.length; i++) {
        var h = model.hotels[i];
        body.push(para([
          run((h.city || '').toUpperCase() + '   ', { font: F.mono, size: 8, color: C.chai, spacing: 40 }),
          run(inr(h.price), { font: F.mono, size: 9, b: true, color: C.canopy })
        ], { before: 180, after: 50 }));
        body.push(para(run(h.name || '', { font: F.display, size: 15, color: C.abyss }), { after: 40 }));
        var hmeta = h.meta != null ? h.meta : [h.dates, h.nights].filter(Boolean).join(' · ');
        if (hmeta) body.push(para(run(hmeta, { size: 10, color: '6B777B' }), { after: 90 }));
        h.bullets.forEach(function (b) {
          body.push(para([run('•   ', { color: C.chai }), run(b, { size: 10.5, color: C.abyss })],
            { after: 50, indent: 220 }));
        });
        if (h.badge) {
          body.push(para(run(h.badge, { font: F.mono, size: 8.5, color: C.canopy }),
            { after: 100, indent: 220, shade: C.lightMint }));
        }
        await picture(h.image, 10);
      }
    }

    /* ---- days ---- */
    for (i = 0; i < model.days.length; i++) {
      var d = model.days[i];
      body.push(pageBreak());

      body.push(para(run('DAY ' + (d.n < 10 ? '0' : '') + d.n + (d.when ? '   ·   ' + d.when.toUpperCase() : ''),
        { font: F.mono, size: 9, color: C.mint, spacing: 60 }), { after: 60 }));
      body.push(para(run(d.title || '', { font: F.display, size: 21, color: C.abyss }),
        { after: 200, border: C.mint }));
      await picture(d.image, 16);

      for (j = 0; j < d.items.length; j++) {
        var it = d.items[j];
        if (it.eyebrow) {
          body.push(para(run(it.eyebrow.toUpperCase(),
            { font: F.mono, size: 8, color: C.chai, spacing: 40 }), { before: 160, after: 50 }));
        }
        body.push(para([
          run(it.title || '', { font: F.display, size: 15, color: C.abyss }),
          run(it.price != null ? '     ' + inr(it.price) : '',
            { font: F.mono, size: 10, b: true, color: C.canopy })
        ], { after: it.detail ? 50 : 90 }));
        if (it.detail) {
          body.push(para(run(it.detail, { size: 10.5, color: '4A585D' }), { after: 80 }));
        }
        it.bullets.forEach(function (b) {
          body.push(para([run('•   ', { color: C.chai }), run(b, { size: 10.5, color: C.abyss })],
            { after: 50, indent: 220 }));
        });
        if (it.note) {
          body.push(para(run(it.note, { font: F.mono, size: 8.5, color: '8A9498' }), { after: 100, indent: 220 }));
        }
        await picture(it.image, 9);
      }

      if (d.total != null) {
        body.push(para([
          run('DAY ' + (d.n < 10 ? '0' : '') + d.n + ' TOTAL      ',
            { font: F.mono, size: 10, color: C.abyss, spacing: 40, b: true }),
          run(inr(d.total), { font: F.mono, size: 11, b: true, color: C.canopy })
        ], { before: 200, after: 140, shade: C.lightMint }));
      }
    }

    /* ---- inclusions and notes ---- */
    if (model.inclusions.length || model.exclusions.length || model.notes) {
      body.push(pageBreak());
      body.push(para(run('BEFORE YOU GO', { font: F.mono, size: 9, color: C.chai, spacing: 60 }), { after: 60 }));
      body.push(para(run('Good to know', { font: F.display, size: 22, color: C.abyss }),
        { after: 220, border: C.mint }));

      if (model.inclusions.length) {
        body.push(para(run('INCLUDED', { font: F.mono, size: 9, color: C.canopy, spacing: 50 }), { after: 100 }));
        model.inclusions.forEach(function (t) {
          body.push(para([run('+   ', { font: F.mono, color: C.mint, size: 10.5 }),
                          run(t, { size: 10.5, color: C.abyss })], { after: 70, indent: 200 }));
        });
      }
      if (model.exclusions.length) {
        body.push(para(run('NOT INCLUDED', { font: F.mono, size: 9, color: C.chai, spacing: 50 }),
          { before: 200, after: 100 }));
        model.exclusions.forEach(function (t) {
          body.push(para([run('–   ', { font: F.mono, color: C.chai, size: 10.5 }),
                          run(t, { size: 10.5, color: C.abyss })], { after: 70, indent: 200 }));
        });
      }
      if (model.notes) {
        body.push(para(run('PLEASE NOTE', { font: F.mono, size: 9, color: C.chai, spacing: 50 }),
          { before: 240, after: 100 }));
        body.push(para(run(model.notes, { size: 10.5, color: '4A585D' }), { after: 120 }));
      }
    }

    /* ---- pricing ---- */
    var p = model.pricing;
    if (p && p.grandTotal) {
      body.push(pageBreak());
      body.push(para(run('COST SUMMARY', { font: F.mono, size: 9, color: C.chai, spacing: 60 }), { after: 60 }));
      body.push(para(run('Pricing summary', { font: F.display, size: 22, color: C.abyss }),
        { after: 220, border: C.mint }));

      function line(label, amount, hi) {
        if (amount == null || !isFinite(amount) || !amount) return;
        body.push(para([
          run(label + '        ', { size: 11, b: !!hi, color: C.abyss }),
          run(inr(amount), { font: F.mono, size: 10.5, b: !!hi, color: hi ? C.canopy : C.abyss })
        ], { after: 70, shade: hi ? C.lightMint : null }));
      }
      line('Total activity cost', p.activityTotal);
      line('Total accommodation cost', p.hotelTotal);
      line('Total base cost', p.baseCost, true);
      p.extras.forEach(function (e) { line(e.label, e.amount); });
      line('Margin', p.margin);
      line('Subtotal', p.subtotal, true);
      if (p.gst) line('GST (' + p.gstPct + '%)', p.gst);
      if (p.tcs) line('TCS (' + p.tcsPct + '%)', p.tcs);

      body.push(para(run('GRAND TOTAL' + (m.party ? '  ·  FOR ' + m.party.toUpperCase() : ''),
        { font: F.mono, size: 9, color: C.canopy, spacing: 60 }), { before: 260, after: 70 }));
      body.push(para(run(inr(p.grandTotal), { font: F.display, size: 26, color: C.abyss }), { after: 120 }));
      if (p.perPerson) {
        body.push(para(run('Cost per person   ' + inr(p.perPerson),
          { font: F.mono, size: 10, color: C.chai }), { after: 200 }));
      }
    }

    if (m.closing) {
      body.push(para(run(m.closing, { font: F.display, size: 13, i: true, color: '4A585D' }),
        { before: 280, after: 140 }));
    }
    if (logo) body.push(drawing(logo, 4.6));
    if (m.preparedBy) {
      body.push(para(run('Prepared by ' + m.preparedBy, { font: F.mono, size: 9, color: C.canopy }), { after: 60 }));
    }

    /* Section: A4 with 2.2cm margins */
    var sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr>';

    var document_xml =
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
'<w:body>' + body.join('') + sect + '</w:body></w:document>';

    var rels = ['<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
    media.forEach(function (m, k) {
      rels.push('<Relationship Id="rIdImg' + (k + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>');
    });

    var zip = new JSZip();
    zip.file('[Content_Types].xml',
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
'<Default Extension="xml" ContentType="application/xml"/>' +
'<Default Extension="png" ContentType="image/png"/>' +
'<Default Extension="jpeg" ContentType="image/jpeg"/>' +
'<Default Extension="jpg" ContentType="image/jpeg"/>' +
'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
'</Types>');

    zip.folder('_rels').file('.rels',
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
'</Relationships>');

    var w = zip.folder('word');
    w.file('document.xml', document_xml);
    w.file('styles.xml',
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
'<w:docDefaults><w:rPrDefault><w:rPr>' +
'<w:rFonts w:ascii="' + F.text + '" w:hAnsi="' + F.text + '"/>' +
'<w:color w:val="0C2027"/><w:sz w:val="21"/>' +
'</w:rPr></w:rPrDefault></w:docDefaults></w:styles>');
    w.folder('_rels').file('document.xml.rels',
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
rels.join('') + '</Relationships>');

    var mediaFolder = w.folder('media');
    media.forEach(function (m) { mediaFolder.file(m.name, m.data, { base64: true }); });

    var blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE'
    });
    download(blob, fileName(model, 'docx'));
  }

  window.GGExport = {
    pdf: toPDF, docx: toDOCX, html: toHTML,
    project: toProject, readProject: readProject
  };
})();
