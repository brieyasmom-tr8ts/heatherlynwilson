// God With Us: the Gospels and the advent calendar.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares and are only called from click
// handlers or from inside other functions, never while the page parses,
// which is checked with a parser before the cut is made.

function gsLoad() {
  gsLoaded = true;
  document.getElementById('gsUserName').textContent = userName || 'friend';
  var ch = gsChallenge();
  gsStartIso = (ch && ch.personal_start_date) || '2026-12-01';
  var tl = document.getElementById('gsTrackLabel');
  if (tl && ch) tl.textContent = (ch.track === 'luke' ? 'Luke by Christmas Eve' : 'All Four Gospels');

  var plan = (ch && ch.track === 'luke') ? 'luke' : 'gospels';
  var cAll = fetch('/api/plan-emails?plan=' + plan)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.emails && d.emails.length) return d.emails;
      return fetch('emails-' + plan + '.json').then(function(r) { return r.json(); });
    })
    .catch(function() {
      return fetch('emails-' + plan + '.json').then(function(r) { return r.json(); }).catch(function() { return []; });
    })
    .then(function(d) { gsContent = d || []; });

  gsCurrentDay = Math.min(31, computeDayFor(gsStartIso, 31));

  if (gsCurrentDay === 0) {
    document.getElementById('gsPreChallenge').style.display = 'block';
    gsCountdown();
    initPreStartFix('preFixGospels', gsStartIso);
    return;
  }
  document.getElementById('gsActiveChallenge').style.display = 'block';
  Promise.all([cAll, gsLoadData()]).then(function() {
    gsViewingDay = gsCurrentDay;
    gsRenderDay();
    gsUpdateStats();
  });
}

function gsChallenge() { return gospelsChallenge; }

function gsCountdown() {
  function u() {
    var diff = new Date('2026-12-01T11:00:00Z') - new Date();
    if (!(diff > 0)) { location.reload(); return; }
    document.getElementById('gsCdDays').textContent = Math.floor(diff / 86400000);
    document.getElementById('gsCdHours').textContent = Math.floor((diff % 86400000) / 3600000);
    document.getElementById('gsCdMins').textContent = Math.floor((diff % 3600000) / 60000);
  }
  u();
  setInterval(u, 30000);
}

function gsLoadData() {
  if (!userEmail || !userToken) return Promise.resolve();
  return fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=december-gospels-2026')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      gsEntries = {};
      (data.entries || []).forEach(function(e) { gsEntries[e.day] = e; });
      gsCheckedDays = new Set(data.days || []);
      gsStreak = data.streak || 0;
    })
    .catch(function() { gsEntries = {}; gsCheckedDays = new Set(); gsStreak = 0; });
}

function gsRenderDay() {
  var day = gsViewingDay;
  if (day < 1) return;
  var c = gsContent[day - 1] || {};
  var entry = gsEntries[day] || {};
  var reading = c.reading || '';

  document.getElementById('gsDayLabel').textContent = 'DAY ' + day + ' OF 31';
  document.getElementById('gsDayReading').textContent = reading;
  document.getElementById('gsHeroTitle').textContent = c.title || document.getElementById('gsHeroTitle').textContent;
  var eyebrow = c.focus ? (c.focus + (reading ? ' | ' + reading : '')) : (reading || ('Day ' + day));
  document.getElementById('gsLessonEyebrow').textContent = eyebrow;
  document.getElementById('gsLessonTitle').textContent = c.title || '';
  document.getElementById('gsLessonBody').innerHTML = dashboardBody(c.body || '').split('\n\n').map(function(p) { return '<p>' + linkifyText(escapeText(p)) + '</p>'; }).join('');
  document.getElementById('gsPrevDay').disabled = (day <= 1);
  document.getElementById('gsNextDay').disabled = (day >= gsCurrentDay);

  document.getElementById('gsReadLabel').textContent = 'Read ' + (reading || 'today');
  var q = encodeURIComponent((reading || '').replace(/-/g, '-'));
  document.getElementById('gsReadBG').href = 'https://www.biblegateway.com/passage/?search=' + q + '&version=NLT';
  document.getElementById('gsReadYV').href = 'https://www.bible.com/search/bible?q=' + q;

  document.getElementById('gsReadCheckbox').checked = entry.read_confirmed === 1;

  var certCard = document.getElementById('gsCertCard');
  if (gsCheckedDays.size >= 31) {
    certCard.style.display = 'block';
    document.getElementById('gsCertLink').href = 'certificate.html?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=december-gospels-2026';
  } else {
    certCard.style.display = 'none';
  }

  document.getElementById('gsSaveStatus').textContent = '';
  gsRenderGrid();
  gsRenderAdvent();
  gsAdventSync();
  gsAdventAutoOpen();
}

function gsRenderGrid() {
  var html = '';
  for (var d = 1; d <= 31; d++) {
    var cl = 'day-dot';
    if (gsCheckedDays.has(d)) cl += ' completed';
    if (d === gsCurrentDay) cl += ' current';
    if (d > gsCurrentDay) cl += ' future';
    if (d === gsViewingDay) cl += ' viewing';
    html += '<div class="' + cl + '" onclick="chModalOpen(\'gs\', ' + d + ')">' + d + '</div>';
  }
  document.getElementById('gsDayGrid').innerHTML = html;
}

function gsUpdateStats() {
  document.getElementById('gsHeroStreak').textContent = gsStreak;
  document.getElementById('gsHeroTotal').textContent = gsCheckedDays.size;
  document.getElementById('gsHeroDay').textContent = gsCurrentDay;
  document.getElementById('gsSideStreak').textContent = gsStreak;
  document.getElementById('gsProgressFill').style.width = Math.round((gsCheckedDays.size / 31) * 100) + '%';
  document.getElementById('gsProgressText').textContent = gsCheckedDays.size;
  renderRestart('december-gospels-2026');
}

function gsChangeDay(delta) {
  var n = gsViewingDay + delta;
  if (n < 1 || n > gsCurrentDay) return;
  gsViewingDay = n;
  gsRenderDay();
}

function gsGoToDay(d) {
  if (d > gsCurrentDay) return;
  gsViewingDay = d;
  gsRenderDay();
}

function gsOnCheck() {
  var day = gsViewingDay;
  if (day < 1) return;
  if (!gsEntries[day]) gsEntries[day] = {};
  var checked = document.getElementById('gsReadCheckbox').checked;
  gsEntries[day].read_confirmed = checked ? 1 : 0;
  
  if (checked) gsCheckedDays.add(day); else gsCheckedDays.delete(day);
  gsRenderGrid();
  gsUpdateStats();
  if (checked) {
    gsRenderAdvent();
    var adv = document.getElementById('gsAdvent');
    if (adv) adv.scrollIntoView({ behavior: 'smooth' });
    setTimeout(function() { gsOpenDoor(day); }, 450);
  }
  var st = document.getElementById('gsSaveStatus');
  if (!userEmail || !userToken) { if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; } return; }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(gsSaveTimer);
  gsSaveTimer = setTimeout(function() { gsSaveEntry(day); }, 800);
}

function gsSaveEntry(day) {
  var entry = gsEntries[day] || {};
  var payload = { email: userEmail, token: userToken, challenge: 'december-gospels-2026', day: day, read_confirmed: entry.read_confirmed === 1 };
  payload.stood_out = '';
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var st = document.getElementById('gsSaveStatus');
      if (data && data.success) {
        if (st) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
        gsLoadData().then(function() { gsUpdateStats(); maybeShowCompletionCelebration('december-gospels-2026', 31, gsCheckedDays.size); });
      } else if (st) { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() {
      var st = document.getElementById('gsSaveStatus');
      if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; }
    });
}

function gsCopyInvite() {
  navigator.clipboard.writeText('https://heatherlynwilson.com/challenge-gospels').then(function() {
    var btn = document.getElementById('gsCopyLinkBtn');
    if (!btn) return;
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Copy Invite Link'; }, 2000);
  });
}

function gsRunPreview(params) {
  userName = params.get('name') || 'Heather';
  gospelsChallenge = { challenge: 'december-gospels-2026', track: params.get('track') || "four-gospels", personal_start_date: '2026-12-01' };
  userChallenges = [gospelsChallenge];
  gsLoaded = true;
  if (params.get('state') === 'pre') {
    showGospelsView();
    document.getElementById('gsUserName').textContent = userName;
    document.getElementById('gsPreChallenge').style.display = 'block';
    document.getElementById('dashLoading').style.display = 'none';
    gsCountdown();
    initPreStartFix('preFixGospels', gsStartIso);
    previewShowGroupBox('gospelsView');
    return;
  }
  var fakeDay = parseInt(params.get('day') || '5', 10);
  if (!Number.isFinite(fakeDay) || fakeDay < 1) fakeDay = 1;
  if (fakeDay > 31) fakeDay = 31;
  gsCurrentDay = fakeDay;
  gsViewingDay = fakeDay;
  gsCheckedDays = new Set();
  for (var d = 1; d < fakeDay; d++) gsCheckedDays.add(d);
  gsStreak = fakeDay - 1;
  showGospelsView();
  document.getElementById('gsUserName').textContent = userName;
  document.getElementById('gsActiveChallenge').style.display = 'block';
  document.getElementById('dashLoading').style.display = 'none';
  var plan = (params.get('track') === 'luke') ? 'luke' : 'gospels';
  loadPlanContent(plan, 'emails-' + plan + '.json')
    .then(function(d) { gsContent = d || []; })
    .then(function() { gsRenderDay(); gsUpdateStats(); previewShowGroupBox('gospelsView'); });
}

function gsAdventKey() { return 'gs_advent_' + (userEmail || 'anon'); }

function gsAdventRevealed() {
  try { return JSON.parse(localStorage.getItem(gsAdventKey()) || '[]'); } catch (e) { return []; }
}

function gsAdventMarkRevealed(day) {
  var r = gsAdventRevealed();
  if (r.indexOf(day) === -1) { r.push(day); try { localStorage.setItem(gsAdventKey(), JSON.stringify(r)); } catch (e) {} }
  // Save to the server too, so doors stay scratched on a new phone
  if (userEmail && userToken) {
    fetch('/api/advent-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, token: userToken, day: day })
    }).catch(function() {});
  }
}

function gsAdventSync() {
  if (gsAdventSynced || !userEmail || !userToken) return;
  gsAdventSynced = true;
  fetch('/api/advent-reveal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d || !d.days || !d.days.length) return;
      var r = gsAdventRevealed();
      var changed = false;
      d.days.forEach(function(day) {
        if (r.indexOf(day) === -1) { r.push(day); changed = true; }
      });
      if (changed) {
        try { localStorage.setItem(gsAdventKey(), JSON.stringify(r)); } catch (e) {}
        gsRenderAdvent();
        // If the box auto-opened a door this device thought was unscratched,
        // drop the gold cover: they already scratched it elsewhere.
        if (gsAdventOpenDay && r.indexOf(gsAdventOpenDay) !== -1) {
          document.getElementById('gsScratch').style.display = 'none';
          gsScratchState = null;
        }
      }
    })
    .catch(function() {});
}

function gsRenderAdvent() {
  var grid = document.getElementById('gsAdventGrid');
  if (!grid) return;
  var revealed = gsAdventRevealed();
  var html = '';
  for (var d = 1; d <= 31; d++) {
    var cls = 'advent-door ';
    if (revealed.indexOf(d) !== -1) cls += 'revealed';
    else if (gsCheckedDays.has(d)) cls += 'ready';
    else cls += 'locked';
    if (d === gsAdventOpenDay) cls += ' viewing-door';
    html += '<div class="' + cls + '" onclick="gsOpenDoor(' + d + ')">' + d + '</div>';
  }
  grid.innerHTML = html;
}

function gsAdventAutoOpen() {
  var reveal = document.getElementById('gsReveal');
  if (!reveal || reveal.style.display === 'block') return;
  // If the view is not visible yet, the scratch canvas would size to zero.
  // Skip; this runs again the next time the day renders while visible.
  if (!reveal.parentNode.clientWidth) return;
  var revealed = gsAdventRevealed();
  for (var d = 31; d >= 1; d--) {
    if (gsCheckedDays.has(d) && revealed.indexOf(d) === -1) {
      gsOpenDoor(d, true);
      return;
    }
  }
}

function gsOpenDoor(day, quiet) {
  var revealed = gsAdventRevealed().indexOf(day) !== -1;
  var ready = gsCheckedDays.has(day);
  var reveal = document.getElementById('gsReveal');
  var dayEl = document.getElementById('gsRevealDay');
  var missionEl = document.getElementById('gsRevealMission');
  var canvas = document.getElementById('gsScratch');
  if (!reveal) return;
  if (!revealed && !ready) {
    gsAdventOpenDay = day;
    dayEl.textContent = 'December ' + day;
    missionEl.textContent = 'This door opens once you have checked off Day ' + day + '\u2019s reading. The Word first, then the mission.';
    canvas.style.display = 'none';
    reveal.style.display = 'block';
    gsRenderAdvent();
    if (!quiet) reveal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  gsAdventOpenDay = day;
  dayEl.textContent = 'December ' + day + ' \u00b7 share the good news';
  var missions = (gospelsChallenge && gospelsChallenge.track === 'luke') ? GS_MISSIONS_LUKE : GS_MISSIONS;
  missionEl.textContent = missions[day - 1] || '';
  reveal.style.display = 'block';
  gsRenderAdvent();
  if (revealed) {
    canvas.style.display = 'none';
  } else {
    gsStartScratch(day);
  }
  if (!quiet) reveal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function gsStartScratch(day) {
  var reveal = document.getElementById('gsReveal');
  var canvas = document.getElementById('gsScratch');
  canvas.style.display = 'block';
  // Size to the card
  var w = reveal.clientWidth, h = reveal.clientHeight;
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  var grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#c8a365'); grad.addColorStop(0.5, '#e3c088'); grad.addColorStop(1, '#b8905a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4a3312';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Rub to reveal today\u2019s mission', w / 2, h / 2 - 6);
  ctx.font = '400 12px Inter, sans-serif';
  ctx.fillText('(scratch with your finger)', w / 2, h / 2 + 14);
  gsScratchState = { day: day, ctx: ctx, w: w, h: h, down: false, done: false };

  if (!canvas.dataset.wired) {
    canvas.dataset.wired = '1';
    var pos = function(e) {
      var r = canvas.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    var scratch = function(e) {
      var s = gsScratchState;
      if (!s || s.done || !s.down) return;
      var p = pos(e);
      s.ctx.globalCompositeOperation = 'destination-out';
      s.ctx.beginPath();
      s.ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      s.ctx.fill();
      s.ctx.globalCompositeOperation = 'source-over';
      e.preventDefault();
    };
    var start = function(e) { if (gsScratchState) { gsScratchState.down = true; scratch(e); } };
    var end = function() {
      var s = gsScratchState;
      if (!s || s.done) return;
      s.down = false;
      // How much is scratched away?
      var img = s.ctx.getImageData(0, 0, s.w, s.h).data;
      var clear = 0, total = 0;
      for (var i = 3; i < img.length; i += 4 * 24) { total++; if (img[i] === 0) clear++; }
      if (total > 0 && clear / total > 0.4) {
        s.done = true;
        gsAdventMarkRevealed(s.day);
        canvas.style.display = 'none';
        gsRenderAdvent();
      }
    };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', scratch);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', scratch, { passive: false });
    canvas.addEventListener('touchend', end);
  }
}
