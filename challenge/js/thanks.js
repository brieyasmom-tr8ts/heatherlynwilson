// Give Thanks: a psalm a day and the gratitude list.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares and are only called from click
// handlers or from inside other functions, never while the page parses,
// which is checked with a parser before the cut is made.

function tkLoad() {
  tkLoaded = true;
  document.getElementById('tkUserName').textContent = userName || 'friend';
  var ch = tkChallenge();
  tkStartIso = (ch && ch.personal_start_date) || '2026-11-01';
  var tl = document.getElementById('tkTrackLabel');
  if (tl && ch) tl.textContent = (ch.track === 'all-psalms' ? 'All 150 Psalms in 30 Days' : 'One Psalm of Thanks a Day');

  var plan = (ch && ch.track === 'all-psalms') ? 'psalms-150' : 'thanks';
  var cAll = fetch('/api/plan-emails?plan=' + plan)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.emails && d.emails.length) return d.emails;
      return fetch('emails-' + plan + '.json').then(function(r) { return r.json(); });
    })
    .catch(function() {
      return fetch('emails-' + plan + '.json').then(function(r) { return r.json(); }).catch(function() { return []; });
    })
    .then(function(d) { tkContent = d || []; });

  tkCurrentDay = Math.min(30, computeDayFor(tkStartIso, 30));

  if (tkCurrentDay === 0) {
    document.getElementById('tkPreChallenge').style.display = 'block';
    tkCountdown();
    initPreStartFix('preFixThanks', tkStartIso);
    return;
  }
  document.getElementById('tkActiveChallenge').style.display = 'block';
  Promise.all([cAll, tkLoadData()]).then(function() {
    tkViewingDay = tkCurrentDay;
    tkRenderDay();
    tkUpdateStats();
    tkRenderCloud();
    tkInitGroupCloud();
  });
}

function tkChallenge() { return thanksChallenge; }

function tkCountdown() {
  var titleEl = document.getElementById('tkStartsOn');
  if (titleEl && tkStartIso) titleEl.textContent = 'Your challenge starts ' + formatStartDate(tkStartIso);
  function u() {
    // The reader's own start date, not November 1st. See countdownReload.
    var diff = new Date((tkStartIso || '2026-11-01') + 'T11:00:00Z') - new Date();
    if (!(diff > 0)) { countdownReload('thanks'); return; }
    countdownTicking('thanks');
    document.getElementById('tkCdDays').textContent = Math.floor(diff / 86400000);
    document.getElementById('tkCdHours').textContent = Math.floor((diff % 86400000) / 3600000);
    document.getElementById('tkCdMins').textContent = Math.floor((diff % 3600000) / 60000);
  }
  u();
  setInterval(u, 30000);
}

function tkLoadData() {
  if (!userEmail || !userToken) return Promise.resolve();
  return fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=november-thanks-2026')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      tkEntries = {};
      (data.entries || []).forEach(function(e) { tkEntries[e.day] = e; });
      tkCheckedDays = new Set(data.days || []);
      tkStreak = data.streak || 0;
    })
    .catch(function() { tkEntries = {}; tkCheckedDays = new Set(); tkStreak = 0; });
}

function tkRenderDay() {
  var day = tkViewingDay;
  if (day < 1) return;
  var c = tkContent[day - 1] || {};
  var entry = tkEntries[day] || {};
  var reading = c.reading || '';

  document.getElementById('tkDayLabel').textContent = 'DAY ' + day + ' OF 30';
  document.getElementById('tkDayReading').textContent = reading;
  document.getElementById('tkHeroTitle').textContent = c.title || document.getElementById('tkHeroTitle').textContent;
  var eyebrow = c.focus ? (c.focus + (reading ? ' | ' + reading : '')) : (reading || ('Day ' + day));
  document.getElementById('tkLessonEyebrow').textContent = eyebrow;
  document.getElementById('tkLessonTitle').textContent = c.title || '';
  document.getElementById('tkLessonBody').innerHTML = dashboardBody(c.body || '').split('\n\n').map(function(p) { return '<p>' + linkifyText(escapeText(p)) + '</p>'; }).join('');
  document.getElementById('tkPrevDay').disabled = (day <= 1);
  document.getElementById('tkNextDay').disabled = (day >= tkCurrentDay);

  document.getElementById('tkReadLabel').textContent = 'Read ' + (reading || 'today');
  var q = encodeURIComponent((reading || '').replace(/-/g, '-'));
  document.getElementById('tkReadBG').href = 'https://www.biblegateway.com/passage/?search=' + q + '&version=NLT';
  document.getElementById('tkReadYV').href = 'https://www.bible.com/search/bible?q=' + q;

  var prompt = c.prompt || c.practice || '';
  document.getElementById('tkPrompt').textContent = prompt;
  tkFillEntry(entry.stood_out || '');
  var cnt = 0;
  Object.keys(tkEntries).forEach(function(k) { if ((tkEntries[k].stood_out || '').trim()) cnt += (tkEntries[k].stood_out || '').split('\n').filter(function(l){return l.trim();}).length; });
  document.getElementById('tkListCount').textContent = cnt > 0 ? (cnt + ' thanks written so far, growing toward Thanksgiving.') : 'Everything you write is saved here, growing toward Thanksgiving.';
  document.getElementById('tkReadCheckbox').checked = entry.read_confirmed === 1;

  var certCard = document.getElementById('tkCertCard');
  if (tkCheckedDays.size >= 30) {
    certCard.style.display = 'block';
    document.getElementById('tkCertLink').href = 'certificate.html?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=november-thanks-2026';
  } else {
    certCard.style.display = 'none';
  }

  document.getElementById('tkSaveStatus').textContent = '';
  tkRenderGrid();
  tkSyncShareBox();
}

function tkRenderGrid() {
  var html = '';
  for (var d = 1; d <= 30; d++) {
    var cl = 'day-dot';
    if (tkCheckedDays.has(d)) cl += ' completed';
    if (d === tkCurrentDay) cl += ' current';
    if (d > tkCurrentDay) cl += ' future';
    if (d === tkViewingDay) cl += ' viewing';
    html += '<div class="' + cl + '" onclick="chModalOpen(\'tk\', ' + d + ')">' + d + '</div>';
  }
  document.getElementById('tkDayGrid').innerHTML = html;
}

function tkUpdateStats() {
  document.getElementById('tkHeroStreak').textContent = tkStreak;
  document.getElementById('tkHeroTotal').textContent = tkCheckedDays.size;
  document.getElementById('tkHeroDay').textContent = tkCurrentDay;
  document.getElementById('tkSideStreak').textContent = tkStreak;
  document.getElementById('tkProgressFill').style.width = Math.round((tkCheckedDays.size / 30) * 100) + '%';
  document.getElementById('tkProgressText').textContent = tkCheckedDays.size;
  renderRestart('november-thanks-2026');
}

function tkChangeDay(delta) {
  var n = tkViewingDay + delta;
  if (n < 1 || n > tkCurrentDay) return;
  tkViewingDay = n;
  tkRenderDay();
}

function tkGoToDay(d) {
  if (d > tkCurrentDay) return;
  tkViewingDay = d;
  tkRenderDay();
}

function tkComposeEntry() {
  return [1, 2, 3].map(function(n) { return (document.getElementById('tkEntry' + n) || {}).value || ''; })
    .map(function(v) { return v.trim(); }).filter(Boolean).join('\n');
}

function tkFillEntry(text) {
  var lines = String(text || '').split('\n').map(function(l) { return l.replace(/^\s*\d+[.)]\s*/, '').trim(); }).filter(Boolean);
  [1, 2, 3].forEach(function(n) {
    var el = document.getElementById('tkEntry' + n);
    if (el) el.value = lines[n - 1] || '';
  });
}

function tkOnType() {
  var day = tkViewingDay;
  if (day < 1) return;
  if (!tkEntries[day]) tkEntries[day] = {};
  tkEntries[day].stood_out = tkComposeEntry();
  tkRenderCloud();
  var st = document.getElementById('tkSaveStatus');
  if (!userEmail || !userToken) { if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; } return; }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(tkSaveTimer);
  tkSaveTimer = setTimeout(function() { tkSaveEntry(day); }, 800);
}

function tkOnCheck() {
  var day = tkViewingDay;
  if (day < 1) return;
  if (!tkEntries[day]) tkEntries[day] = {};
  var checked = document.getElementById('tkReadCheckbox').checked;
  tkEntries[day].read_confirmed = checked ? 1 : 0;
  tkEntries[day].stood_out = tkComposeEntry();
  if (checked) tkCheckedDays.add(day); else tkCheckedDays.delete(day);
  tkRenderGrid();
  tkUpdateStats();
  var st = document.getElementById('tkSaveStatus');
  if (!userEmail || !userToken) { if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; } return; }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(tkSaveTimer);
  tkSaveTimer = setTimeout(function() { tkSaveEntry(day); }, 800);
}

function tkSaveEntry(day) {
  var entry = tkEntries[day] || {};
  var payload = { email: userEmail, token: userToken, challenge: 'november-thanks-2026', day: day, read_confirmed: entry.read_confirmed === 1 };
  payload.stood_out = tkComposeEntry();
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var st = document.getElementById('tkSaveStatus');
      if (data && data.success) {
        if (st) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
        tkLoadData().then(function() { tkUpdateStats(); tkRenderCloud(); maybeShowCompletionCelebration('november-thanks-2026', 30, tkCheckedDays.size); });
        tkSaveShare(day);
      } else if (st) { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() {
      var st = document.getElementById('tkSaveStatus');
      if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; }
    });
}

function tkCopyInvite() {
  navigator.clipboard.writeText('https://heatherlynwilson.com/challenge-thanks').then(function() {
    var btn = document.getElementById('tkCopyLinkBtn');
    if (!btn) return;
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Copy Invite Link'; }, 2000);
  });
}

function tkRunPreview(params) {
  userName = params.get('name') || 'Heather';
  thanksChallenge = { challenge: 'november-thanks-2026', track: params.get('track') || "one-psalm", personal_start_date: '2026-11-01' };
  userChallenges = [thanksChallenge];
  tkLoaded = true;
  if (params.get('state') === 'pre') {
    showThanksView();
    document.getElementById('tkUserName').textContent = userName;
    document.getElementById('tkPreChallenge').style.display = 'block';
    document.getElementById('dashLoading').style.display = 'none';
    tkCountdown();
    initPreStartFix('preFixThanks', tkStartIso);
    previewShowGroupBox('thanksView');
    return;
  }
  var fakeDay = parseInt(params.get('day') || '5', 10);
  if (!Number.isFinite(fakeDay) || fakeDay < 1) fakeDay = 1;
  if (fakeDay > 30) fakeDay = 30;
  tkCurrentDay = fakeDay;
  tkViewingDay = fakeDay;
  tkCheckedDays = new Set();
  for (var d = 1; d < fakeDay; d++) tkCheckedDays.add(d);
  tkStreak = fakeDay - 1;
  showThanksView();
  document.getElementById('tkUserName').textContent = userName;
  document.getElementById('tkActiveChallenge').style.display = 'block';
  document.getElementById('dashLoading').style.display = 'none';
  var plan = (params.get('track') === 'all-psalms') ? 'psalms-150' : 'thanks';
  loadPlanContent(plan, 'emails-' + plan + '.json')
    .then(function(d) { tkContent = d || []; })
    .then(function() { tkRenderDay(); tkUpdateStats(); tkRenderCloud(); previewShowGroupBox('thanksView'); });
}

function tkPrintList() {
  var lines = [];
  for (var d = 1; d <= 30; d++) {
    var e = tkEntries[d];
    if (e && (e.stood_out || '').trim()) {
      (e.stood_out || '').split('\n').forEach(function(l) { if (l.trim()) lines.push(l.trim().replace(/^\d+[.)]\s*/, '')); });
    }
  }
  var w = window.open('', '_blank');
  if (!w) return;
  var items = lines.length
    ? lines.map(function(l, i) { return '<p style="margin:0 0 7px;font-size:14px;line-height:1.5;">' + (i + 1) + '. ' + l.replace(/</g, '&lt;') + '</p>'; }).join('')
    : '<p style="text-align:center;color:#6b7280;">Your list is empty so far. Write three thanks a day and watch it grow.</p>';
  w.document.write('<html><head><title>Things We Thanked God For</title></head>' +
    '<body style="font-family:Georgia,serif;max-width:560px;margin:36px auto;padding:28px;border:3px solid #c8a365;color:#1f2937;">' +
    '<h1 style="text-align:center;font-size:24px;margin:0 0 4px;">Things We Thanked God For</h1>' +
    '<p style="text-align:center;color:#b85638;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 18px;">' + lines.length + ' thanks &middot; November 2026</p>' +
    (lines.length ? '<div style="text-align:center;line-height:1.25;margin:0 0 22px;padding:0 0 18px;border-bottom:1px solid #e5e0d5;">' + tkCloudHtml(tkCloudWords(lines), 60, true) + '</div>' : '') +
    items +
    '<p style="text-align:center;color:#c8a365;margin-top:20px;font-size:12px;">HeatherLynWilson.com &middot; #GiveThanksChallenge</p>' +
    '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(function() { w.print(); }, 300);
}

// ─── Thankful cloud (Heather, October 28 2026) ──────────────────────────────
// The reader's own cloud is built here from what they have written; nothing
// new is stored for it. The group cloud comes from /api/thanks-cloud and only
// counts days a reader ticked "Share today's thanks in my group's cloud".
// tkCloudWords() matches wordCounts() in functions/api/thanks-cloud.js.

function tkCloudWords(lines) {
  var stop = {};
  ('a an and are as at in if be been being but by can could did do does doing for from had has have ' +
   'having he her here hers him his how i i\'m im is it it\'s its just me more most my myself no not now of on ' +
   'one or our ours out over she so some such than that that\'s the their them then there these they this ' +
   'those through to too up us very was we were what when where which while who whom why will with would ' +
   'you your yours today day got get really also all about after again am any because before both each few ' +
   'into off only other own same should until down being let lets thing things lot lots im ive i\'ve').split(' ').forEach(function(w) { stop[w] = 1; });
  var counts = {};
  (lines || []).forEach(function(line) {
    String(line || '').toLowerCase().replace(/[\u2019\u2018]/g, "'").replace(/[^a-z' ]+/g, ' ').split(/\s+/).forEach(function(w) {
      w = w.replace(/^'+|'+$/g, '').replace(/'s$/, '');
      if (w.length > 1 && !stop[w]) counts[w] = (counts[w] || 0) + 1;
    });
  });
  Object.keys(counts).forEach(function(w) {
    if (w.slice(-1) !== 's' || w.slice(-2) === 'ss') return;
    var single = w.slice(0, -1);
    if (counts[single] && counts[w]) {
      var keep = counts[w] > counts[single] ? w : single;
      var drop = keep === w ? single : w;
      counts[keep] += counts[drop];
      delete counts[drop];
    }
  });
  return counts;
}

// Words sized by how often they appear, in a steady shuffled order so the
// biggest words are spread through the cloud rather than stacked at the start.
function tkCloudHtml(counts, limit, forPrint) {
  var list = Object.keys(counts).map(function(w) { return { w: w, n: counts[w] }; })
    .sort(function(a, b) { return b.n - a.n || (a.w < b.w ? -1 : 1); }).slice(0, limit || 80);
  if (!list.length) return '';
  var max = list[0].n, min = list[list.length - 1].n;
  var colors = ['#b85638', '#8d3e26', '#c8a365', '#1f2937', '#4b5563'];
  list.sort(function(a, b) {
    function h(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 9973; return x; }
    return h(a.w) - h(b.w);
  });
  return list.map(function(o) {
    var t = max === min ? 0.5 : Math.sqrt((o.n - min) / (max - min));
    var size = Math.round((forPrint ? 11 : 14) + t * (forPrint ? 19 : 26));
    var color = colors[o.w.length % colors.length];
    return '<span style="display:inline-block;margin:2px 7px;font-family:Lora,Georgia,serif;font-weight:' + (t > 0.5 ? 600 : 400) +
      ';font-size:' + size + 'px;color:' + color + ';" title="' + o.n + '">' + o.w.replace(/</g, '&lt;') + '</span>';
  }).join(' ');
}

function tkAllLines() {
  var lines = [];
  Object.keys(tkEntries).forEach(function(k) {
    String((tkEntries[k] && tkEntries[k].stood_out) || '').split('\n').forEach(function(l) { if (l.trim()) lines.push(l.trim()); });
  });
  return lines;
}

function tkRenderCloud() {
  var el = document.getElementById('tkCloud');
  if (!el) return;
  var html = tkCloudHtml(tkCloudWords(tkAllLines()), 80, false);
  el.innerHTML = html || '<p class="tk-cloud-empty">Write your three thanks and your cloud starts here.</p>';
}

function tkInitGroupCloud() {
  if (!userEmail || !userToken) return;
  fetch('/api/group-list?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var g = ((data && data.groups) || []).filter(function(x) { return x.challenge === 'november-thanks-2026'; })[0];
      if (!g) return;
      tkGroupId = g.id;
      document.getElementById('tkGroupCloudTitle').textContent = (g.name || 'Your group') + "'s thankful cloud";
      document.getElementById('tkGroupCloudCard').style.display = '';
      return fetch('/api/thanks-cloud?mine=1&email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken))
        .then(function(r) { return r.json(); })
        .then(function(d) { tkSharedDays = new Set((d && d.days) || []); tkSyncShareBox(); tkLoadGroupCloud(); });
    })
    .catch(function() {});
}

function tkLoadGroupCloud() {
  if (!tkGroupId) return;
  fetch('/api/thanks-cloud?group=' + encodeURIComponent(tkGroupId) + '&email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var counts = {};
      ((d && d.words) || []).forEach(function(o) { counts[o.w] = o.n; });
      var html = tkCloudHtml(counts, 80, false);
      var n = (d && d.sharers) || 0;
      document.getElementById('tkGroupCloudSub').textContent = n
        ? 'Thanks shared by ' + n + (n === 1 ? ' person' : ' people') + ' in your group. Words you have in common grow biggest. No names, just the words.'
        : 'Nothing shared yet. Tick the box under your three thanks to add yours.';
      document.getElementById('tkGroupCloud').innerHTML = html;
    })
    .catch(function() {});
}

// The box shows the saved choice for that day. A day with nothing written yet
// starts from the reader's last choice, so a sharer does not have to tick it daily.
function tkSyncShareBox() {
  var row = document.getElementById('tkShareRow');
  if (!row) return;
  if (!tkGroupId || tkViewingDay < 1) { row.style.display = 'none'; return; }
  row.style.display = '';
  var day = tkViewingDay;
  var written = ((tkEntries[day] && tkEntries[day].stood_out) || '').trim();
  var pref = '';
  try { pref = localStorage.getItem('tk_share_pref') || ''; } catch (e) {}
  document.getElementById('tkShareBox').checked = tkSharedDays.has(day) || (!written && pref === '1');
}

function tkOnShareToggle() {
  var on = document.getElementById('tkShareBox').checked;
  try { localStorage.setItem('tk_share_pref', on ? '1' : '0'); } catch (e) {}
  tkSaveShare(tkViewingDay);
}

function tkSaveShare(day) {
  if (!tkGroupId || !userEmail || !userToken || day < 1) return;
  // The box only describes the day on screen; any other day keeps what it had.
  var box = document.getElementById('tkShareBox');
  var on = (day === tkViewingDay && box) ? box.checked : tkSharedDays.has(day);
  if (on === tkSharedDays.has(day)) return;
  fetch('/api/thanks-cloud', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, token: userToken, day: day, share: on })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d || !d.success) return;
      if (on) tkSharedDays.add(day); else tkSharedDays.delete(day);
      tkLoadGroupCloud();
    })
    .catch(function() {});
}
