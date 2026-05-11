(function () {
  'use strict';

  var s = document.currentScript;
  if (!s) return;
  var token = s.getAttribute('data-token');
  if (!token) return;
  var api = s.getAttribute('data-api') || '';

  if (!api) {
    var src = s.src || '';
    if (src.indexOf('cdn.jsdelivr') > -1 || src.indexOf('github') > -1) {
      return;
    }
    api = src.replace(/\/api\/t\/.*$/, '');
  }

  var LK = '_df_lid';
  var TK = '_df_ttclid';
  var SK = '_df_pv';

  function gc(n) {
    var v = '; ' + document.cookie;
    var p = v.split('; ' + n + '=');
    if (p.length === 2) return p.pop().split(';').shift();
    return null;
  }

  function sc(n, v, d) {
    var e = new Date();
    e.setTime(e.getTime() + (d * 864e5));
    var dm = location.hostname.split('.').slice(-2).join('.');
    document.cookie = n + '=' + v + '; expires=' + e.toUTCString() + '; path=/; domain=.' + dm + '; SameSite=Lax';
  }

  function qs(n) {
    var r = new RegExp('[?&]' + n + '=([^&#]*)');
    var m = r.exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  function gid() {
    var id = localStorage.getItem(LK) || gc(LK);
    if (!id) {
      id = 'TT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    }
    localStorage.setItem(LK, id);
    sc(LK, id, 365);
    return id;
  }

  function gtt() {
    var t = qs('ttclid') || qs('click_id') || localStorage.getItem(TK) || gc(TK);
    if (t) {
      localStorage.setItem(TK, t);
      sc(TK, t, 30);
    }
    return t;
  }

  function snd(url, data) {
    var j = JSON.stringify(data);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([j], { type: 'application/json' }));
    } else {
      var x = new XMLHttpRequest();
      x.open('POST', url, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(j);
    }
  }

  function prop(lid) {
    var ls = document.querySelectorAll('a[href]');
    for (var i = 0; i < ls.length; i++) {
      var h = ls[i].href;
      if (h && h.indexOf('http') === 0) {
        try {
          var u = new URL(h);
          u.searchParams.set('utm_source', lid);
          u.searchParams.set('sck', lid);
          ls[i].href = u.href;
        } catch (e) {}
      }
    }
    var fs = document.querySelectorAll('iframe[src]');
    for (var j = 0; j < fs.length; j++) {
      try {
        var fu = new URL(fs[j].src);
        fu.searchParams.set('utm_source', lid);
        fu.searchParams.set('sck', lid);
        fs[j].src = fu.href;
      } catch (e) {}
    }
  }

  function pv() {
    var pk = SK + '_' + location.pathname;
    if (sessionStorage.getItem(pk)) return;
    sessionStorage.setItem(pk, '1');
    var lid = gid();
    var tt = gtt();
    snd(api + '/api/t/' + token + '/view', {
      leadId: lid,
      ttclid: tt || undefined,
      referrer: document.referrer || undefined,
      href: location.href
    });
  }

  function init() {
    var lid = gid();
    gtt();
    var u = new URL(location.href);
    u.searchParams.set('utm_source', lid);
    u.searchParams.set('sck', lid);
    history.replaceState({}, '', u.href);
    pv();
    prop(lid);
    if (window.MutationObserver && document.body) {
      new MutationObserver(function () { prop(lid); }).observe(document.body, { childList: true, subtree: true });
    }
    var op = history.pushState;
    history.pushState = function () { op.apply(this, arguments); pv(); prop(lid); };
    window.addEventListener('popstate', function () { pv(); prop(lid); });
  }

  window.datafy = function (ev, d) {
    var lid = gid();
    var p = typeof ev === 'string'
      ? Object.assign({}, d || {}, { status: ev === 'purchase' ? 'paid' : ev === 'ic' ? 'initiate_checkout' : ev, utm_source: lid })
      : Object.assign({}, ev, { utm_source: lid });
    snd(api + '/api/t/' + token + '/event', p);
  };

  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.hasAttribute && el.hasAttribute('data-datafy-checkout')) {
        window.datafy('ic');
        return;
      }
      el = el.parentNode;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
