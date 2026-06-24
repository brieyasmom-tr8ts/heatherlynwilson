// Lightweight in-house page view tracker. Pings /api/track once per page
// load. Skips admin pages and skips Heather's own visits (admin_key in
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

    var body = JSON.stringify({ path: path, referrer: referrer });

    // Use sendBeacon so it works even if the user immediately navigates away.
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track", blob);
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  } catch (e) {}
})();
