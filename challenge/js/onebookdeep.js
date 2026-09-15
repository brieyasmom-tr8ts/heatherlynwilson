// One Book Deep: the daily read, the focus and the journal.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares and are only called from click
// handlers or from inside other functions, never while the page parses,
// which is checked with a parser before the cut is made.

function jamesRunPreview(params) {
  userName = params.get('name') || 'Heather';
  jamesChallenge = { challenge: JAMES_CHALLENGE, track: 'james', personal_start_date: JAMES_START };
  userChallenges = [jamesChallenge];
  jamesLoaded = true;

  // Preview the pre-start dashboard (countdown, head start, checklist, share)
  if (params.get('state') === 'pre') {
    showJamesView();
    document.getElementById('jUserName').textContent = userName;
    document.getElementById('jPreChallenge').style.display = 'block';
    document.getElementById('dashLoading').style.display = 'none';
    jamesStartCountdown();
    initJamesPrep();
    initPreStartFix('preFixJames', jamesStartIso);
    previewShowGroupBox('jamesView');
    return;
  }

  var fakeDay = parseInt(params.get('day') || '4', 10);
  if (!Number.isFinite(fakeDay) || fakeDay < 1) fakeDay = 1;
  if (fakeDay > 31) fakeDay = 31;
  jamesCurrentDay = fakeDay;
  jamesViewingDay = fakeDay;

  // Sample entries: prior days complete, today partially filled
  var sampleStood = [
    'Consider it pure joy when you face trials. That word joy stopped me.',
    'Be quick to listen, slow to speak, slow to become angry.',
    'Faith without works is dead. It is not enough to just believe.',
    'The tongue is a small part of the body but makes great boasts.'
  ];
  var sampleGod = [
    'He is asking me to trust Him in the waiting, not just the outcome.',
    'I talk too fast and listen too little. He wants me slower.',
    'My faith should have hands and feet this week.',
    'To watch my words with my kids today.'
  ];
  var samplePrayer = [
    'Lord, give me joy in the hard place I am in right now.',
    'Father, make me quick to listen to the people in my home.',
    'God, show me one place to put my faith into action today.',
    'Jesus, guard my mouth and let my words bring life.'
  ];
  jamesEntries = {};
  jamesCheckedDays = new Set();
  for (var d = 1; d < fakeDay; d++) {
    jamesEntries[d] = {
      day: d,
      read_confirmed: 1,
      stood_out: sampleStood[(d - 1) % sampleStood.length],
      god_speaking: sampleGod[(d - 1) % sampleGod.length],
      prayer: samplePrayer[(d - 1) % samplePrayer.length],
      yesterday_reflection: d > 1 ? 'Yes, I noticed it show up during the day.' : ''
    };
    jamesCheckedDays.add(d);
  }
  // Today: started but not finished
  jamesEntries[fakeDay] = {
    day: fakeDay,
    read_confirmed: 1,
    stood_out: sampleStood[(fakeDay - 1) % sampleStood.length],
    god_speaking: '',
    prayer: '',
    yesterday_reflection: ''
  };
  jamesCheckedDays.add(fakeDay);
  jamesStreak = fakeDay;

  showJamesView();
  document.getElementById('jUserName').textContent = userName;
  document.getElementById('jActiveChallenge').style.display = 'block';
  document.getElementById('dashLoading').style.display = 'none';

  // Show mock group in preview
  if (params.get('group') !== '0') {
    var mockGroup = {
      group: { id: 'demo1234', name: 'My friends', challenge: 'august-james-2026' },
      members: [
        { name: userName, initials: userName.slice(0,1).toUpperCase() + 'W', is_you: true, checked_today: true, current_day: fakeDay, days_completed: fakeDay, total_days: 31, streak: fakeDay },
        { name: 'Sarah', initials: 'SM', is_you: false, checked_today: true, current_day: fakeDay, days_completed: fakeDay, total_days: 31, streak: fakeDay },
        { name: 'Marcus', initials: 'MR', is_you: false, checked_today: true, current_day: fakeDay, days_completed: fakeDay - 2, total_days: 31, streak: 3 },
        { name: 'Jen', initials: 'JK', is_you: false, checked_today: false, current_day: fakeDay, days_completed: fakeDay - 3, total_days: 31, streak: 0 },
        { name: 'Dave', initials: 'DL', is_you: false, checked_today: false, current_day: fakeDay, days_completed: fakeDay - 5, total_days: 31, streak: 0 }
      ],
      group_streak: Math.max(0, fakeDay - 4),
      messages: [
        { name: 'Sarah', message: 'James 3 hit me hard today. The tongue is a fire.', created_at: '2026-08-' + String(Math.max(1, fakeDay - 1)).padStart(2,'0') + 'T12:00:00' },
        { name: 'Marcus', message: 'Praying for all of us today!', created_at: '2026-08-' + String(Math.max(1, fakeDay - 1)).padStart(2,'0') + 'T14:30:00' },
        { name: userName, message: 'Day ' + (fakeDay - 1) + ' done. Showing up matters.', created_at: '2026-08-' + String(Math.max(1, fakeDay - 1)).padStart(2,'0') + 'T19:00:00' }
      ]
    };
    activeGroupData = mockGroup;
    activeGroupId = 'demo1234';
    userGroups = [{ id: 'demo1234', name: 'My friends' }];
    renderGroupDashboard(mockGroup);
    // Hide big group stats (sidebar handles it), show wall/invite below
    var gs = document.getElementById('groupSection');
    var grpToday = document.getElementById('grpToday');
    var grpStats = document.getElementById('grpStats');
    var grpMembersList = document.getElementById('grpMembers-list');
    var grpHeader = gs.querySelector('.grp-header');
    if (grpToday) grpToday.style.display = 'none';
    if (grpStats) grpStats.style.display = 'none';
    if (grpMembersList) grpMembersList.style.display = 'none';
    if (grpHeader) grpHeader.style.display = 'none';
    gs.style.display = 'block';
    var jView = document.getElementById('jamesView');
    if (jView) {
      var dashBody = jView.querySelector('.dash-body');
      if (dashBody) dashBody.appendChild(gs);
    }
    // Hide the no-group section
    var noGrp = document.getElementById('noGroupSection');
    if (noGrp) noGrp.style.display = 'none';
  }

  // Same source as the real dashboard: the emails edited in the admin tool,
  // falling back to the packaged JSON only when that table is empty. Preview
  // used to read the JSON directly, so edits never showed up here.
  fetch('/api/plan-emails?plan=james')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.emails && data.emails.length) return data.emails;
      return fetch('emails-james-prayer.json').then(function(r) { return r.json(); });
    })
    .catch(function() {
      return fetch('emails-james-prayer.json').then(function(r) { return r.json(); }).catch(function() { return []; });
    })
    .then(function(data) {
      jamesEmails = data || [];
      jamesRenderDay();
      jamesUpdateStats();
    });
}

function jamesStartCountdown() {
  function update() {
    var now = new Date();
    var target = new Date((jamesStartIso || JAMES_START) + 'T11:00:00Z');
    var diff = target - now;
    if (diff <= 0) { location.reload(); return; }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    document.getElementById('jCdDays').textContent = d;
    document.getElementById('jCdHours').textContent = h;
    document.getElementById('jCdMins').textContent = m;
  }
  update();
  setInterval(update, 30000);
}

function jamesLoadJournalData() {
  return fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=' + JAMES_CHALLENGE)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      jamesEntries = {};
      (data.entries || []).forEach(function(e) { jamesEntries[e.day] = e; });
      jamesCheckedDays = new Set(data.days || []);
      jamesStreak = data.streak || 0;
    })
    .catch(function() {
      jamesEntries = {};
      jamesCheckedDays = new Set();
      jamesStreak = 0;
    });
}

function jamesRenderDay() {
  var day = jamesViewingDay;
  if (day < 1) return;
  var email = jamesEmails[day - 1] || {};
  var entry = jamesEntries[day] || {};
  var isFuture = (day > jamesCurrentDay);

  document.getElementById('jDayLabel').textContent = 'DAY ' + day + ' OF 31';
  document.getElementById('jDayPrayer').textContent = email.prayer_focus || '';
  document.getElementById('jPrevDay').disabled = (day <= 1);
  document.getElementById('jNextDay').disabled = (day >= jamesCurrentDay);

  obdApplyBookWords();
  document.getElementById('jFocusText').textContent = email.prayer_focus ? "Today's focus: " + email.prayer_focus : '';
  document.getElementById('jFocusVerse').textContent = email.prayer_verse || '';

  document.getElementById('jPrayerHint').textContent = email.prayer_focus
    ? "Today's focus: " + email.prayer_focus + ' (' + (email.prayer_verse || '') + ')'
    : '';

  if (day > 1) {
    document.getElementById('jYesterdayStep').style.display = 'block';
    var prevEmail = jamesEmails[day - 2] || {};
    document.getElementById('jYesterdayHint').textContent = obdBook().yesterdayLead + (prevEmail.prayer_focus || '...').toLowerCase() + '. Did anything show up?';
  } else {
    document.getElementById('jYesterdayStep').style.display = 'none';
  }

  document.getElementById('jReadCheckbox').checked = entry.read_confirmed === 1;
  document.getElementById('jStoodOut').value = entry.stood_out || '';
  document.getElementById('jGodSpeaking').value = entry.god_speaking || '';
  document.getElementById('jPrayerField').value = entry.prayer || '';
  document.getElementById('jYesterdayReflection').value = entry.yesterday_reflection || '';

  document.querySelectorAll('#jamesView .journal-textarea').forEach(function(f) { f.disabled = isFuture; });
  document.getElementById('jReadCheckbox').disabled = isFuture;
  document.getElementById('jReadCheckLabel').style.opacity = isFuture ? '0.5' : '1';

  jamesUpdateStepNumbers(entry);
  jamesRenderEmailPreview(email);
  jamesRenderDayGrid();
  document.getElementById('jSaveStatus').textContent = '';
}

function jamesUpdateStepNumbers(entry) {
  var steps = [
    { id: 'jStepRead', done: entry.read_confirmed === 1 },
    { id: 'jStepStood', done: !!(entry.stood_out || '').trim() },
    { id: 'jStepGod', done: !!(entry.god_speaking || '').trim() },
    { id: 'jStepPrayer', done: !!(entry.prayer || '').trim() },
    { id: 'jStepYesterday', done: !!(entry.yesterday_reflection || '').trim() }
  ];
  steps.forEach(function(s) {
    var el = document.getElementById(s.id);
    if (el) el.className = 'step-number' + (s.done ? ' done' : '');
  });
}

function jamesRenderDayGrid() {
  var grid = document.getElementById('jDayGrid');
  var html = '';
  for (var d = 1; d <= 31; d++) {
    var classes = 'day-dot';
    if (jamesCheckedDays.has(d)) classes += ' completed';
    if (d === jamesCurrentDay) classes += ' current';
    if (d > jamesCurrentDay) classes += ' future';
    if (d === jamesViewingDay) classes += ' viewing';
    html += '<div class="' + classes + '" onclick="jamesGoToDay(' + d + ')">' + d + '</div>';
  }
  grid.innerHTML = html;
}

function jamesRenderEmailPreview(email) {
  var container = document.getElementById('jEmailBody');
  var body = dashboardBody(email.body || '');
  var paragraphs = body.split('\n\n').map(function(p) {
    if (p === 'Heather' || p.indexOf('With love,') === 0) {
      return '<p class="sig">' + p.replace('\n', '<br>') + '</p>';
    }
    return '<p>' + linkifyText(p) + '</p>';
  }).join('');
  container.innerHTML = paragraphs;

  var allP = container.querySelectorAll('p');
  var toggle = document.getElementById('jEmailToggle');
  if (allP.length > 3) {
    for (var i = 3; i < allP.length; i++) allP[i].style.display = 'none';
    toggle.style.display = 'inline';
    toggle.textContent = 'Read more';
    toggle.dataset.expanded = '0';
  } else {
    toggle.style.display = 'none';
  }
}

function jamesToggleEmail() {
  var container = document.getElementById('jEmailBody');
  var toggle = document.getElementById('jEmailToggle');
  var allP = container.querySelectorAll('p');
  var expanded = toggle.dataset.expanded === '1';
  for (var i = 3; i < allP.length; i++) {
    allP[i].style.display = expanded ? 'none' : 'block';
  }
  toggle.textContent = expanded ? 'Read more' : 'Show less';
  toggle.dataset.expanded = expanded ? '0' : '1';
}

function jamesUpdateStats() {
  document.getElementById('jHeroStreak').textContent = jamesStreak;
  document.getElementById('jHeroTotal').textContent = jamesCheckedDays.size;
  document.getElementById('jHeroDay').textContent = jamesCurrentDay;
  document.getElementById('jSideStreak').textContent = jamesStreak;
  document.getElementById('jProgressFill').style.width = Math.round((jamesCheckedDays.size / 31) * 100) + '%';
  document.getElementById('jProgressText').textContent = jamesCheckedDays.size;
  // Solo readers get a personal share link once they have read at least
  // once. Group members get theirs from renderGroupDashboard instead.
  var hs = document.getElementById('jHeroShareLink');
  if (hs && !window.activeGroupData) {
    hs.textContent = 'Share my progress';
    hs.style.display = jamesCheckedDays.size >= 1 ? 'inline' : 'none';
  }
  jamesUpdateHeroDone();
  renderRestart('august-james-2026');

  // Certificate, once all thirty-one days are marked off.
  var jc = document.getElementById('jCertCard');
  if (jc && jamesCheckedDays.size >= 31) {
    jc.style.display = 'block';
    document.getElementById('jCertLink').href = 'certificate.html?email=' + encodeURIComponent(userEmail) +
      '&token=' + encodeURIComponent(userToken) + '&challenge=august-james-2026';
  }

  // Catch-up nudge for the notebook readers: several unchecked past days
  // usually means someone is reading faithfully and just never knew the
  // dashboard needed a tap. One or two misses stays quiet.
  var cn = document.getElementById('jCatchupNote');
  if (cn) {
    var missed = 0;
    for (var d = 1; d < jamesCurrentDay; d++) { if (!jamesCheckedDays.has(d)) missed++; }
    if (missed >= 3) {
      document.getElementById('jCatchupText').textContent = 'No problem, nothing is lost. ' +
        missed + ' past days are unchecked. Tap each day you already read and your streak will catch up to real life.';
      cn.style.display = 'flex';
    } else {
      cn.style.display = 'none';
    }
  }
}

function jamesCatchupOpen() {
  var btns = document.querySelectorAll('#jamesView .journal-tab-btn');
  jamesShowJournalTab('journal', btns[1] || null);
  var p = document.getElementById('jTabJournal');
  if (p) setTimeout(function() { p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
}

function jamesChangeDay(delta) {
  var newDay = jamesViewingDay + delta;
  if (newDay < 1 || newDay > jamesCurrentDay) return;
  jamesViewingDay = newDay;
  var jc = document.getElementById('jJournalCard');
  if (jc) jc.classList.remove('collapsed');
  jamesRenderDay();
  refreshGroupSideForDay();
}

function jamesGoToDay(d) {
  if (d > jamesCurrentDay) return;
  jamesViewingDay = d;
  var jc = document.getElementById('jJournalCard');
  if (jc) jc.classList.remove('collapsed');
  jamesRenderDay();
  refreshGroupSideForDay();
}

function jamesOnFieldChange() {
  var day = jamesViewingDay;
  if (day < 1) return;
  if (!jamesEntries[day]) jamesEntries[day] = {};
  jamesEntries[day].read_confirmed = document.getElementById('jReadCheckbox').checked ? 1 : 0;
  jamesEntries[day].stood_out = document.getElementById('jStoodOut').value;
  jamesEntries[day].god_speaking = document.getElementById('jGodSpeaking').value;
  jamesEntries[day].prayer = document.getElementById('jPrayerField').value;
  jamesEntries[day].yesterday_reflection = document.getElementById('jYesterdayReflection').value;

  jamesUpdateStepNumbers(jamesEntries[day]);

  if (jamesEntries[day].read_confirmed) {
    jamesCheckedDays.add(day);
  } else {
    jamesCheckedDays.delete(day);
  }
  jamesRenderDayGrid();
  jamesUpdateHeroDone();

  var st = document.getElementById('jSaveStatus');
  st.textContent = 'Saving...';
  st.className = 'save-status saving';
  clearTimeout(jamesSaveTimer);
  jamesSaveTimer = setTimeout(function() { jamesSaveEntry(day); }, 1200);
}

function jamesToggleJournalCard() {
  var c = document.getElementById('jJournalCard');
  if (c) c.classList.toggle('collapsed');
}

function jamesHeroCheckOff() {
  var btns = document.querySelectorAll('#jamesView .journal-tab-btn');
  jamesShowJournalTab('today', btns[0] || null);
  if (jamesViewingDay !== jamesCurrentDay) {
    jamesViewingDay = jamesCurrentDay;
    jamesRenderDay();
    refreshGroupSideForDay();
  }
  var cb = document.getElementById('jReadCheckbox');
  if (cb && !cb.checked) {
    cb.checked = true;
    jamesOnFieldChange();
  }
  jamesUpdateHeroDone();
  var card = document.getElementById('jJournalCard');
  if (card) {
    card.classList.remove('collapsed');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var f = card.querySelector('textarea');
    if (f) setTimeout(function() { try { f.focus({ preventScroll: true }); } catch (e) {} }, 500);
  }
}

function jamesUpdateHeroDone() {
  var btn = document.getElementById('jHeroDoneBtn');
  var note = document.getElementById('jHeroDoneNote');
  if (!btn || !note) return;
  var done = jamesCheckedDays.has(jamesCurrentDay);
  btn.style.display = done ? 'none' : 'inline-flex';
  note.style.display = done ? 'block' : 'none';
  if (done) note.innerHTML = '&#10003; Day ' + jamesCurrentDay + ' is checked off. Well done.';
}

function jamesSaveNow() {
  // The Save button: capture the fields and save right away, skipping the
  // usual short auto-save delay. On success the journal folds closed.
  var day = jamesViewingDay;
  if (day < 1) return;
  jamesOnFieldChange();
  clearTimeout(jamesSaveTimer);
  var st = document.getElementById('jSaveStatus');
  st.textContent = 'Saving...';
  st.className = 'save-status saving';
  jamesSaveEntry(day, true);
}

function jamesSaveEntry(day, minimizeAfter) {
  var entry = jamesEntries[day] || {};
  // Preview mode has no login; skip the save and show a friendly note.
  if (!userEmail || !userToken) {
    var st0 = document.getElementById('jSaveStatus');
    if (st0) { st0.textContent = 'Preview only. Nothing is saved.'; st0.className = 'save-status'; }
    return;
  }
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      token: userToken,
      challenge: JAMES_CHALLENGE,
      day: day,
      stood_out: entry.stood_out || '',
      god_speaking: entry.god_speaking || '',
      prayer: entry.prayer || '',
      yesterday_reflection: entry.yesterday_reflection || '',
      read_confirmed: entry.read_confirmed === 1
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var st = document.getElementById('jSaveStatus');
      if (data && data.success) {
        st.textContent = 'Saved';
        st.className = 'save-status saved';
        if (minimizeAfter) {
          var jc = document.getElementById('jJournalCard');
          if (jc) jc.classList.add('collapsed');
          // Show them what they just wrote instead of leaving the view
          // parked on the group cards below the folded journal
          var tabBtns = document.querySelectorAll('#jamesView .journal-tab-btn');
          jamesShowJournalTab('journal', tabBtns[1] || null);
          var nav = document.querySelector('#jamesView .journal-tab-nav');
          if (nav) nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        jamesLoadJournalData().then(function() { jamesUpdateStats(); maybeShowCompletionCelebration('august-james-2026', 31, jamesCheckedDays.size); });
        if (activeGroupId) loadGroupDashboard(activeGroupId);
      } else {
        st.textContent = 'Could not save. Try again.';
        st.className = 'save-status';
      }
    })
    .catch(function() {
      var st = document.getElementById('jSaveStatus');
      st.textContent = 'Could not save. Check your connection.';
      st.className = 'save-status';
    });
}

function jamesEditFromJournal(d) {
  var btns = document.querySelectorAll('#jamesView .journal-tab-btn');
  jamesShowJournalTab('today', btns[0] || null);
  jamesGoToDay(d);
  setTimeout(function() {
    var card = document.getElementById('jJournalCard');
    if (!card) return;
    card.classList.remove('collapsed');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var f = card.querySelector('textarea, input[type="text"]');
    if (f) setTimeout(function() { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 450);
  }, 60);
}

function jamesShowJournalTab(tab, btn) {
  document.querySelectorAll('#jamesView .journal-tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('#jamesView .journal-tab-panel').forEach(function(p) { p.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById(tab === 'journal' ? 'jTabJournal' : 'jTabToday').classList.add('active');
  if (tab === 'journal') jamesRenderJournalHistory();
}

function jamesDownloadJournal() {
  // Only days with something written make the printed journal. Days that
  // were read but left blank would just print as filler.
  var days = [];
  for (var d = 1; d <= 31; d++) {
    var e = jamesEntries[d];
    if (!e) continue;
    if (!e.stood_out && !e.god_speaking && !e.prayer && !e.yesterday_reflection) continue;
    days.push(d);
  }
  if (!days.length) {
    alert('Your journal has no written entries yet. Write something on any day and it will appear here.');
    return;
  }

  var start = new Date((jamesStartIso || JAMES_START) + 'T00:00:00');
  var end = new Date(start);
  end.setDate(end.getDate() + 30);
  var range = formatStartDate((jamesStartIso || JAMES_START)) + ' to ' + formatStartDate(end.toISOString().slice(0, 10));
  var today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  var css =
    '@page{margin:18mm 16mm;}' +
    '*{margin:0;padding:0;box-sizing:border-box;}' +
    'body{font-family:Lora,Georgia,serif;color:#1f2937;max-width:620px;margin:0 auto;padding:0 24px;}' +
    '.cover{text-align:center;padding:2.4in 0 0.5in;break-after:page;page-break-after:always;}' +
    '.cover .rule{width:64px;height:2px;background:#c8a365;margin:0 auto;}' +
    '.cover .eyebrow{font-family:Inter,-apple-system,sans-serif;font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#b85638;margin:26px 0 14px;}' +
    '.cover h1{font-size:42px;font-weight:600;line-height:1.15;margin-bottom:26px;}' +
    '.cover .name{font-size:24px;color:#b85638;font-style:italic;margin-bottom:10px;}' +
    '.cover .range{font-family:Inter,-apple-system,sans-serif;font-size:13px;color:#6b7280;margin-bottom:34px;}' +
    '.cover .verse{font-style:italic;font-size:17px;color:#4b5563;max-width:400px;margin:0 auto;line-height:1.7;}' +
    '.cover .vref{font-family:Inter,-apple-system,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8a365;margin-top:12px;}' +
    '.intro{font-size:15px;color:#4b5563;line-height:1.8;margin:0 0 40px;text-align:center;font-style:italic;}' +
    '.day{margin-bottom:38px;}' +
    '.day-start{break-inside:avoid;page-break-inside:avoid;}' +
    '.day-start .fld{break-inside:auto;page-break-inside:auto;}' +
    '.day-head{display:flex;align-items:baseline;gap:12px;border-bottom:2px solid #c8a365;padding-bottom:8px;margin-bottom:16px;page-break-after:avoid;}' +
    '.day-num{font-size:22px;font-weight:600;color:#1f2937;white-space:nowrap;}' +
    '.day-focus{font-family:Inter,-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b85638;}' +
    '.fld{margin-bottom:16px;page-break-inside:avoid;}' +
    '.fld .lbl{font-family:Inter,-apple-system,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;}' +
    '.fld .txt{font-size:15px;line-height:1.75;white-space:pre-wrap;}' +
    '.fld .txt.prayer{font-style:italic;color:#374151;border-left:2px solid #e5e0d5;padding-left:14px;}' +
    '.fld .txt.quiet{color:#9ca3af;font-style:italic;}' +
    '.closing{text-align:center;break-before:page;page-break-before:always;padding-top:2in;}' +
    '.closing .rule{width:64px;height:2px;background:#c8a365;margin:0 auto 26px;}' +
    '.closing h2{font-size:26px;font-weight:600;margin-bottom:16px;}' +
    '.closing p{font-size:15px;color:#4b5563;line-height:1.8;max-width:420px;margin:0 auto 12px;}' +
    '.closing .verse{font-style:italic;color:#374151;margin-top:14px;}' +
    '.closing .site{font-family:Inter,-apple-system,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8a365;margin-top:34px;}' +
    '.closing .dl{font-family:Inter,-apple-system,sans-serif;font-size:11px;color:#9ca3af;margin-top:8px;}';

  var title = 'James Journal - ' + (userName || 'One Book Deep');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeText(title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;700&display=swap" rel="stylesheet">' +
    '<style>' + css + '</style></head><body>';

  // Cover page
  html += '<div class="cover">' +
    '<div class="rule"></div>' +
    '<div class="eyebrow">One Book Deep</div>' +
    '<h1>31 Days<br>in James</h1>' +
    '<div class="name">' + escapeText(userName || 'My Journal') + '</div>' +
    '<div class="range">' + escapeText(range) + ' &middot; ' + days.length + (days.length === 1 ? ' day' : ' days') + ' journaled</div>' +
    '<div class="verse">&ldquo;But do not just listen to God&rsquo;s word. You must do what it says.&rdquo;</div>' +
    '<div class="vref">James 1:22</div>' +
    '</div>';

  html += '<p class="intro">One month. One book, read every day. These are the words God spoke and the prayers prayed along the way.</p>';

  days.forEach(function(d) {
    var e = jamesEntries[d];
    var em = jamesEmails[d - 1] || {};
    var flds = [];
    if (e.stood_out) flds.push('<div class="fld"><div class="lbl">What stood out</div><div class="txt">' + escapeText(e.stood_out) + '</div></div>');
    if (e.god_speaking) flds.push('<div class="fld"><div class="lbl">What God is saying</div><div class="txt">' + escapeText(e.god_speaking) + '</div></div>');
    if (e.prayer) flds.push('<div class="fld"><div class="lbl">My prayer</div><div class="txt prayer">' + escapeText(e.prayer) + '</div></div>');
    if (e.yesterday_reflection) flds.push('<div class="fld"><div class="lbl">How yesterday\'s prayer showed up</div><div class="txt">' + escapeText(e.yesterday_reflection) + '</div></div>');
    var head = '<div class="day-head"><span class="day-num">Day ' + d + '</span>' + (em.prayer_focus ? '<span class="day-focus">' + escapeText(em.prayer_focus) + '</span>' : '') + '</div>';
    // The title travels with the first field so it can never sit alone at
    // the bottom of a page; the rest of the entry flows naturally.
    html += '<div class="day">' +
      '<div class="day-start">' + head + (flds[0] || '') + '</div>' +
      flds.slice(1).join('') +
      '</div>';
  });

  // Closing page
  html += '<div class="closing">' +
    '<div class="rule"></div>' +
    '<h2>You went one book deep.</h2>' +
    '<p>A month from now you may not remember every entry in these pages. But the Word you carried every day does not return empty. Keep this. Read it again in a year and see what God was building.</p>' +
    '<p class="verse">&ldquo;Come close to God, and God will come close to you.&rdquo; James 4:8</p>' +
    '<div class="site">HeatherLynWilson.com</div>' +
    '<div class="dl">Downloaded ' + escapeText(formatStartDate(today)) + '</div>' +
    '</div>';

  html += '</body></html>';

  var w = window.open('', '_blank');
  if (!w) {
    alert('Your browser blocked the journal window. Allow popups for this site and try again.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Wait for the fonts so the printed copy matches the site, then print.
  var printed = false;
  function go() { if (printed) return; printed = true; try { w.print(); } catch (e) {} }
  try { w.document.fonts.ready.then(function() { setTimeout(go, 150); }); } catch (e) {}
  setTimeout(go, 1500);
}

function jamesRenderJournalHistory() {
  var container = document.getElementById('jJournalEntries');
  var empty = document.getElementById('jJournalEmpty');
  var html = '';
  var hasEntries = false;

  for (var d = jamesCurrentDay; d >= 1; d--) {
    var e = jamesEntries[d];
    var wasRead = !!(e && (e.stood_out || e.god_speaking || e.prayer || e.yesterday_reflection || e.read_confirmed)) || jamesCheckedDays.has(d);
    if (!wasRead) {
      // A gap in the journey. Today is not a gap yet, it is still going.
      if (d === jamesCurrentDay) continue;
      hasEntries = true;
      html += '<div class="past-entry" style="background:transparent;border:1px dashed var(--border);box-shadow:none;">' +
        '<div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-quiet);">' +
        '<span style="flex:1;min-width:0;">Day ' + d + ' &middot; not checked off. Already read it? Mark it so it counts.</span>' +
        '<button onclick="jamesEditFromJournal(' + d + ')" style="flex:none;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;font-family:Inter,sans-serif;">Check it off</button>' +
        '</div></div>';
      continue;
    }
    hasEntries = true;
    var email = jamesEmails[d - 1] || {};

    if (!e) e = {}; // checked off from the calendar, no journal record yet
    var hasText = !!(e.stood_out || e.god_speaking || e.prayer || e.yesterday_reflection);
    html += '<div class="past-entry">';
    html += '<div class="past-entry-day" style="display:flex;align-items:center;gap:10px;">' +
      '<span style="flex:1;min-width:0;">Day ' + d + ' &middot; ' + escapeText(email.prayer_focus || '') + '</span>' +
      '<button onclick="jamesEditFromJournal(' + d + ')" style="flex:none;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;font-family:Inter,sans-serif;">' + (hasText ? 'Edit' : 'Add') + '</button></div>';
    if (e.stood_out) html += '<div class="past-entry-field"><div class="past-entry-label">What stood out</div><div class="past-entry-text">' + escapeText(e.stood_out) + '</div></div>';
    if (e.god_speaking) html += '<div class="past-entry-field"><div class="past-entry-label">What God is saying</div><div class="past-entry-text">' + escapeText(e.god_speaking) + '</div></div>';
    if (e.prayer) html += '<div class="past-entry-field"><div class="past-entry-label">Prayer</div><div class="past-entry-text prayer-text">' + escapeText(e.prayer) + '</div></div>';
    if (e.yesterday_reflection) html += '<div class="past-entry-field"><div class="past-entry-label">Yesterday\'s prayer reflection</div><div class="past-entry-text">' + escapeText(e.yesterday_reflection) + '</div></div>';
    if (!hasText) html += '<div class="past-entry-field"><div class="past-entry-text" style="color:var(--ink-quiet);">You read this day but did not write anything. Tap Add to journal it.</div></div>';
    html += '</div>';
  }

  container.innerHTML = html;
  empty.style.display = hasEntries ? 'none' : 'block';
}
