// Beginnings: Genesis in a month.
//
// Only declares functions. These files load before the main dashboard script,
// so anything that runs at load time fails check_site. State lives in
// dashboard.html with the rest of the view state.

function bgComputeDay() {
  var d = computeDayFor(bgStartIso, BG_TOTAL);
  return d > BG_TOTAL ? BG_TOTAL : d;
}

function bgStartCountdown() {
  var titleEl = document.getElementById('bgStartsOn');
  if (titleEl && bgStartIso) titleEl.textContent = 'Your challenge starts ' + formatStartDate(bgStartIso);
  function update() {
    var now = new Date();
    // The reader's own start date, never the January launch date.
    var target = new Date((bgStartIso || BG_START) + 'T11:00:00Z');
    var diff = target - now;
    if (diff <= 0) { countdownReload('beginnings'); return; }
    countdownTicking('beginnings');
    document.getElementById('bgCdDays').textContent = Math.floor(diff / 86400000);
    document.getElementById('bgCdHours').textContent = Math.floor((diff % 86400000) / 3600000);
    document.getElementById('bgCdMins').textContent = Math.floor((diff % 3600000) / 60000);
  }
  update();
  setInterval(update, 30000);
}

function bgEntry(day) { return (bgContent || [])[day - 1] || {}; }

// "Genesis 14–15" -> a reference the Bible sites understand.
function bgRefFor(reading) {
  var r = String(reading || '').replace(/–|—/g, '-').trim();
  return r || 'Genesis 1';
}

function bgRenderDay() {
  var day = bgViewingDay;
  var e = bgEntry(day);
  var closing = !e.reading || e.reading === '—';

  document.getElementById('bgDayLabel').textContent = 'DAY ' + day + ' OF ' + BG_TOTAL;
  document.getElementById('bgDayReading').textContent = closing ? 'The whole story' : (e.reading || '');
  document.getElementById('bgLessonEyebrow').textContent = closing ? 'The whole story' : (e.reading || 'Today');
  document.getElementById('bgLessonTitle').textContent = e.title || 'Beginnings';
  document.getElementById('bgLessonBody').innerHTML = (e.body || '')
    ? (e.body || '').split('\n\n').map(function (p) { return '<p>' + escapeText(p) + '</p>'; }).join('')
    : '<p style="color:var(--ink-quiet);">Heather is still writing this one.</p>';

  // Day 31 has no reading, so the read step and the question step step aside.
  var readBlock = document.getElementById('bgReadBlock');
  var godBlock = document.getElementById('bgGodBlock');
  readBlock.style.display = closing ? 'none' : 'block';
  godBlock.style.display = closing ? 'none' : 'block';

  if (!closing) {
    var ref = bgRefFor(e.reading);
    document.getElementById('bgReadLabel').textContent = 'Read ' + ref;
    document.getElementById('bgReadYV').href = 'https://www.bible.com/search/bible?q=' + encodeURIComponent(ref);
    document.getElementById('bgReadBG').href = 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(ref) + '&version=NLT';
    document.getElementById('bgReadCheckbox').checked = bgCheckedDays.has(day);
    var saved = (bgEntries[day] || {});
    document.getElementById('bgGodLine').value = saved.god_speaking || '';
    document.getElementById('bgGodStatus').textContent = '';
  }

  document.getElementById('bgPrevDay').disabled = day <= 1;
  document.getElementById('bgNextDay').disabled = day >= bgCurrentDay;
  bgRenderGrid();
  tlRender(BG_CHALLENGE, bgCurrentDay, BG_TOTAL);
}

function bgRenderGrid() {
  var html = '';
  for (var d = 1; d <= BG_TOTAL; d++) {
    var cls = 'jd-day';
    if (bgCheckedDays.has(d)) cls += ' done';
    if (d === bgViewingDay) cls += ' viewing';
    if (d > bgCurrentDay) cls += ' future';
    html += '<button class="' + cls + '" onclick="bgGoToDay(' + d + ')"' +
      (d > bgCurrentDay ? ' disabled' : '') + '>' + d + '</button>';
  }
  document.getElementById('bgDayGrid').innerHTML = html;
}

function bgGoToDay(d) {
  if (d < 1 || d > bgCurrentDay) return;
  bgViewingDay = d;
  bgRenderDay();
}

function bgChangeDay(step) { bgGoToDay(bgViewingDay + step); }

function bgOnCheck() {
  var day = bgViewingDay;
  if (day < 1) return;
  var on = document.getElementById('bgReadCheckbox').checked;
  if (!bgEntries[day]) bgEntries[day] = { day: day };
  bgEntries[day].read_confirmed = on ? 1 : 0;
  if (on) bgCheckedDays.add(day); else bgCheckedDays.delete(day);
  bgRenderGrid();
  tlRender(BG_CHALLENGE, bgCurrentDay, BG_TOTAL);
  bgSave(day, 'bgSaveStatus');
  maybeShowCompletionCelebration(BG_CHALLENGE, BG_TOTAL, bgCheckedDays.size);
}

// One save path for both the tick and the line, because they live in the same
// journal row and saving one must not blank the other.
function bgSave(day, statusId) {
  var st = document.getElementById(statusId);
  if (!userEmail || !userToken) {
    if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; }
    return Promise.resolve();
  }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  var e = bgEntries[day] || {};
  return fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail, token: userToken, challenge: BG_CHALLENGE, day: day,
      god_speaking: e.god_speaking || '',
      read_confirmed: (e.read_confirmed === 1)
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!st) return;
      if (data && data.success) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
      else { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() { if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; } });
}

function bgSaveGodLine(btn) {
  var day = bgViewingDay;
  var line = (document.getElementById('bgGodLine').value || '').trim();
  if (!bgEntries[day]) bgEntries[day] = { day: day };
  bgEntries[day].god_speaking = line;
  bgRenderGodList();
  btn.disabled = true;
  bgSave(day, 'bgGodStatus').then(function() { btn.disabled = false; });
}

// Every line she has written, newest first. This is the thing the month is for,
// so it is on the dashboard and not buried behind a link.
function bgRenderGodList() {
  var host = document.getElementById('bgGodList');
  if (!host) return;
  var days = Object.keys(bgEntries)
    .map(Number)
    .filter(function (d) { return (bgEntries[d] || {}).god_speaking; })
    .sort(function (a, b) { return b - a; });
  if (!days.length) {
    host.innerHTML = '<p style="font-size:14px;color:var(--ink-quiet);font-weight:300;margin:0;">Nothing yet. Your first line lands here once you write it.</p>';
    return;
  }
  host.innerHTML = days.map(function (d) {
    var e = bgEntry(d);
    return '<div style="border-left:3px solid var(--gold);padding:2px 0 2px 14px;margin:0 0 16px;">' +
      '<p style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-quiet);margin:0 0 4px;">Day ' + d + (e.reading && e.reading !== '—' ? ' &middot; ' + escapeText(e.reading) : '') + '</p>' +
      '<p style="font-family:Lora,Georgia,serif;font-size:16px;line-height:1.6;color:var(--ink);margin:0;">' + escapeText(bgEntries[d].god_speaking) + '</p>' +
      '</div>';
  }).join('');
}
