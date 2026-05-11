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

  // Resolve API endpoint
  var dataApi = capturedScript.getAttribute('data-api');
  if (dataApi) {
    config.apiEndpoint = dataApi + '/api/t/' + config.token;
  } else {
    var src = capturedScript.src || '';
    var match = src.match(/(.+)\/api\/t\//);
    if (match) config.apiEndpoint = match[1] + '/api/t/' + config.token;
    else return;
  }

  if (!config.token) return;

  var UTM_SOURCE = 'utm_source';
  var SCK = 'sck';

  // Storage
  function storeGet(key) { return localStorage.getItem(key) || undefined; }
  function storeSet(key, val) { localStorage.setItem(key, val); }

  function getLeadKey() { return 'DATAFY_LEAD_ID_' + config.token; }
  function getTtclidKey() { return 'DATAFY_TTCLID_' + config.token; }

  // DOM ready
  function onLoad(fn) {
    if (document.readyState === 'interactive' || document.readyState === 'complete') return fn();
    document.addEventListener('DOMContentLoaded', fn);
  }

  // MutationObserver watcher
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

  // Cookie helpers
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

  // URL params
  function getUrlParameters() {
    return Object.fromEntries(new URLSearchParams(window.location.search));
  }

  function detectClickId(params) {
    for (var i = 0; i < config.clickIdParams.length; i++) {
      if (params[config.clickIdParams[i]]) return params[config.clickIdParams[i]];
    }
    return null;
  }

  // Update URL with leadId
  function updateUrlWithLeadId(leadId) {
    var url = new URL(window.location.href);
    url.searchParams.set(UTM_SOURCE, leadId);
    url.searchParams.set(SCK, leadId);
    window.history.replaceState({}, '', url.toString());
    config.currentUrl = url;
  }

  // Update all links
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

  // Update iframes
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

  // Send data with deduplication
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

  // Initiate Checkout
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

  // Checkout listeners
  function initCheckoutListeners() {
    mutationWatch('[data-datafy-checkout]', function (els) {
      els.forEach(function (el) {
        if (el.dataset.datafyListenerAdded) return;
        el.dataset.datafyListenerAdded = 'true';
        el.addEventListener('click', dispatchIC);
      });
    });
  }

  // Advanced tracking (data-advanced-tracking base64 JSON rules)
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

  // Main UTM handling
  async function handleUtmParameters() {
    var leadId = storeGet(getLeadKey());
    var params = getUrlParameters();
    var clickId = detectClickId(params);

    // Store ttclid if present
    if (clickId) {
      storeSet(getTtclidKey(), clickId);
      setCookie('_df_ttclid', clickId, 30);
    }

    // New click + no stored lead = create new lead
    if (clickId && !leadId) {
      var data = {
        step_id: config.stepId,
        href: config.currentUrl.href,
        product_id: config.token,
        leadId: 'TT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
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

    // Click + existing lead = reuse
    if (clickId && leadId) {
      updateUrlWithLeadId(leadId);
      updateAllLinks(leadId);
      updateIframes(leadId);
      return;
    }

    // No click but has stored lead
    if (leadId) {
      updateUrlWithLeadId(leadId);
      updateAllLinks(leadId);
      updateIframes(leadId);
      return;
    }
  }

  // Watch for dynamic content
  function initWatch() {
    mutationWatch('iframe', function (iframes) {
      var leadId = storeGet(getLeadKey());
      if (leadId) updateIframes(leadId);
    });
    mutationWatch('a', function () {
      var leadId = storeGet(getLeadKey());
      if (leadId) updateAllLinks(leadId);
    });
  }

  // Expose datafy() for manual events
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
  onLoad(handleUtmParameters);
  onLoad(initCheckoutListeners);
  onLoad(initAdvancedTracking);
  onLoad(initWatch);

  // SPA support
  var origPush = history.pushState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    var lid = storeGet(getLeadKey());
    if (lid) { updateAllLinks(lid); updateIframes(lid); }
  };
  window.addEventListener('popstate', function () {
    var lid = storeGet(getLeadKey());
    if (lid) { updateAllLinks(lid); updateIframes(lid); }
  });
})();
