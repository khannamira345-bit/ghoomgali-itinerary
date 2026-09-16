/* Splash — plays once per browser session. Loaded straight after the splash
   markup (before the heavy vendor scripts) so that, when it has already
   played, it is removed before first paint.

   It leaves as soon as both are true: the app has run (DOMContentLoaded fires
   after app.js, which is the last script) and the logo animation has had its
   ~1.25s. It never waits on images. A click or any key skips straight to the
   hand-off, where the lockup flies onto the topbar logo. */
(function () {
  var el = document.getElementById('splash');
  if (!el) return;

  var KEY = 'gg-splash-seen';
  var seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  if (seen) { el.remove(); return; }
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MIN_MS = reduced ? 600 : 1400;
  var start = performance.now();
  var gone = false;

  function remove() {
    document.removeEventListener('keydown', leave);
    el.remove();
  }

  function leave() {
    if (gone) return;
    gone = true;

    var art = el.querySelector('.splash-art');
    var logo = document.querySelector('.topbar-logo');
    var from = art.getBoundingClientRect();
    var to = logo && logo.getBoundingClientRect();

    if (reduced || !to || !to.width || !from.width) {
      el.classList.add('is-leaving');
      setTimeout(remove, 320);
      return;
    }

    // Skipped mid-flight: jump every beat to its end state first, so what
    // travels to the topbar is the finished lockup.
    if (el.getAnimations) {
      el.getAnimations({ subtree: true }).forEach(function (a) {
        try { a.finish(); } catch (e) {}
      });
    }

    // FLIP: the art and the topbar logo share one 900x450 viewBox, so a
    // translate + uniform scale lands it exactly on top of the real logo.
    // The backdrop's iris closes on the logo's centre, starting from a radius
    // that reaches the farthest corner of the window.
    var cx = to.left + to.width / 2, cy = to.top + to.height / 2;
    el.style.setProperty('--cx', cx + 'px');
    el.style.setProperty('--cy', cy + 'px');
    el.style.setProperty('--r',
      Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 'px');
    el.getBoundingClientRect(); // commit the full circle before it transitions

    var s = to.width / from.width;
    el.style.setProperty('--to',
      'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px) scale(' + s + ')');
    el.classList.add('is-handoff');
    setTimeout(remove, 520);
  }

  function leaveWhenReady() {
    setTimeout(leave, Math.max(0, MIN_MS - (performance.now() - start)));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', leaveWhenReady);
  } else {
    leaveWhenReady();
  }

  el.addEventListener('click', leave);
  document.addEventListener('keydown', leave);
})();
