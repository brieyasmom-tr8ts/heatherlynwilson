// Global site search. Injects a search icon into the topbar and a modal
// that opens on click. Index is loaded lazily from /search-index.json the
// first time the user types.
(function () {
  var INDEX_URL = "/search-index.json?v=1";
  var index = null;
  var loading = null;

  // ---------- inject icon into topbar ----------
  function inject() {
    var topbarRow = document.querySelector(".topbar-row");
    if (!topbarRow || topbarRow.querySelector(".site-search-btn")) return;
    var btn = document.createElement("button");
    btn.className = "site-search-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Search");
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="7"></circle>' +
      '<line x1="21" y1="21" x2="16.5" y2="16.5"></line>' +
      "</svg>";
    btn.addEventListener("click", openModal);
    // Insert before the "Read My Blog" button if present, otherwise append
    var blogBtn = topbarRow.querySelector(".blog-btn");
    if (blogBtn) {
      blogBtn.parentNode.insertBefore(btn, blogBtn);
    } else {
      topbarRow.appendChild(btn);
    }
  }

  // ---------- styles ----------
  function injectStyles() {
    if (document.getElementById("site-search-styles")) return;
    var css = '' +
      '.site-search-btn{background:none;border:none;color:var(--ink,#1f2937);cursor:pointer;padding:6px 10px;margin-right:10px;display:inline-flex;align-items:center;border-radius:4px;}' +
      '.site-search-btn:hover{background:rgba(0,0,0,0.05);color:var(--accent,#b85638);}' +
      '.site-search-overlay{position:fixed;inset:0;background:rgba(26,17,8,0.55);z-index:9999;display:none;align-items:flex-start;justify-content:center;padding:60px 16px 16px;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}' +
      '.site-search-overlay.open{display:flex;}' +
      '.site-search-modal{background:#fff;max-width:680px;width:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.25);overflow:hidden;display:flex;flex-direction:column;max-height:80vh;}' +
      '.site-search-inputrow{display:flex;align-items:center;border-bottom:1px solid #e5e0d5;padding:10px 16px;}' +
      '.site-search-inputrow svg{color:#6b7280;margin-right:10px;flex-shrink:0;}' +
      '.site-search-input{flex:1;border:none;outline:none;font-size:16px;font-family:inherit;padding:10px 0;color:#1f2937;background:transparent;}' +
      '.site-search-close{background:none;border:1px solid #e5e0d5;color:#6b7280;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;cursor:pointer;border-radius:4px;padding:6px 10px;margin-left:8px;}' +
      '.site-search-close:hover{background:#f7f4ee;color:#1f2937;}' +
      '.site-search-results{overflow-y:auto;flex:1;}' +
      '.site-search-result{display:block;padding:14px 20px;border-bottom:1px solid #f1eee6;text-decoration:none;color:inherit;cursor:pointer;}' +
      '.site-search-result:hover,.site-search-result.active{background:#faf6ef;}' +
      '.site-search-result:last-child{border-bottom:0;}' +
      '.site-search-cat{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#b85638;font-weight:700;margin-bottom:4px;}' +
      '.site-search-title{font-family:Lora,Georgia,serif;font-size:17px;font-weight:600;color:#1f2937;margin-bottom:4px;line-height:1.3;}' +
      '.site-search-snippet{font-size:13px;color:#4b5563;line-height:1.5;font-weight:300;}' +
      '.site-search-snippet mark{background:#fef3c7;color:#92400e;padding:0 2px;border-radius:2px;font-weight:500;}' +
      '.site-search-empty{padding:32px 20px;text-align:center;color:#6b7280;font-size:14px;}' +
      '.site-search-foot{padding:10px 16px;font-size:11px;color:#9ca3af;border-top:1px solid #f1eee6;display:flex;justify-content:space-between;align-items:center;}' +
      '@media (max-width:560px){.site-search-overlay{padding:20px 12px 12px;}.site-search-modal{max-height:90vh;}}';
    var style = document.createElement("style");
    style.id = "site-search-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- modal lifecycle ----------
  var overlay = null;
  var input = null;
  var resultsEl = null;
  var footEl = null;
  var activeIdx = -1;
  var currentResults = [];

  function buildModal() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "site-search-overlay";
    overlay.innerHTML =
      '<div class="site-search-modal">' +
      '<div class="site-search-inputrow">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>' +
      '<input class="site-search-input" type="search" placeholder="Search posts, books, pages…" autocomplete="off" spellcheck="false">' +
      '<button class="site-search-close" type="button">Esc</button>' +
      "</div>" +
      '<div class="site-search-results"></div>' +
      '<div class="site-search-foot"><span class="site-search-footstatus">Type to search</span><span>↑↓ navigate · ↵ open</span></div>' +
      "</div>";
    document.body.appendChild(overlay);
    input = overlay.querySelector(".site-search-input");
    resultsEl = overlay.querySelector(".site-search-results");
    footEl = overlay.querySelector(".site-search-footstatus");
    overlay.querySelector(".site-search-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    input.addEventListener("input", function () { runSearch(input.value); });
    input.addEventListener("keydown", onKeydown);
  }

  function openModal() {
    injectStyles();
    buildModal();
    overlay.classList.add("open");
    setTimeout(function () { input.focus(); }, 30);
    ensureIndex();
    if (input.value) runSearch(input.value);
  }

  function closeModal() {
    if (overlay) overlay.classList.remove("open");
  }

  // ---------- index loading ----------
  function ensureIndex() {
    if (index || loading) return;
    if (footEl) footEl.textContent = "Loading index…";
    loading = fetch(INDEX_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        index = (data.entries || []).map(function (e) {
          return {
            url: e.url,
            title: e.title || "",
            category: e.category || "",
            description: e.description || "",
            body: (e.body || "").toLowerCase(),
            titleLower: (e.title || "").toLowerCase(),
            descLower: (e.description || "").toLowerCase(),
            originalBody: e.body || "",
          };
        });
        if (footEl) footEl.textContent = index.length + " pages indexed";
        if (input && input.value) runSearch(input.value);
      })
      .catch(function () {
        if (footEl) footEl.textContent = "Search index failed to load";
      });
  }

  // ---------- searching ----------
  function runSearch(qRaw) {
    var q = (qRaw || "").trim().toLowerCase();
    if (!q) {
      currentResults = [];
      render();
      if (footEl) footEl.textContent = "Type to search";
      return;
    }
    if (!index) {
      ensureIndex();
      return;
    }
    var terms = q.split(/\s+/).filter(Boolean);
    var scored = [];
    for (var i = 0; i < index.length; i++) {
      var e = index[i];
      var score = 0;
      var allMatch = true;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        var inTitle = e.titleLower.indexOf(term) !== -1;
        var inDesc = e.descLower.indexOf(term) !== -1;
        var inBody = e.body.indexOf(term) !== -1;
        if (!inTitle && !inDesc && !inBody) { allMatch = false; break; }
        if (inTitle) score += 10;
        if (inDesc) score += 4;
        if (inBody) score += 1;
      }
      if (allMatch) scored.push({ entry: e, score: score });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    currentResults = scored.slice(0, 30).map(function (s) { return s.entry; });
    activeIdx = currentResults.length ? 0 : -1;
    render(terms);
    if (footEl) footEl.textContent = currentResults.length + " result" + (currentResults.length === 1 ? "" : "s");
  }

  function snippet(body, terms) {
    if (!body) return "";
    var lower = body.toLowerCase();
    var pos = -1;
    for (var i = 0; i < terms.length; i++) {
      pos = lower.indexOf(terms[i]);
      if (pos !== -1) break;
    }
    var start = Math.max(0, pos - 60);
    var end = Math.min(body.length, (pos === -1 ? 0 : pos) + 160);
    var raw = (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
    raw = escapeHtml(raw);
    for (var j = 0; j < terms.length; j++) {
      var re = new RegExp("(" + escapeReg(terms[j]) + ")", "ig");
      raw = raw.replace(re, "<mark>$1</mark>");
    }
    return raw;
  }

  function render(terms) {
    if (!resultsEl) return;
    if (!currentResults.length) {
      var msg = input && input.value ? "No matches." : "Type to search posts, pages, and books.";
      resultsEl.innerHTML = '<div class="site-search-empty">' + msg + "</div>";
      return;
    }
    var html = "";
    for (var i = 0; i < currentResults.length; i++) {
      var e = currentResults[i];
      var snip = snippet(e.originalBody || e.description || "", terms || []);
      html += '<a class="site-search-result' + (i === activeIdx ? " active" : "") + '" href="' + escapeAttr(e.url) + '" data-i="' + i + '">' +
        '<div class="site-search-cat">' + escapeHtml(e.category) + "</div>" +
        '<div class="site-search-title">' + escapeHtml(e.title) + "</div>" +
        '<div class="site-search-snippet">' + snip + "</div>" +
        "</a>";
    }
    resultsEl.innerHTML = html;
    resultsEl.querySelectorAll(".site-search-result").forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        activeIdx = parseInt(el.getAttribute("data-i"), 10);
        updateActive();
      });
    });
  }

  function updateActive() {
    if (!resultsEl) return;
    var items = resultsEl.querySelectorAll(".site-search-result");
    items.forEach(function (el, i) {
      if (i === activeIdx) el.classList.add("active");
      else el.classList.remove("active");
    });
    var el = items[activeIdx];
    if (el) {
      var elTop = el.offsetTop;
      var elBot = elTop + el.offsetHeight;
      if (elTop < resultsEl.scrollTop) resultsEl.scrollTop = elTop;
      if (elBot > resultsEl.scrollTop + resultsEl.clientHeight) resultsEl.scrollTop = elBot - resultsEl.clientHeight;
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") { closeModal(); return; }
    if (!currentResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % currentResults.length;
      updateActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + currentResults.length) % currentResults.length;
      updateActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      var r = currentResults[activeIdx];
      if (r && r.url) window.location.href = r.url;
    }
  }

  // ---------- keyboard shortcut: Cmd/Ctrl+K opens search ----------
  document.addEventListener("keydown", function (e) {
    var isFind = (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
    if (isFind) {
      e.preventDefault();
      openModal();
    } else if (e.key === "/" && document.activeElement && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      openModal();
    }
  });

  // ---------- helpers ----------
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function escapeAttr(s) { return escapeHtml(s); }
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // ---------- bootstrap ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
