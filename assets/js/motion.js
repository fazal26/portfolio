/* ============================================================
   Motion layer

   Everything degrades to a correct static page:
   - no JS          -> html.js never set, so nothing is hidden
   - reduced motion -> content is revealed, nothing tracks scroll
   - no IO support  -> everything revealed immediately

   Work is split deliberately: revealing content is on the critical
   path, decoration waits for idle so it cannot block interaction.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- scheduler ---------- */
  var queue = [];
  function drain() { while (queue.length) { try { queue.shift()(); } catch (e) {} } }
  function fire() {
    if (window.requestIdleCallback) requestIdleCallback(drain, { timeout: 1500 });
    else setTimeout(drain, 200);
  }
  function whenIdle(fn) { queue.push(fn); }
  if (document.readyState === 'complete') fire();
  else addEventListener('load', fire, { once: true });

  /* ---------- 1. scroll reveal (critical path) ---------- */
  var revealables = document.querySelectorAll('.reveal, .stagger');

  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        if (e.target.hasAttribute('data-count')) runCounters(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) { io.observe(el); });
  }

  /* ---------- 2. counters ---------- */
  function runCounters(host) {
    var targets = host.matches('[data-count]') ? [host] : host.querySelectorAll('[data-count]');
    Array.prototype.forEach.call(targets, function (el) {
      var end = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(end)) return;
      var pad = el.getAttribute('data-pad') === 'true';
      var render = function (v) { el.textContent = pad && v < 10 ? '0' + v : String(v); };
      if (reduced) { render(end); return; }
      var start = performance.now(), dur = 900;
      (function tick(now) {
        var p = Math.min((now - start) / dur, 1);
        render(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    });
  }

  /* ---------- 3. pointer glow (idle) ---------- */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    whenIdle(function () {
      var glowables = document.querySelectorAll('.card, .craft, .svc, .stack-features .item, .contact-card');
      Array.prototype.forEach.call(glowables, function (el) {
        el.addEventListener('pointermove', function (ev) {
          var r = el.getBoundingClientRect();
          el.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100) + '%');
          el.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100) + '%');
        });
        el.addEventListener('pointerleave', function () {
          el.style.removeProperty('--mx');
          el.style.removeProperty('--my');
        });
      });
    });
  }

  /* ---------- 4. scroll progress (idle) ---------- */
  whenIdle(function () {
    var bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var ticking = false;
    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(window.scrollY / max, 1) : 0) + ')';
      ticking = false;
    }
    addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  });

  /* ---------- 5. approach deck (idle) ----------
     Builds a pinned card deck from the existing steps list and
     tracks which step is in view. Content is never duplicated in
     the markup: without this, the page keeps a plain list.        */
  whenIdle(function () {
    var section = document.querySelector('.cs-section.dark .container');
    if (!section) return;
    var list = section.querySelector('ul.steps');
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('li'));
    if (items.length < 3) return;

    var layout = document.createElement('div');
    layout.className = 'deck-layout';
    list.parentNode.insertBefore(layout, list);
    layout.appendChild(list);

    var deck = document.createElement('aside');
    deck.className = 'approach-deck';
    deck.setAttribute('aria-hidden', 'true');   // a decorative mirror of the list
    layout.appendChild(deck);

    var faces = items.map(function (li, i) {
      var num = li.querySelector('.step-num');
      var strong = li.querySelector('.step-body strong');
      var face = document.createElement('div');
      face.className = 'card-face';
      face.innerHTML = '<span class="face-dot"></span><span class="face-idx"></span><span class="face-title"></span>';
      face.querySelector('.face-idx').textContent = num ? num.textContent.trim() : ('0' + (i + 1));
      face.querySelector('.face-title').textContent = strong ? strong.textContent.trim() : '';
      deck.appendChild(face);
      return face;
    });

    var active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      items.forEach(function (li, n) { li.setAttribute('data-state', n === i ? 'active' : 'idle'); });
      faces.forEach(function (f, n) {
        var d = n - i;
        f.setAttribute('data-state', n === i ? 'active' : 'idle');
        f.style.setProperty('--d', d > 0 ? d : 0);
        f.style.setProperty('--dabs', Math.abs(d));
      });
    }

    function nearest() {
      var mid = window.innerHeight / 2, best = 0, bestDist = Infinity;
      for (var n = 0; n < items.length; n++) {
        var r = items[n].getBoundingClientRect();
        var d = Math.abs((r.top + r.height / 2) - mid);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      return best;
    }

    setActive(0);
    if (reduced) return;          // under reduce the deck is static; no scroll tracking

    var ticking = false;
    addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { setActive(nearest()); ticking = false; });
    }, { passive: true });
  });


  /* ---------- 8. scrollspy (idle) ----------
     Marks the nav link for the section you are in with
     aria-current, so the indicator is announced and not only seen. */
  whenIdle(function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav ul a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = [];
    links.forEach(function (a) {
      var sec = document.getElementById(a.getAttribute('href').slice(1));
      if (sec) map.push({ link: a, sec: sec });
    });
    if (!map.length) return;

    var current = null;
    function mark(entry) {
      if (entry === current) return;
      current = entry;
      map.forEach(function (m) {
        if (m === entry) m.link.setAttribute('aria-current', 'true');
        else m.link.removeAttribute('aria-current');
      });
    }

    var io = new IntersectionObserver(function () {
      // whichever mapped section covers the top third of the viewport wins
      var line = window.innerHeight * 0.33, best = null, bestTop = -Infinity;
      map.forEach(function (m) {
        var r = m.sec.getBoundingClientRect();
        if (r.top <= line && r.bottom > line && r.top > bestTop) { bestTop = r.top; best = m; }
      });
      mark(best);
    }, { threshold: [0, 0.1, 0.5, 1], rootMargin: '0px' });
    map.forEach(function (m) { io.observe(m.sec); });

    var ticking = false;
    addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var line = window.innerHeight * 0.33, best = null, bestTop = -Infinity;
        map.forEach(function (m) {
          var r = m.sec.getBoundingClientRect();
          if (r.top <= line && r.bottom > line && r.top > bestTop) { bestTop = r.top; best = m; }
        });
        mark(best);
        ticking = false;
      });
    }, { passive: true });
  });

  /* ---------- 6. theme toggles ----------
     There is one in the nav and one in the footer. Both are driven
     from here and kept in sync, so neither can claim the wrong next
     state. The stored choice is applied before first paint by an
     inline script in <head>, so there is no flash.              */
  var toggles = document.querySelectorAll('.theme-toggle');
  if (toggles.length) {
    var root = document.documentElement;
    var animTimer;

    var effective = function () {
      var set = root.getAttribute('data-theme');
      return (set === 'light' || set === 'dark') ? set : 'dark';
    };
    var relabel = function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      Array.prototype.forEach.call(toggles, function (b) {
        b.setAttribute('aria-label', 'Switch to ' + next + ' theme');
        b.setAttribute('title', 'Switch to ' + next + ' theme');
      });
    };

    Array.prototype.forEach.call(toggles, function (b) {
      b.addEventListener('click', function () {
        var next = effective() === 'dark' ? 'light' : 'dark';

        // crossfade the colour change, then take the class back off so
        // it never interferes with ordinary hover and focus transitions
        if (!reduced) {
          clearTimeout(animTimer);
          root.classList.add('theme-anim');
          animTimer = setTimeout(function () { root.classList.remove('theme-anim'); }, 420);
        }

        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) {}
        relabel();
      });
    });

    relabel();
  }
})();

/* ============================================================
   Copy to clipboard
   Progressive enhancement: the button is hidden until this runs
   and confirms support, so nobody is shown a control that cannot
   work. The mailto link beside it is always the fallback.
   ============================================================ */
(function () {
  'use strict';
  var buttons = document.querySelectorAll('[data-copy]');
  if (!buttons.length) return;

  var secure = window.isSecureContext !== false;
  var hasAsync = !!(navigator.clipboard && navigator.clipboard.writeText) && secure;
  var hasLegacy = typeof document.execCommand === 'function';
  if (!hasAsync && !hasLegacy) return;          // leave the button hidden

  document.documentElement.classList.add('can-copy');

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copy(text) {
    if (hasAsync) return navigator.clipboard.writeText(text).then(function () { return true; },
                                                                  function () { return legacyCopy(text); });
    return Promise.resolve(legacyCopy(text));
  }

  Array.prototype.forEach.call(buttons, function (btn) {
    var value = btn.getAttribute('data-copy');
    var label = btn.querySelector('.copy-label');
    var status = document.getElementById('copy-status');
    var original = label ? label.textContent : '';
    var timer;

    btn.setAttribute('aria-label', 'Copy email address ' + value);

    btn.addEventListener('click', function () {
      copy(value).then(function (ok) {
        clearTimeout(timer);
        if (ok) {
          btn.setAttribute('data-copied', 'true');
          if (label) label.textContent = 'Copied';
          if (status) status.textContent = value + ' copied to clipboard';
        } else {
          if (status) status.textContent = 'Press Ctrl+C to copy ' + value;
        }
        timer = setTimeout(function () {
          btn.removeAttribute('data-copied');
          if (label) label.textContent = original;
          if (status) status.textContent = '';
        }, 2600);
      });
    });
  });
})();
