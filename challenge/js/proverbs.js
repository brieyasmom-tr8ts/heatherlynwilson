// Around the Table: the family Proverbs challenge.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares and are only called from click
// handlers or from inside other functions, never while the page parses,
// which is checked with a parser before the cut is made.

function provNormalize(c) {
  if (!c) c = {};
  var qy = Array.isArray(c.q_young) ? c.q_young : (c.prayer_focus ? String(c.prayer_focus).split('\n').filter(function(s) { return s.trim(); }) : []);
  var qt = Array.isArray(c.q_teen) ? c.q_teen : (c.prayer_verse ? String(c.prayer_verse).split('\n').filter(function(s) { return s.trim(); }) : []);
  var qs = Array.isArray(c.q_solo) ? c.q_solo : [];
  return {
    reading: c.reading || '',
    title: c.title || '',
    body: c.body || '',
    qYoung: qy,
    qTeen: qt,
    qSolo: qs,
    fam: c.family_challenge || c.focus || '',
    soloChal: c.solo_challenge || '',
    tip: c.tip || c.practice || '',
    littles: c.littles || c.verse_ref || ''
  };
}

function provComputeDay() {
  var d = computeDayFor(provStartIso);
  return d > 31 ? 31 : d;
}

function provStartCountdown() {
  function update() {
    var now = new Date();
    var target = new Date(PROV_START + 'T11:00:00Z');
    var diff = target - now;
    if (!(diff > 0)) { location.reload(); return; }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    document.getElementById('pCdDays').textContent = d;
    document.getElementById('pCdHours').textContent = h;
    document.getElementById('pCdMins').textContent = m;
  }
  update();
  setInterval(update, 30000);
}

function provLoadData() {
  if (!userEmail || !userToken) { return Promise.resolve(); }
  return fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=' + PROV_CHALLENGE)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      provEntries = {};
      (data.entries || []).forEach(function(e) { provEntries[e.day] = e; });
      provCheckedDays = new Set(data.days || []);
      provStreak = data.streak || 0;
    })
    .catch(function() { provEntries = {}; provCheckedDays = new Set(); provStreak = 0; });
}

function provRenderDay() {
  var day = provViewingDay;
  if (day < 1) return;
  var c = provNormalize(provContent[day - 1]);
  var entry = provEntries[day] || {};
  var reading = c.reading || ('Proverbs ' + day);

  document.getElementById('pDayLabel').textContent = 'DAY ' + day + ' OF 31';
  document.getElementById('pDayReading').textContent = reading;
  document.getElementById('pHeroTitle').textContent = c.title || '31 Days in Proverbs';
  document.getElementById('pPrevDay').disabled = (day <= 1);
  document.getElementById('pNextDay').disabled = (day >= provCurrentDay);

  document.getElementById('pLessonEyebrow').textContent = reading;
  document.getElementById('pLessonTitle').textContent = c.title || '';
  var body = dashboardBody(c.body || '').split('\n\n').map(function(p) { return '<p>' + linkifyText(escapeText(p)) + '</p>'; }).join('');
  document.getElementById('pLessonBody').innerHTML = body;

  document.getElementById('pReadLabel').textContent = 'Read ' + reading;
  var littlesEl = document.getElementById('pLittles');
  if (littlesEl) {
    if (c.littles) {
      littlesEl.innerHTML = 'With little ones, read just <strong>' + escapeText(c.littles) + '</strong>. Proverbs talks honestly about grown-up things; this keeps it age right. Older kids and parents read the whole chapter.';
      littlesEl.style.display = 'block';
    } else {
      littlesEl.style.display = 'none';
    }
  }
  var chap = day;
  var m = reading.match(/(\d+)/);
  if (m) chap = parseInt(m[1], 10);
  document.getElementById('pReadYV').href = 'https://www.bible.com/bible/116/PRO.' + chap + '.NLT';
  document.getElementById('pReadBG').href = 'https://www.biblegateway.com/passage/?search=Proverbs%20' + chap + '&version=NLT';

  var isYourTable = (proverbsChallenge && proverbsChallenge.track === 'your-table');
  document.getElementById('pFamilyQWrap').style.display = isYourTable ? 'none' : '';
  document.getElementById('pSoloQWrap').style.display = isYourTable ? '' : 'none';
  document.getElementById('pFamilyChallengeWrap').style.display = isYourTable ? 'none' : '';
  document.getElementById('pSoloChallengeWrap').style.display = isYourTable ? '' : 'none';
  document.getElementById('pQYoung').innerHTML = c.qYoung.map(function(q) { return '<li>' + escapeText(q) + '</li>'; }).join('');
  document.getElementById('pQTeen').innerHTML = c.qTeen.map(function(q) { return '<li>' + escapeText(q) + '</li>'; }).join('');
  document.getElementById('pQSolo').innerHTML = c.qSolo.map(function(q) { return '<li>' + escapeText(q) + '</li>'; }).join('');
  document.getElementById('pFamilyChallenge').textContent = c.fam;
  document.getElementById('pSoloChallenge').textContent = c.soloChal;
  document.getElementById('pTip').innerHTML = (!isYourTable && c.tip) ? '<strong>Real life tip:</strong> ' + escapeText(c.tip) : '';

  var noteField = document.getElementById('pNoteField');
  var noteSt = document.getElementById('pNoteStatus');
  if (noteField) {
    var entry = provEntries[day] || {};
    noteField.value = (entry.stood_out) ? String(entry.stood_out) : '';
    if (noteSt) { noteSt.textContent = ''; noteSt.className = 'save-status'; }
  }

  document.getElementById('pReadCheckbox').checked = entry.read_confirmed === 1;

  var certCard = document.getElementById('pCertCard');
  if (day >= 31) {
    certCard.style.display = 'block';
    document.getElementById('pCertLink').href = 'certificate.html?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=' + PROV_CHALLENGE;
  } else {
    certCard.style.display = 'none';
  }

  document.getElementById('pSaveStatus').textContent = '';
  provRenderGrid();
}

function provRenderGrid() {
  var grid = document.getElementById('pDayGrid');
  var html = '';
  for (var d = 1; d <= 31; d++) {
    var classes = 'day-dot';
    if (provCheckedDays.has(d)) classes += ' completed';
    if (d === provCurrentDay) classes += ' current';
    if (d > provCurrentDay) classes += ' future';
    if (d === provViewingDay) classes += ' viewing';
    html += '<div class="' + classes + '" onclick="chModalOpen(\'prov\', ' + d + ')">' + d + '</div>';
  }
  grid.innerHTML = html;
}

function provUpdateStats() {
  document.getElementById('pHeroStreak').textContent = provStreak;
  document.getElementById('pHeroTotal').textContent = provCheckedDays.size;
  document.getElementById('pHeroDay').textContent = provCurrentDay;
  document.getElementById('pSideStreak').textContent = provStreak;
  document.getElementById('pProgressFill').style.width = Math.round((provCheckedDays.size / 31) * 100) + '%';
  document.getElementById('pProgressText').textContent = provCheckedDays.size;
  renderRestart('october-proverbs-2026');
}

function provChangeDay(delta) {
  var n = provViewingDay + delta;
  if (n < 1 || n > provCurrentDay) return;
  provViewingDay = n;
  provRenderDay();
}

function provGoToDay(d) {
  if (d > provCurrentDay) return;
  provViewingDay = d;
  provRenderDay();
}

function provOnCheck() {
  var day = provViewingDay;
  if (day < 1) return;
  if (!provEntries[day]) provEntries[day] = {};
  var checked = document.getElementById('pReadCheckbox').checked;
  provEntries[day].read_confirmed = checked ? 1 : 0;

  if (checked) provCheckedDays.add(day); else provCheckedDays.delete(day);
  provRenderGrid();
  provUpdateStats();

  var st = document.getElementById('pSaveStatus');
  if (!userEmail || !userToken) { if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; } return; }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(provSaveTimer);
  provSaveTimer = setTimeout(function() { provSaveEntry(day); }, 800);
}

function provNoteChanged() {
  var day = provViewingDay;
  if (!day) return;
  var st = document.getElementById('pNoteStatus');
  if (!userEmail || !userToken) { if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; } return; }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(provSaveTimer);
  provSaveTimer = setTimeout(function() { provSaveNote(day); }, 1200);
}

function provSaveNote(day) {
  var ta = document.getElementById('pNoteField');
  var st = document.getElementById('pNoteStatus');
  if (!ta) return;
  var text = ta.value;
  if (!provEntries[day]) provEntries[day] = { day: day };
  provEntries[day].stood_out = text;
  provRenderNotes();
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, token: userToken, challenge: PROV_CHALLENGE, day: day, stood_out: text, read_confirmed: (provEntries[day].read_confirmed === 1) })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!st) return;
      if (data && data.success) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
      else { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() { if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; } });
}

function provRenderNotes() {
  var isYourTable = (proverbsChallenge && proverbsChallenge.track === 'your-table');
  var section = document.getElementById('pNotesHistory');
  var container = document.getElementById('pNotesEntries');
  var empty = document.getElementById('pNotesEmpty');
  var label = document.getElementById('pNotesHistoryLabel');
  if (!section || !container) return;
  if (label) label.textContent = isYourTable ? 'My Reflections' : 'Family Notes';
  var html = '';
  var hasAny = false;
  for (var d = Math.min(provCurrentDay, 31); d >= 1; d--) {
    var e = provEntries[d] || {};
    var text = e.stood_out ? String(e.stood_out).trim() : '';
    if (!text && !provCheckedDays.has(d)) continue;
    var dayData = provContent[d - 1] || {};
    var reading = dayData.reading || ('Proverbs ' + d);
    hasAny = true;
    html += '<div class="past-entry">' +
      '<div class="past-entry-day" style="display:flex;align-items:center;gap:10px;">' +
      '<span style="flex:1;min-width:0;">Day ' + d + ' &middot; ' + escapeText(reading) + '</span>' +
      '<button onclick="provGoToDay(' + d + ')" style="flex:none;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;font-family:Inter,sans-serif;">' + (text ? 'Edit' : 'Add') + '</button></div>';
    if (text) {
      html += '<div class="past-entry-field"><div class="past-entry-text">' + escapeText(text) + '</div></div>';
    } else {
      html += '<div class="past-entry-field"><div class="past-entry-text" style="color:var(--ink-quiet);">Read but no note written. Tap Add to write one.</div></div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
  if (empty) empty.style.display = hasAny ? 'none' : 'block';
  section.style.display = 'block';
}

function provSaveEntry(day) {
  var entry = provEntries[day] || {};
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail, token: userToken, challenge: PROV_CHALLENGE, day: day,
      stood_out: entry.stood_out || '',
      read_confirmed: entry.read_confirmed === 1
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var st = document.getElementById('pSaveStatus');
      if (data && data.success) {
        if (st) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
        provLoadData().then(function() { provUpdateStats(); maybeShowCompletionCelebration('october-proverbs-2026', 31, provCheckedDays.size); });
        if (activeGroupId) loadGroupDashboard(activeGroupId);
      } else if (st) { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() {
      var st = document.getElementById('pSaveStatus');
      if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; }
    });
}

function provRunPreview(params) {
  userName = params.get('name') || 'Heather';
  proverbsChallenge = { challenge: PROV_CHALLENGE, track: 'family', personal_start_date: PROV_START };
  userChallenges = [proverbsChallenge];
  provLoaded = true;

  if (params.get('state') === 'pre') {
    showProverbsView();
    document.getElementById('pUserName').textContent = userName;
    document.getElementById('pPreChallenge').style.display = 'block';
    document.getElementById('dashLoading').style.display = 'none';
    provStartCountdown();
    initProvPrep();
    initPreStartFix('preFixProv', provStartIso);
    previewShowGroupBox('proverbsView');
    return;
  }

  var fakeDay = parseInt(params.get('day') || '4', 10);
  if (!Number.isFinite(fakeDay) || fakeDay < 1) fakeDay = 1;
  if (fakeDay > 31) fakeDay = 31;
  provCurrentDay = fakeDay;
  provViewingDay = fakeDay;
  provCheckedDays = new Set();
  for (var d = 1; d < fakeDay; d++) provCheckedDays.add(d);
  provStreak = fakeDay - 1;

  showProverbsView();
  document.getElementById('pUserName').textContent = userName;
  document.getElementById('pActiveChallenge').style.display = 'block';
  document.getElementById('dashLoading').style.display = 'none';

  loadPlanContent('proverbs', 'emails-proverbs.json')
    .then(function(d) { provContent = d || []; })
    .then(function() {
      provRenderDay();
      provUpdateStats();
      previewShowGroupBox('proverbsView');
    });
}
