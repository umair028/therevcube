// The RevCube site behaviour: [data-mailto] blocks open email, the nav dot follows the current item,
// and each footer clock runs on its office's time zone (data-tz on the clock block).
// Elements are looked up on every use because Barba page transitions swap the page content.
(function () {
  // Opened straight from disk, browsers block Barba's history updates, so links do normal page loads.
  if (location.protocol === 'file:') {
    document.querySelectorAll('a[href]').forEach(function (a) { a.setAttribute('data-barba-prevent', 'self'); });
  }
  // Barba changes the URL without reloading <head>; pin icon links to absolute URLs so they keep resolving.
  document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(function (l) { l.setAttribute('href', l.href); });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-mailto]');
    if (!el) return;
    // A real link inside the block (e.g. a secondary button) handles its own click.
    var link = e.target.closest('a');
    if (link && el.contains(link)) return;
    e.preventDefault();
    window.location.href = el.getAttribute('data-mailto');
  });

  // Nav dot: the page's own item (Home, About Us, or Services on a service page) unless a section with its own
  // nav link is on screen: on the home page About -> About Us and Featured Work -> Our Work;
  // the footer contact details -> Contact.
  function updateNavDot() {
    var mains = document.querySelectorAll('main[data-barba-namespace]');
    if (!mains.length) return;
    var main = mains[mains.length - 1];
    var ns = main.getAttribute('data-barba-namespace');
    var key = ns === 'home' || ns === 'about-us' ? ns : ns === 'contact-us' ? 'contact' : 'services';
    var line = window.innerHeight * 0.4;
    var contact = main.querySelector('#contact');
    if (key === 'home') {
      [['about', 'about-us'], ['work', 'our-work']].forEach(function (pair) {
        var el = main.querySelector('#' + pair[0]);
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.top <= line && r.bottom > line) key = pair[1];
      });
    }
    if (contact && contact.getBoundingClientRect().top < window.innerHeight * 0.85) key = 'contact';
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      el.classList.toggle('is-current', el.getAttribute('data-nav') === key);
    });
  }
  // About page values: the value name whose block is on screen is shown in black (others grey) and its number goes in the badge.
  function updateValues() {
    var names = document.querySelectorAll('.revcube-values-name');
    var rows = document.querySelectorAll('.revcube-values-row');
    if (!names.length || names.length !== rows.length) return;
    var line = window.innerHeight * 0.6, active = 0;
    rows.forEach(function (r, i) { if (r.getBoundingClientRect().top < line) active = i; });
    names.forEach(function (n, i) { n.classList.toggle('is-active', i === active); });
    var badge = document.querySelector('[values-badge]');
    if (badge) badge.textContent = (active < 9 ? '0' : '') + (active + 1);
  }

  // About page story: words light up in reading order while the block scrolls from the lower part of the
  // screen up to the middle; scrolling back up un-lights them.
  function updateScrollHighlight() {
    document.querySelectorAll('[scroll-highlight]').forEach(function (block) {
      var words = block.querySelectorAll('.revcube-word');
      if (!words.length) return;
      var r = block.getBoundingClientRect(), vh = window.innerHeight;
      var start = vh * 0.85, end = vh * 0.35 - r.height * 0.5;
      var p = Math.min(1, Math.max(0, (start - r.top) / (start - end)));
      var lit = Math.round(p * words.length);
      words.forEach(function (w, i) { w.classList.toggle('is-lit', i < lit); });
    });
  }

  // About page "How We Work": open one step (its image fades in and its bar starts filling).
  function openStep(tabs, index) {
    var items = tabs.querySelectorAll('.revcube-process-item');
    var imgs = tabs.querySelectorAll('.revcube-process-img');
    index = (index + items.length) % items.length;
    items.forEach(function (it, i) {
      var on = i === index;
      if (on && it.classList.contains('is-active')) { it.classList.remove('is-active'); void it.offsetWidth; } // restart the bar
      it.classList.toggle('is-active', on);
      it.querySelector('.revcube-process-btn').setAttribute('aria-expanded', on);
    });
    imgs.forEach(function (im, i) { im.classList.toggle('is-active', i === index); });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.revcube-process-btn');
    if (!btn) return;
    var tabs = btn.closest('[process-tabs]');
    openStep(tabs, Array.prototype.indexOf.call(tabs.querySelectorAll('.revcube-process-btn'), btn));
  });
  // A full bar opens the next step (after the last, back to the first).
  document.addEventListener('animationend', function (e) {
    if (!e.target.classList || !e.target.classList.contains('revcube-process-fill')) return;
    var tabs = e.target.closest('[process-tabs]');
    var items = Array.prototype.slice.call(tabs.querySelectorAll('.revcube-process-item'));
    openStep(tabs, items.indexOf(e.target.closest('.revcube-process-item')) + 1);
  });
  // The bars only run while the section is on screen.
  function updateProcessPause() {
    document.querySelectorAll('[process-tabs]').forEach(function (tabs) {
      var r = tabs.getBoundingClientRect();
      tabs.classList.toggle('is-paused', r.bottom < window.innerHeight * 0.2 || r.top > window.innerHeight * 0.8);
    });
  }

  // Contact form: with no `action` set, sending opens the visitor's email app with the message filled in.
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[contact-form]');
    if (!form || form.getAttribute('action')) return;
    e.preventDefault();
    var data = new FormData(form), lines = [];
    ['Name', 'Email', 'Company', 'Phone'].forEach(function (k) { var v = String(data.get(k) || '').trim(); if (v) lines.push(k + ': ' + v); });
    var services = data.getAll('Service');
    if (services.length) lines.push('Services: ' + services.join(', '));
    var subject = (data.get('Enquiry type') || 'Enquiry') + ' from ' + data.get('Name') + (data.get('Company') ? ' (' + data.get('Company') + ')' : '');
    var body = lines.join('\n') + '\n\n' + data.get('Message');
    var email = form.getAttribute('data-email');
    window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    var status = form.querySelector('.revcube-form-status');
    if (status) status.textContent = 'Your email app should open with your message ready to send. If it doesn’t, email us at ' + email + '.';
  });

  var navDotQueued = false;
  window.addEventListener('scroll', function () {
    if (navDotQueued) return;
    navDotQueued = true;
    requestAnimationFrame(function () { navDotQueued = false; updateNavDot(); updateValues(); updateScrollHighlight(); updateProcessPause(); });
  }, { passive: true });

  // Industries slider: the remote script starts Swiper with the default 3s pause between slides;
  // shorten it once the slider exists (checked each second, so it also catches Barba page swaps).
  var SLIDER_DELAY_MS = 2000;
  function tuneSlider() {
    var el = document.querySelector('.panorama-slider .swiper');
    var sw = el && el.swiper;
    if (!sw || !sw.autoplay || sw.__revcubeTuned) return;
    sw.__revcubeTuned = true;
    sw.params.autoplay.delay = SLIDER_DELAY_MS;
    sw.autoplay.stop();
    sw.autoplay.start();
  }

  var DEFAULT_TZ = 'America/New_York';
  var OPEN_HOUR = 9, CLOSE_HOUR = 18;

  function tick() {
    var now = new Date();
    document.querySelectorAll('[la-availability]').forEach(function (s) {
      var TZ = s.getAttribute('data-tz') || DEFAULT_TZ;
      var time = now.toLocaleTimeString('en-US', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      s.querySelectorAll('[la-time]').forEach(function (c) { c.textContent = time; });
      var hour = parseInt(now.toLocaleString('en-US', { timeZone: TZ, hour12: false, hour: '2-digit' }), 10) % 24;
      s.classList.toggle('online', hour >= OPEN_HOUR && hour < CLOSE_HOUR);
    });
    // Also catches Barba page swaps, which don't fire a scroll event.
    updateNavDot();
    updateValues();
    updateScrollHighlight();
    updateProcessPause();
    tuneSlider();
  }
  tick();
  setInterval(tick, 1000);
})();
