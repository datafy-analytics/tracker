(function () {
  'use strict';

  var capturedScript = document.currentScript;
  if (!capturedScript) return;

  var config = {
    token: capturedScript.getAttribute('data-token') || '',
    stepId: capturedScript.getAttribute('data-step-id') || 'initial',
    clickIdParams: ['ttclid', 'click_id', 'fbclid', 'gclid'],
    apiEndpoint: '',
    currentUrl: new URL(window.location.href),
    fingerPrintId: undefined
  };

  var dataApi = capturedScript.getAttribute('data-api') || 'https://api.datafy-analytics.com';
  config.apiEndpoint = dataApi + '/api/t/' + config.token;
  if (!config.token) return;

  var UTM_SOURCE = 'utm_source';
  var SCK = 'sck';

  function storeGet(key) { return localStorage.getItem(key) || undefined; }
  function storeSet(key, val) { localStorage.setItem(key, val); }
  function getLeadKey() { return 'DATAFY_LEAD_ID_' + config.token; }
  function getTtclidKey() { return 'DATAFY_TTCLID_' + config.token; }

  function onLoad(fn) {
    if (document.readyState === 'interactive' || document.readyState === 'complete') return fn();
    document.addEventListener('DOMContentLoaded', fn);
  }

  function mutationWatch(query, process, root) {
    root = root || document;
    onLoad(function () {
      process(root.querySelectorAll(query));
      if (!window.MutationObserver) return;
      var ob = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.addedNodes && m.addedNodes.length > 0) {
            m.addedNodes.forEach(function (node) {
              if (node instanceof Element) {
                if (node.matches && node.matches(query)) process([node]);
                if (node.querySelectorAll) process(node.querySelectorAll(query));
              }
            });
          }
        });
      });
      ob.observe(root, { childList: true, subtree: true });
    });
  }

  function getCookie(name) {
    var eq = name + '=';
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i].trim();
      if (c.indexOf(eq) === 0) return c.substring(eq.length);
    }
    return null;
  }

  function setCookie(name, value, days) {
    var e = new Date();
    e.setTime(e.getTime() + (days * 864e5));
    var parts = location.hostname.split('.');
    var domain = parts.length >= 2 ? parts.slice(-2).join('.') : location.hostname;
    if (parts[parts.length - 1] === 'br' && parts.length >= 3) domain = parts.slice(-3).join('.');
    document.cookie = name + '=' + value + '; expires=' + e.toUTCString() + '; path=/; domain=.' + domain + '; SameSite=Lax';
  }

  function getUrlParameters() {
    return Object.fromEntries(new URLSearchParams(window.location.search));
  }

  function detectClickId(params) {
    for (var i = 0; i < config.clickIdParams.length; i++) {
      if (params[config.clickIdParams[i]]) return params[config.clickIdParams[i]];
    }
    return null;
  }

  function updateUrlWithLeadId(leadId) {
    var url = new URL(window.location.href);
    url.searchParams.set(UTM_SOURCE, leadId);
    url.searchParams.set(SCK, leadId);
    window.history.replaceState({}, '', url.toString());
    config.currentUrl = url;
  }

  function updateAllLinks(leadId) {
    document.querySelectorAll('a').forEach(function (link) {
      if (!link.href || link.href.startsWith('#') || link.href.startsWith('javascript:')) return;
      try {
        var url = new URL(link.href);
        url.searchParams.set(UTM_SOURCE, leadId);
        url.searchParams.set(SCK, leadId);
        link.href = url.href;
      } catch (e) {}
    });
  }

  function updateIframes(leadId) {
    document.querySelectorAll('iframe[src]').forEach(function (iframe) {
      try {
        var url = new URL(iframe.src);
        url.searchParams.set(UTM_SOURCE, leadId);
        url.searchParams.set(SCK, leadId);
        iframe.src = url.href;
      } catch (e) {}
    });
  }

  function dispatch(data) {
    var KEY = 'DATAFY_PREV_PV';
    var list = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    var prev = new Set(list);
    var current = JSON.stringify(data);
    if (prev.has(current)) return Promise.resolve(null);
    prev.add(current);
    sessionStorage.setItem(KEY, JSON.stringify(Array.from(prev.values())));

    return fetch(config.apiEndpoint + '/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
      keepalive: true
    }).then(function (r) { return r.json(); }).then(function (result) {
      if (result.ok && result.leadId) return result.leadId;
      return null;
    }).catch(function () { return null; });
  }

  var icSent = false;
  function dispatchIC() {
    if (icSent) return;
    icSent = true;
    var leadId = storeGet(getLeadKey());
    if (!leadId) { icSent = false; return; }
    var payload = JSON.stringify({ status: 'initiate_checkout', utm_source: leadId, href: window.location.href });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.apiEndpoint + '/event', new Blob([payload], { type: 'text/plain' }));
    } else {
      fetch(config.apiEndpoint + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    }
  }

  function initCheckoutListeners() {
    mutationWatch('[data-datafy-checkout]', function (els) {
      els.forEach(function (el) {
        if (el.dataset.datafyListenerAdded) return;
        el.dataset.datafyListenerAdded = 'true';
        el.addEventListener('click', dispatchIC);
      });
    });
  }

  function initAdvancedTracking() {
    var b64 = capturedScript.getAttribute('data-advanced-tracking');
    if (!b64) return;
    try {
      var rules = JSON.parse(atob(b64));
      if (!rules || !rules.length) return;
      var map = new Map();
      rules.forEach(function (r) {
        var list = map.get(r.s) || [];
        list.push(r);
        map.set(r.s, list);
      });
      map.forEach(function (rulesFor, selector) {
        try {
          mutationWatch(selector, function (els) {
            els.forEach(function (el) {
              if (el.dataset.datafyAdvanced) return;
              el.dataset.datafyAdvanced = 'true';
              el.addEventListener('click', function () {
                var path = window.location.pathname;
                rulesFor.forEach(function (rule) {
                  if (rule.p === path || rule.p === path + '/' || (rule.p.endsWith('*') && path.startsWith(rule.p.slice(0, -1)))) {
                    if (rule.e === 'IC') dispatchIC();
                  }
                });
              });
            });
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  // FingerprintJS - dynamic import via script tag
  var fpResolve;
  var fpPromise = new Promise(function (r) { fpResolve = r; });

  function initFingerPrint() {
    try {
      var s = document.createElement('script');
      s.type = 'module';
      s.textContent = 'import FP from "https://cdn.skypack.dev/@fingerprintjs/fingerprintjs@4.0.1";FP.load().then(function(a){return a.get()}).then(function(r){window.__df_fp=r.visitorId;window.dispatchEvent(new Event("__df_fp_ready"))}).catch(function(){window.dispatchEvent(new Event("__df_fp_ready"))})';
      document.head.appendChild(s);
      window.addEventListener('__df_fp_ready', function () {
        config.fingerPrintId = window.__df_fp;
        fpResolve(config.fingerPrintId);
      });
      setTimeout(function () { fpResolve(undefined); }, 5000);
    } catch (e) {
      fpResolve(undefined);
    }
  }

  // Main - leadId generated by BACKEND
  async function handleUtmParameters() {
    var leadId = storeGet(getLeadKey());
    var params = getUrlParameters();
    var clickId = detectClickId(params);

    if (clickId) {
      storeSet(getTtclidKey(), clickId);
      setCookie('_df_ttclid', clickId, 30);
    }

    // New click + no stored lead = send to backend, backend generates leadId
    if (clickId && !leadId) {
      var urlParamsString = new URLSearchParams(params).toString();
      var data = {
        step_id: config.stepId,
        href: config.currentUrl.href,
        product_id: config.token,
        finger_print_id: config.fingerPrintId || await fpPromise,
        url_params: urlParamsString,
        ttclid: clickId,
        referrer: document.referrer || undefined
      };
      var newLeadId = await dispatch(data);
      if (newLeadId) {
        storeSet(getLeadKey(), newLeadId);
        setCookie('_df_lid', newLeadId, 365);
        updateUrlWithLeadId(newLeadId);
        updateAllLinks(newLeadId);
        updateIframes(newLeadId);
      }
      return;
    }

    if (clickId && leadId) {
      updateUrlWithLeadId(leadId);
      updateAllLinks(leadId);
      updateIframes(leadId);
      return;
    }

    if (leadId) {
      updateUrlWithLeadId(leadId);
      updateAllLinks(leadId);
      updateIframes(leadId);
      return;
    }
  }

  function initWatch() {
    mutationWatch('iframe', function () {
      var leadId = storeGet(getLeadKey());
      if (leadId) updateIframes(leadId);
    });
    mutationWatch('a', function () {
      var leadId = storeGet(getLeadKey());
      if (leadId) updateAllLinks(leadId);
    });
  }

  // Navigation API interception (SPA + iframe support)
  function initNavigationInterception() {
    function isIframe() { try { return window.self !== window.top; } catch (e) { return true; } }

    if (isIframe()) {
      var prevOpen = window.open;
      window.open = function (input, target) {
        if (isIframe() && target === '_top') {
          var leadId = storeGet(getLeadKey());
          if (leadId && input) {
            try {
              var url = new URL(typeof input === 'string' ? input : input.toString());
              url.searchParams.set(UTM_SOURCE, leadId);
              url.searchParams.set(SCK, leadId);
              return prevOpen.call(this, url.href, target);
            } catch (e) {}
          }
        }
        return prevOpen.apply(this, arguments);
      };
    }

    if (window.navigation) {
      var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (!isSafari) {
        var lastURL;
        window.navigation.addEventListener('navigate', function (event) {
          if (!event || !event.destination || !event.destination.url) return;
          var destUrl = event.destination.url.href || event.destination.url;
          if (lastURL === destUrl) return;
          var leadId = storeGet(getLeadKey());
          if (!leadId) return;
          try {
            var url = new URL(destUrl);
            url.searchParams.set(UTM_SOURCE, leadId);
            url.searchParams.set(SCK, leadId);
            var newUrl = url.href;
            if (newUrl === destUrl) return;
            lastURL = newUrl;
            event.preventDefault();
            if (!event.destination.sameDocument) {
              window.navigation.navigate(newUrl, { history: event.navigationType === 'push' ? 'push' : 'auto' });
            } else {
              history.pushState({}, '', newUrl);
            }
          } catch (e) {}
        });
      }
    }
  }

  window.datafy = function (ev, data) {
    var leadId = storeGet(getLeadKey());
    if (!leadId) return;
    var payload;
    if (typeof ev === 'string') {
      payload = Object.assign({}, data || {}, {
        status: ev === 'purchase' ? 'paid' : ev === 'ic' ? 'initiate_checkout' : ev,
        utm_source: leadId
      });
    } else {
      payload = Object.assign({}, ev, { utm_source: leadId });
    }
    var json = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.apiEndpoint + '/event', new Blob([json], { type: 'application/json' }));
    } else {
      fetch(config.apiEndpoint + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(function () {});
    }
  };

  // Boot
  initFingerPrint();
  onLoad(handleUtmParameters);
  onLoad(initCheckoutListeners);
  onLoad(initAdvancedTracking);
  onLoad(initWatch);
  onLoad(initNavigationInterception);

  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    var lid = storeGet(getLeadKey());
    if (lid) { updateAllLinks(lid); updateIframes(lid); }
  };
  history.replaceState = function () {
    origReplace.apply(this, arguments);
  };
  window.addEventListener('popstate', function () {
    var lid = storeGet(getLeadKey());
    if (lid) { updateAllLinks(lid); updateIframes(lid); }
  });
})();
