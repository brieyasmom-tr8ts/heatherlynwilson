// Lightweight in-house page view tracker.
//
// Fires twice per visit:
//   1. Initial /api/track with path + referrer (records the visit)
//   2. /api/track/dwell on pagehide (records how long they actually stayed,
//      so we can compute bounce rate + average time on site)
//
// Skips admin pages and skips Heather's own visits (admin_key in
// localStorage), so her stats are not inflated by her own browsing.
(function () {
  try {
    var path = window.location.pathname;

    // Don't track admin
    if (path.indexOf("/admin") !== -1 || path.indexOf("admin.html") !== -1) return;

    // Don't track the admin's own visits
    try {
      if (localStorage.getItem("admin_key")) return;
    } catch (e) {}

    var referrer = document.referrer || "";
    try {
      var refUrl = new URL(referrer);
      if (refUrl.host === window.location.host) referrer = "";
    } catch (e) {}

    // Capture full UTM params for page-view attribution
    var pvUtm = {};
    try {
      var sp = new URLSearchParams(window.location.search);
      var utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
      for (var ui = 0; ui < utmKeys.length; ui++) {
        var uv = sp.get(utmKeys[ui]);
        if (uv) pvUtm[utmKeys[ui]] = uv.slice(0, 100);
      }
      if (pvUtm.utm_source) referrer = "utm:" + pvUtm.utm_source.slice(0, 40);
    } catch (e) {}

    // Generate a per-pageview id so the dwell ping can update the right row.
    var viewId = "";
    try {
      viewId = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));
    } catch (e) {
      viewId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    var startedAt = Date.now();

    function postJSON(url, payload) {
      var body = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([body], { type: "application/json" });
          if (navigator.sendBeacon(url, blob)) return;
        }
      } catch (e) {}
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }

    // Initial ping
    var trackPayload = { path: path, referrer: referrer, view_id: viewId };
    if (pvUtm.utm_source) trackPayload.utm = pvUtm;
    postJSON("/api/track", trackPayload);

    // Dwell ping when the page is hidden (works for navigation, tab switch,
    // tab close, mobile background, etc). Fires at most once per pageview.
    var sent = false;
    function sendDwell() {
      if (sent) return;
      sent = true;
      var seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      postJSON("/api/track/dwell", { view_id: viewId, seconds: seconds });
    }
    window.addEventListener("pagehide", sendDwell);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") sendDwell();
    });
  } catch (e) {}
})();

// UTM attribution capture.
// Stores first-touch (never overwritten) and last-touch (updated on each
// tracked visit) in localStorage. Signup forms call getUtmAttribution()
// to send attribution with their API request. Persists 30 days.
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    var hasUtm = false;
    var current = {};
    for (var i = 0; i < keys.length; i++) {
      var v = params.get(keys[i]);
      if (v) { current[keys[i]] = v.slice(0, 100); hasUtm = true; }
    }
    if (!hasUtm) return;

    var lt = { ts: Date.now(), page: window.location.pathname };
    for (var k in current) lt[k] = current[k];
    localStorage.setItem("hlw_utm_last", JSON.stringify(lt));

    var ftRaw = localStorage.getItem("hlw_utm_first");
    var setFirst = true;
    if (ftRaw) {
      try {
        var ft = JSON.parse(ftRaw);
        if (ft.ts && (Date.now() - ft.ts) < 30 * 86400000) setFirst = false;
      } catch (e) {}
    }
    if (setFirst) {
      var first = { ts: Date.now(), page: window.location.pathname };
      for (var k2 in current) first[k2] = current[k2];
      localStorage.setItem("hlw_utm_first", JSON.stringify(first));
    }
    if (setFirst && document.referrer) {
      try {
        var ref = new URL(document.referrer);
        if (ref.host !== window.location.host) localStorage.setItem("hlw_utm_referrer", ref.host);
      } catch (e) {}
    }
  } catch (e) {}
})();

function getUtmAttribution() {
  var result = { first: null, last: null, referrer: "" };
  var MAX_AGE = 30 * 86400000; // 30 days
  try {
    var f = localStorage.getItem("hlw_utm_first");
    if (f) {
      var fp = JSON.parse(f);
      if (fp.ts && (Date.now() - fp.ts) < MAX_AGE) { result.first = fp; }
      else { localStorage.removeItem("hlw_utm_first"); localStorage.removeItem("hlw_utm_referrer"); }
    }
  } catch (e) {}
  try {
    var l = localStorage.getItem("hlw_utm_last");
    if (l) {
      var lp = JSON.parse(l);
      if (lp.ts && (Date.now() - lp.ts) < MAX_AGE) { result.last = lp; }
      else { localStorage.removeItem("hlw_utm_last"); }
    }
  } catch (e) {}
  try { result.referrer = localStorage.getItem("hlw_utm_referrer") || ""; } catch (e) {}
  return result;
}
