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
    postJSON("/api/track", { path: path, referrer: referrer, view_id: viewId });

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
