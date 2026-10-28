/* ============================================================
   Motion layer
   Everything here degrades to a correct static page:
   - no JS            -> .no-js rule in the markup shows all content
   - reduced motion   -> observers still reveal, transitions are ~0ms
   - IO unsupported   -> everything is revealed immediately
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- 1. scroll reveal, with per-child stagger ----
  var revealables = document.querySelectorAll('.reveal, .stagger');

  // index each stagger child so CSS can delay it
  document.querySelectorAll('.stagger').forEach(function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) {
      child.style.setProperty('--i', Math.min(i, 12));
    });
  });

  function showAll() {
    revealables.forEach(function (el) { el.classList.add('in'); });
  }

  if (!('IntersectionObserver' in window)) {
    showAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        if (e.target.hasAttribute('data-count')) runCounters(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealables.forEach(function (el) { io.observe(el); });

    // counters live inside .stats, which may not be a .reveal
    var counterHosts = document.querySelectorAll('[data-count]');
    counterHosts.forEach(function (el) { io.observe(el); });
  }

  // ---- 2. number counters ----
  function runCounters(host) {
    var targets = host.matches('[data-count]') ? [host] : host.querySelectorAll('[data-count]');
    Array.prototype.forEach.call(targets, function (el) {
      var end = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(end)) return;
      var pad = el.getAttribute('data-pad') === 'true';
      var render = function (v) { el.textContent = pad && v < 10 ? '0' + v : String(v); };
      if (reduced) { render(end); return; }               // respect the preference: jump to the value
      var start = performance.now(), dur = 900;
      (function tick(now) {
        var p = Math.min((now - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        render(Math.round(end * eased));
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    });
  }

  // ---- 3. pointer glow on cards (pure CSS vars, no layout work) ----
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    var glowables = document.querySelectorAll('.card, .craft, .svc, .stack-features .item');
    glowables.forEach(function (el) {
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
  }
})();
