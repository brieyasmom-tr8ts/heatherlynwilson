// The 31-day Bible reading challenge: plan switching and the journal.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares (userEmail, userToken,
// julyJournalEntries and friends) and are only ever called from click
// handlers or from inside other functions, never while the page parses.
// That is what makes loading them from a separate file safe. Checked
// with a real parser, not by counting braces: an earlier attempt that
// counted braces cut inside a string and broke the page.

function julySwitchPlan(btn) {
  var sel = document.getElementById('preSwitchPlanJuly');
  var msg = document.getElementById('preSwitchPlanJulyMsg');
  if (!sel || !sel.value) return;
  if (!userEmail || !userToken) { if (msg) msg.textContent = 'Preview only. Nothing is saved.'; return; }
  btn.disabled = true;
  btn.textContent = 'Saving...';
  if (msg) msg.textContent = '';
  fetch('/api/challenge-switchplan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, token: userToken, track: sel.value })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.success) {
        if (msg) msg.textContent = 'Saved. You are on ' + trackLabelFor(d.track) + '.';
        setTimeout(function() { location.reload(); }, 700);
      } else {
        if (msg) msg.textContent = (d && d.error) || 'Could not save. Try again.';
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    })
    .catch(function() {
      if (msg) msg.textContent = 'Could not save. Check your connection.';
      btn.disabled = false;
      btn.textContent = 'Save';
    });
}

function julyLoadJournal() {
  if (!userEmail || !userToken) { julyJournalLoaded = true; return Promise.resolve(); }
  return fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=july-2026')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      julyJournalEntries = {};
      (data.entries || []).forEach(function(e) { julyJournalEntries[e.day] = e; });
      julyRenderJournalHistory();
      julyJournalLoaded = true;
    })
    .catch(function() { julyJournalLoaded = true; });
}

function julyFillJournalField(day) {
  var ta = document.getElementById('dmJournal');
  var st = document.getElementById('dmJournalStatus');
  if (!ta) return;
  var e = julyJournalEntries[day];
  ta.value = (e && e.stood_out) || '';
  if (st) { st.textContent = ''; st.className = 'save-status'; }
}

function julyJournalChanged() {
  var day = currentModalDay;
  if (!day) return;
  var st = document.getElementById('dmJournalStatus');
  if (!userEmail || !userToken) {
    if (st) { st.textContent = 'Preview only. Nothing is saved.'; }
    return;
  }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(julyJournalTimer);
  julyJournalTimer = setTimeout(function() { julySaveJournal(day); }, 1200);
}

function julySaveJournal(day) {
  var ta = document.getElementById('dmJournal');
  if (!ta) return;
  var text = ta.value;
  if (!julyJournalEntries[day]) julyJournalEntries[day] = { day: day };
  julyJournalEntries[day].stood_out = text;
  julyRenderJournalHistory();
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      token: userToken,
      challenge: 'july-2026',
      day: day,
      stood_out: text,
      god_speaking: '',
      prayer: '',
      yesterday_reflection: '',
      read_confirmed: false
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var st = document.getElementById('dmJournalStatus');
      if (!st) return;
      if (data && data.success) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
      else { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() {
      var st = document.getElementById('dmJournalStatus');
      if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; }
    });
}

function julyRenderJournalHistory() {
  var container = document.getElementById('julyJournalEntries');
  var empty = document.getElementById('julyJournalEmpty');
  if (!container || !empty) return;
  var plan = READING_PLANS[userTrack] || [];
  var total = julyTotalDays || plan.length || 31;
  var upTo = Math.min(currentDay || 0, total);
  var html = '';
  var hasEntries = false;

  for (var d = upTo; d >= 1; d--) {
    var e = julyJournalEntries[d];
    var text = (e && e.stood_out) ? String(e.stood_out).trim() : '';
    var wasRead = checkedDays.has(d);
    if (!text && !wasRead) continue;
    hasEntries = true;
    var reading = (plan[d - 1] || {}).reading || '';
    html += '<div class="past-entry">' +
      '<div class="past-entry-day" style="display:flex;align-items:center;gap:10px;">' +
      '<span style="flex:1;min-width:0;">Day ' + d + (reading ? ' &middot; ' + escapeText(reading) : '') + '</span>' +
      '<button onclick="openDayModal(' + d + ')" style="flex:none;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;font-family:Inter,sans-serif;">' + (text ? 'Edit' : 'Add') + '</button></div>';
    if (text) {
      html += '<div class="past-entry-field"><div class="past-entry-text">' + escapeText(text) + '</div></div>';
    } else {
      html += '<div class="past-entry-field"><div class="past-entry-text" style="color:var(--ink-quiet);">You read this day but did not write anything. Tap Add to journal it.</div></div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
  empty.style.display = hasEntries ? 'none' : 'block';
}

function julyDownloadJournal() {
  var ready = julyJournalLoaded ? Promise.resolve() : julyLoadJournal();
  ready.then(function() {
    var plan = READING_PLANS[userTrack] || [];
    var days = [];
    for (var d = 1; d <= (julyTotalDays || 31); d++) {
      var e = julyJournalEntries[d];
      if (e && e.stood_out && e.stood_out.trim()) days.push(d);
    }
    if (!days.length) {
      alert('Your journal is empty so far. Tap a day on your checklist and jot the big idea from that reading. Entries collect here.');
      return;
    }
    var css =
      '@page{margin:18mm 16mm;}*{margin:0;padding:0;box-sizing:border-box;}' +
      'body{font-family:Lora,Georgia,serif;color:#1f2937;max-width:620px;margin:0 auto;padding:0 24px;}' +
      '.cover{text-align:center;padding:2.4in 0 0.5in;break-after:page;page-break-after:always;}' +
      '.cover .rule{width:64px;height:2px;background:#c8a365;margin:0 auto;}' +
      '.cover .eyebrow{font-family:Inter,-apple-system,sans-serif;font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#b85638;margin:26px 0 14px;}' +
      '.cover h1{font-size:42px;font-weight:600;line-height:1.15;margin-bottom:26px;}' +
      '.cover .name{font-size:24px;color:#b85638;font-style:italic;margin-bottom:10px;}' +
      '.day{margin-bottom:30px;}' +
      '.day-start{break-inside:avoid;page-break-inside:avoid;}' +
      '.day-head{display:flex;align-items:baseline;gap:12px;border-bottom:2px solid #c8a365;padding-bottom:8px;margin-bottom:12px;page-break-after:avoid;}' +
      '.day-num{font-size:20px;font-weight:600;white-space:nowrap;}' +
      '.day-reading{font-family:Inter,-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b85638;}' +
      '.txt{font-size:15px;line-height:1.75;white-space:pre-wrap;}' +
      '.closing{text-align:center;break-before:page;page-break-before:always;padding-top:2in;}' +
      '.closing .rule{width:64px;height:2px;background:#c8a365;margin:0 auto 26px;}' +
      '.closing h2{font-size:26px;font-weight:600;margin-bottom:16px;}' +
      '.closing p{font-size:15px;color:#4b5563;line-height:1.8;max-width:420px;margin:0 auto 12px;}' +
      '.closing .site{font-family:Inter,-apple-system,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8a365;margin-top:34px;}';
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>My Bible Reading Journal</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;700&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style></head><body>' +
      '<div class="cover"><div class="rule"></div><div class="eyebrow">Bible Reading Challenge</div>' +
      '<h1>My Reading Journey</h1>' +
      (userName ? '<div class="name">' + escapeText(userName) + '</div>' : '') +
      '</div>';
    days.forEach(function(d) {
      var entry = plan[d - 1] || {};
      html += '<div class="day"><div class="day-start"><div class="day-head"><span class="day-num">Day ' + d + '</span>' +
        (entry.reading ? '<span class="day-reading">' + escapeText(entry.reading) + '</span>' : '') +
        '</div><div class="txt">' + escapeText(julyJournalEntries[d].stood_out) + '</div></div></div>';
    });
    html += '<div class="closing"><div class="rule"></div><h2>Look what God showed you.</h2>' +
      '<p>Every line in this journal is a moment the Word met your real life. Keep it. Read it again in a year. The Bible is amazing that way: each time you read, God can show you new things about Himself and about you.</p>' +
      '<div class="site">HeatherLynWilson.com</div></div>';
    html += '</body></html>';
    var w = window.open('', '_blank');
    if (!w) { alert('Your browser blocked the journal window. Allow popups for this site and try again.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function() { try { w.print(); } catch (e) {} }, 900);
  });
}
