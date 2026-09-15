// Hide It In Your Heart: the Beatitudes, cards and memory games.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares and are only called from click
// handlers or from inside other functions, never while the page parses,
// which is checked with a parser before the cut is made.

function beatComputeDay() {
  var d = computeDayFor(beatStartIso);
  return d > 30 ? 30 : d;
}

function beatStartCountdown() {
  function update() {
    var now = new Date();
    var target = new Date(BEAT_START + 'T11:00:00Z');
    var diff = target - now;
    if (diff <= 0) { location.reload(); return; }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    document.getElementById('bCdDays').textContent = d;
    document.getElementById('bCdHours').textContent = h;
    document.getElementById('bCdMins').textContent = m;
  }
  update();
  setInterval(update, 30000);
}

function beatLoadData() {
  if (!userEmail || !userToken) { return Promise.resolve(); }
  return fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=' + BEAT_CHALLENGE)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      beatEntries = {};
      (data.entries || []).forEach(function(e) { beatEntries[e.day] = e; });
      beatCheckedDays = new Set(data.days || []);
      beatStreak = data.streak || 0;
    })
    .catch(function() { beatEntries = {}; beatCheckedDays = new Set(); beatStreak = 0; });
}

function beatDefaultHide(day) {
  var c = beatContent[day - 1];
  if (c && typeof c.hide_pct === 'number') return c.hide_pct;
  return Math.min(100, Math.round(((day - 1) / 29) * 100));
}

function beatRenderDay() {
  var day = beatViewingDay;
  if (day < 1) return;
  var c = beatContent[day - 1] || {};
  var entry = beatEntries[day] || {};

  document.getElementById('bDayLabel').textContent = 'DAY ' + day + ' OF 30';
  document.getElementById('bDayFocus').textContent = c.focus || '';
  document.getElementById('bHeroFocus').textContent = c.title || 'The Beatitudes';
  document.getElementById('bPrevDay').disabled = (day <= 1);
  document.getElementById('bNextDay').disabled = (day >= beatCurrentDay);

  document.getElementById('bLessonEyebrow').textContent = c.focus || ('Day ' + day);
  document.getElementById('bLessonTitle').textContent = c.title || '';

  // Optional video from Heather
  var vwrap = document.getElementById('bVideoWrap');
  var vframe = document.getElementById('bVideoFrame');
  if (c.video_url) {
    vframe.src = ytEmbed(c.video_url);
    vwrap.style.display = 'block';
  } else {
    vframe.src = '';
    vwrap.style.display = 'none';
  }

  var body = dashboardBody(c.body || '').split('\n\n').map(function(p) { return '<p>' + linkifyText(escapeText(p)) + '</p>'; }).join('');
  document.getElementById('bLessonBody').innerHTML = body;
  beatRenderTodayCard();
  beatRenderCardGrid();
  beatRenderLessonVerses();
  document.getElementById('bPracticeNote').innerHTML = c.practice ? '<strong>Today:</strong> ' + escapeText(c.practice) : '';

  // Practice check + record link
  document.getElementById('bPracticeCheckbox').checked = entry.read_confirmed === 1;
  var bCert = document.getElementById('bCertCard');
  if (bCert) {
    if (beatCheckedDays.size >= 30) {
      bCert.style.display = 'block';
      document.getElementById('bCertLink').href = 'certificate.html?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=' + BEAT_CHALLENGE;
    } else {
      bCert.style.display = 'none';
    }
  }
  var recCard = document.getElementById('bRecordCard');
  if (day >= 30) {
    recCard.style.display = 'block';
    document.getElementById('bRecordLink').value = entry.stood_out || '';
  } else {
    recCard.style.display = 'none';
  }

  // Listen link points to the passage online
  var listen = document.getElementById('bListenLink');
  if (listen) listen.href = 'https://www.biblegateway.com/passage/?search=Matthew%205%3A1-12&version=' + beatTranslation.toUpperCase();

  document.getElementById('bSaveStatus').textContent = '';
  beatRenderGrid();
  // If the active game got locked (e.g. navigating to an earlier day), fall back
  if (beatModeLocked(beatMode)) { beatMode = 'blanks'; }
  beatPaintModeLocks();
  document.querySelectorAll('#bActiveChallenge .mem-mode-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-mode') === beatMode);
  });
  beatScrollModeIntoView();
  beatSyncModePanels();
  beatRenderGame();
}

function beatRenderGrid() {
  var grid = document.getElementById('bDayGrid');
  var html = '';
  for (var d = 1; d <= 30; d++) {
    var classes = 'day-dot';
    if (beatCheckedDays.has(d)) classes += ' completed';
    if (d === beatCurrentDay) classes += ' current';
    if (d > beatCurrentDay) classes += ' future';
    if (d === beatViewingDay) classes += ' viewing';
    html += '<div class="' + classes + '" onclick="beatGoToDay(' + d + ')">' + d + '</div>';
  }
  grid.innerHTML = html;
}

function beatUpdateStats() {
  document.getElementById('bHeroStreak').textContent = beatStreak;
  document.getElementById('bHeroTotal').textContent = beatCheckedDays.size;
  document.getElementById('bHeroDay').textContent = beatCurrentDay;
  document.getElementById('bSideStreak').textContent = beatStreak;
  document.getElementById('bProgressFill').style.width = Math.round((beatCheckedDays.size / 30) * 100) + '%';
  document.getElementById('bProgressText').textContent = beatCheckedDays.size;
  renderRestart('september-beatitudes-2026');
}

function beatChangeDay(delta) {
  var n = beatViewingDay + delta;
  if (n < 1 || n > beatCurrentDay) return;
  beatViewingDay = n;
  beatHidePct = beatDefaultHide(n);
  beatRenderDay();
}

function beatGoToDay(d) {
  if (d > beatCurrentDay) return;
  beatViewingDay = d;
  beatHidePct = beatDefaultHide(d);
  beatRenderDay();
}

function beatCardSrc(n, thumb) {
  return '../images/beatitudes/card' + n + (thumb ? '-thumb' : '') + '.jpg';
}

function beatVerseFor(n) {
  var tr = beatPassage ? (beatPassage[beatTranslation] || beatPassage.niv) : null;
  if (!tr) return '';
  var v = tr.verses.filter(function(x) { return x.beatitude === n; })[0];
  return v ? v.text : '';
}

function beatRenderTodayCard() {
  var wrap = document.getElementById('bCardToday');
  if (!wrap) return;
  var c = beatContent[(beatViewingDay || 1) - 1] || {};
  var n = c.beatitude;
  if (!n || n < 1 || n > 8) { wrap.style.display = 'none'; return; }
  var img = document.getElementById('bCardTodayImg');
  img.src = beatCardSrc(n, false);
  img.alt = BEAT_CARD_REFS[n - 1] + ' memory card';
  img.onclick = function() { beatOpenCard(n); };
  document.getElementById('bCardTodayCap').textContent = BEAT_CARD_REFS[n - 1] + ' · tap to enlarge';
  wrap.style.display = 'block';
}

function beatRenderCardGrid() {
  var html = '';
  for (var n = 1; n <= 8; n++) {
    html += '<div class="bc-cell">' +
      '<img src="' + beatCardSrc(n, true) + '" alt="' + BEAT_CARD_REFS[n - 1] + ' memory card" loading="lazy" onclick="beatOpenCard(' + n + ')">' +
      '<div class="bc-ref">' + BEAT_CARD_REFS[n - 1] + '</div></div>';
  }
  // One grid runs inside the challenge, the other on the countdown screen.
  ['bCardGrid', 'bCardGridPre'].forEach(function(id) {
    var grid = document.getElementById(id);
    if (!grid || grid.dataset.built === '1') return;
    grid.innerHTML = html;
    grid.dataset.built = '1';
  });
}

function beatOpenCard(n) {
  var box = document.getElementById('bLightbox');
  document.getElementById('bLightboxImg').src = beatCardSrc(n, false);
  var t = beatVerseFor(n);
  document.getElementById('bLightboxVerse').textContent = t ? (BEAT_CARD_REFS[n - 1] + ' — ' + t) : BEAT_CARD_REFS[n - 1];
  box.classList.add('open');
}

function beatCloseCard(e) {
  // Only close on the backdrop or the close button, not on the picture itself.
  if (e && e.target && e.target.tagName === 'IMG') return;
  document.getElementById('bLightbox').classList.remove('open');
}

function beatPrintCards() {
  var area = document.getElementById('bPrintArea');
  var tr = beatPassage ? (beatPassage[beatTranslation] || beatPassage.niv) : null;
  var label = tr ? (tr.label || beatTranslation.toUpperCase()) : '';
  var html = '<div class="pc pc-title">' +
    '<h1 style="font-family:Lora,serif;font-size:26px;margin:0 0 6px;">Picture Pegs</h1>' +
    '<p style="color:#b85638;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 14px;">The Beatitudes &middot; Matthew 5:3-10' + (label ? ' &middot; ' + escapeText(label) : '') + '</p>' +
    '<p style="font-family:Lora,serif;font-size:14px;color:#4b5563;line-height:1.7;max-width:420px;margin:0 auto;">Close your eyes and see the picture, then say the line. Pictures stick where words slip, and kids especially love learning this way.</p>' +
    '<p style="color:#c8a365;margin-top:22px;font-size:12px;">HeatherLynWilson.com &middot; #HideItInYourHeart</p></div>';
  for (var n = 1; n <= 8; n++) {
    var t = beatVerseFor(n);
    html += '<div class="pc"><img src="' + beatCardSrc(n, false) + '">' +
      '<div style="font-family:Lora,serif;font-size:13px;margin-top:8px;">' +
      escapeText(BEAT_CARD_REFS[n - 1] + (t ? ' — ' + t : '')) + '</div></div>';
  }
  if (tr && tr.credit) {
    html += '<div class="pc" style="page-break-after:auto;"><p style="font-size:10px;color:#999;max-width:460px;margin:0 auto;line-height:1.6;">' + escapeText(tr.credit) + '</p></div>';
  }
  area.innerHTML = html;
  area.style.display = 'block';
  var imgs = area.querySelectorAll('img');
  var left = imgs.length;
  var go = function() { if (--left <= 0) { window.print(); setTimeout(function() { area.style.display = 'none'; }, 500); } };
  imgs.forEach(function(im) {
    if (im.complete) { go(); } else { im.onload = go; im.onerror = go; }
  });
}

function beatRenderLessonVerses() {
  var host = document.getElementById('bLessonVerses');
  if (!host) return;
  var day = beatViewingDay || 1;
  var tr = beatPassage ? (beatPassage[beatTranslation] || beatPassage.niv) : null;
  if (!tr || day < 1) { host.style.display = 'none'; return; }
  var through = (day <= 1) ? 0 : (day >= 26 ? 9 : Math.min(8, Math.ceil((day - 1) / 3)));
  var todayBeat = (beatContent[day - 1] || {}).beatitude;
  var verses = tr.verses.filter(function(v) { return v.beatitude === 0 || v.beatitude <= through; });
  if (!verses.length) { host.style.display = 'none'; return; }
  var label = (through >= 9) ? 'The whole passage' : 'Your verses so far';
  var html = '<div class="lv-head">' + label + ' &middot; ' + escapeText(tr.label || beatTranslation.toUpperCase()) + '</div>';
  verses.forEach(function(v) {
    var today = (todayBeat && todayBeat !== 0 && v.beatitude === todayBeat) ? ' today' : '';
    html += '<div class="lv-verse' + today + '"><span class="lv-ref">' + escapeText(v.ref) + '</span>' + escapeText(v.text) + '</div>';
  });
  host.innerHTML = html;
  host.style.display = 'block';
}

function beatVisibleThrough() {
  if (beatShowWhole) return 9;
  var day = beatViewingDay || 1;
  if (day <= 1) return 0;        // day 1 learns the setup, Matthew 5:1-2, only
  if (day >= 26) return 9;       // closing and review days: the whole thing
  return Math.min(8, Math.ceil((day - 1) / 3)); // days 2-4 ->1, 5-7 ->2, ... 23-25 ->8
}

function beatVisibleVerses() {
  var tr = beatPassage ? (beatPassage[beatTranslation] || beatPassage.niv) : null;
  if (!tr) return [];
  var through = beatVisibleThrough();
  return tr.verses.filter(function(v) { return v.beatitude === 0 || v.beatitude <= through; });
}

function beatLearnedBeatitudes() {
  var tr = beatPassage ? (beatPassage[beatTranslation] || beatPassage.niv) : null;
  if (!tr) return [];
  var through = Math.min(8, beatVisibleThrough());
  return tr.verses.filter(function(v) { return v.beatitude >= 1 && v.beatitude <= 8 && v.beatitude <= through; });
}

function beatSetScope(whole) {
  beatShowWhole = whole;
  document.getElementById('bScopeLearned').classList.toggle('active', !whole);
  document.getElementById('bScopeWhole').classList.toggle('active', whole);
  beatRevealed = {};
  beatRenderGame();
}

function beatModeLocked(mode) {
  return beatCurrentDay < (BEAT_MODE_UNLOCK[mode] || 1);
}

function beatPaintModeLocks() {
  document.querySelectorAll('#bActiveChallenge .mem-mode-btn').forEach(function(b) {
    var m = b.getAttribute('data-mode');
    var need = BEAT_MODE_UNLOCK[m] || 1;
    var locked = beatCurrentDay < need;
    b.classList.toggle('locked', locked);
    if (locked) {
      b.innerHTML = escapeText(BEAT_MODE_LABEL[m]) + '<span class="mode-lock">Day ' + need + '</span>';
    } else if (need > 1 && beatCurrentDay === need) {
      // The day a game arrives it gets a little badge
      b.innerHTML = escapeText(BEAT_MODE_LABEL[m]) + '<span class="mode-new">New</span>';
    } else {
      b.innerHTML = escapeText(BEAT_MODE_LABEL[m]);
    }
  });
  beatPaintModesHint();
}

function beatPaintModesHint() {
  var hint = document.getElementById('bModesHint');
  if (!hint) return;
  var total = Object.keys(BEAT_MODE_UNLOCK).length;
  var nextUnlock = null;
  Object.keys(BEAT_MODE_UNLOCK).forEach(function(m) {
    var need = BEAT_MODE_UNLOCK[m];
    if (need > beatCurrentDay && (nextUnlock === null || need < nextUnlock)) nextUnlock = need;
  });
  hint.textContent = total + ' games, swipe across to play.' +
    (nextUnlock ? ' The next new game unlocks on Day ' + nextUnlock + '.' : ' You have unlocked them all.');

  var wrap = document.getElementById('bModesWrap');
  var row = wrap ? wrap.querySelector('.mem-modes') : null;
  if (row && !row.dataset.fadeWired) {
    row.dataset.fadeWired = '1';
    var sync = function() {
      wrap.classList.toggle('at-end', row.scrollLeft + row.clientWidth >= row.scrollWidth - 8);
    };
    row.addEventListener('scroll', sync);
    sync();
  }
}

function beatScrollModeIntoView() {
  var row = document.querySelector('#bActiveChallenge .mem-modes');
  var btn = document.querySelector('#bActiveChallenge .mem-mode-btn.active');
  if (row && btn) {
    row.scrollLeft = Math.max(0, btn.offsetLeft - row.clientWidth / 2 + btn.offsetWidth / 2);
  }
}

function beatSyncModePanels() {
  var mode = beatMode;
  document.getElementById('bMemLocked').style.display = 'none';
  document.getElementById('bMemLevelsWrap').style.display = (mode === 'blanks') ? 'block' : 'none';
  document.getElementById('bMemPassage').style.display = (mode === 'blanks' || mode === 'letters') ? 'block' : 'none';
  document.getElementById('bMemType').style.display = (mode === 'type') ? 'block' : 'none';
  document.getElementById('bMemMatch').style.display = (mode === 'match') ? 'block' : 'none';
  document.getElementById('bMemOrder').style.display = (mode === 'order') ? 'block' : 'none';
  document.getElementById('bMemScramble').style.display = (mode === 'scramble') ? 'block' : 'none';
  document.getElementById('bMemSpeed').style.display = (mode === 'speed') ? 'block' : 'none';
  document.getElementById('bMemWrong').style.display = (mode === 'wrongword') ? 'block' : 'none';
  document.getElementById('bMemControls').style.display = (mode === 'blanks' || mode === 'letters') ? 'flex' : 'none';
  // Leaving the speed round stops its clock
  if (mode !== 'speed' && typeof beatSpeedTimerId !== 'undefined') clearInterval(beatSpeedTimerId);
}

function beatSetMode(mode, btn) {
  // Highlight whichever tab was tapped
  document.querySelectorAll('#bActiveChallenge .mem-mode-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  if (beatModeLocked(mode)) {
    // Locked: hide the games and show a clear lock message
    ['bMemLevelsWrap','bMemPassage','bMemType','bMemMatch','bMemOrder','bMemScramble','bMemSpeed','bMemWrong','bMemControls'].forEach(function(id) {
      document.getElementById(id).style.display = 'none';
    });
    var need = BEAT_MODE_UNLOCK[mode] || 1;
    document.getElementById('bMemLocked').innerHTML =
      '<div class="lock-ico">&#128274;</div>' +
      '<div class="lock-msg">This game opens on <strong>Day ' + need + '</strong>.</div>' +
      '<div class="lock-sub">You are on Day ' + beatCurrentDay + '. Keep going, it is coming.</div>';
    document.getElementById('bMemLocked').style.display = 'block';
    return;
  }

  beatMode = mode;
  beatSyncModePanels();
  beatRenderGame();
}

function beatSetLevel(pct, btn) {
  beatHidePct = pct;
  beatRevealed = {};
  document.querySelectorAll('#bMemLevels .mem-level-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  beatRenderGame(true);
}

function beatRevealAll() {
  document.querySelectorAll('#bMemPassage .mword.hidden').forEach(function(sp) {
    beatRevealed[sp.getAttribute('data-k')] = true;
  });
  beatPaintReveals();
}

function beatPaintReveals() {
  document.querySelectorAll('#bMemPassage .mword.hidden').forEach(function(sp) {
    if (beatRevealed[sp.getAttribute('data-k')]) {
      sp.textContent = sp.getAttribute('data-word');
      sp.className = 'mword revealed';
    }
  });
}

function beatWordMask(word) {
  var first = word.charAt(0);
  var rest = word.slice(1).replace(/[A-Za-z0-9]/g, '·');
  return first + rest;
}

function beatRenderGame(keepLevelButtons) {
  if (!beatPassage) {
    var h = document.getElementById('bMemPassage');
    if (h) h.textContent = 'Loading the passage...';
    return;
  }
  if (beatMode === 'blanks') return beatRenderBlanks(keepLevelButtons);
  if (beatMode === 'letters') return beatRenderLetters();
  if (beatMode === 'type') return beatRenderType();
  if (beatMode === 'match') return beatRenderMatch();
  if (beatMode === 'order') return beatRenderOrder();
  if (beatMode === 'scramble') return beatRenderScramble();
  if (beatMode === 'speed') return beatRenderSpeed();
  if (beatMode === 'wrongword') return beatNewWrong();
}

function beatRenderBlanks(keepLevelButtons) {
  var host = document.getElementById('bMemPassage');
  if (!keepLevelButtons) {
    document.querySelectorAll('#bMemLevels .mem-level-btn').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-pct'), 10) === beatHidePct);
    });
  }
  beatRevealed = beatRevealed || {};
  var todayBeat = (beatContent[beatViewingDay - 1] || {}).beatitude;
  var k = 0;
  host.innerHTML = beatVisibleVerses().map(function(v) {
    var isFocus = (todayBeat && todayBeat !== 0 && v.beatitude === todayBeat);
    var line = v.text.split(' ').map(function(w) {
      var idx = k++;
      var hide = ((idx * 37 + 13) % 100) < beatHidePct;
      if (!hide) return '<span class="mword">' + escapeText(w) + '</span>';
      return '<span class="mword hidden" data-k="' + idx + '" data-word="' + escapeText(w).replace(/"/g, '&quot;') + '" onclick="beatRevealWord(this)">' + escapeText(beatWordMask(w)) + '</span>';
    }).join(' ');
    return '<div class="mem-verse' + (isFocus ? ' focus' : '') + '"><span class="mem-vref">' + escapeText(v.ref) + '</span>' + line + '</div>';
  }).join('');
  beatPaintReveals();
}

function beatRevealWord(sp) {
  beatRevealed[sp.getAttribute('data-k')] = true;
  sp.textContent = sp.getAttribute('data-word');
  sp.className = 'mword revealed';
}

function beatRenderLetters() {
  var host = document.getElementById('bMemPassage');
  var todayBeat = (beatContent[beatViewingDay - 1] || {}).beatitude;
  var k = 0;
  host.innerHTML = beatVisibleVerses().map(function(v) {
    var isFocus = (todayBeat && todayBeat !== 0 && v.beatitude === todayBeat);
    var line = v.text.split(' ').map(function(w) {
      var idx = k++;
      return '<span class="mword hidden" data-k="L' + idx + '" data-word="' + escapeText(w).replace(/"/g, '&quot;') + '" onclick="beatToggleLetter(this)">' + escapeText(w.charAt(0)) + '</span>';
    }).join(' ');
    return '<div class="mem-verse' + (isFocus ? ' focus' : '') + '"><span class="mem-vref">' + escapeText(v.ref) + '</span>' + line + '</div>';
  }).join('');
}

function beatToggleLetter(sp) {
  if (sp.classList.contains('revealed')) {
    sp.textContent = sp.getAttribute('data-word').charAt(0);
    sp.className = 'mword hidden';
  } else {
    sp.textContent = sp.getAttribute('data-word');
    sp.className = 'mword revealed';
  }
}

function beatRenderType() {
  var refs = beatVisibleVerses().map(function(v) { return v.ref; });
  var first = refs[0] || '';
  var last = refs[refs.length - 1] || '';
  var span = (first === last) ? first : (first + ' to ' + last.split(' ').pop());
  document.getElementById('bTypeRefs').textContent = 'From memory, type ' + span + '.';
  document.getElementById('bTypeResult').innerHTML = '';
}

function beatNormalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function beatClearTyping() {
  document.getElementById('bTypeInput').value = '';
  document.getElementById('bTypeResult').innerHTML = '';
}

function beatCheckTyping() {
  var target = beatVisibleVerses().map(function(v) { return v.text; }).join(' ');
  var targetWords = target.split(/\s+/);
  var normTarget = targetWords.map(beatNormalize);
  var typed = beatNormalize(document.getElementById('bTypeInput').value).split(' ').filter(Boolean);

  var right = 0;
  var html = targetWords.map(function(w, i) {
    var tw = typed[i];
    if (tw != null && tw === normTarget[i]) { right++; return '<span class="tw-right">' + escapeText(w) + '</span>'; }
    if (tw != null && tw !== '') return '<span class="tw-wrong">' + escapeText(tw) + '</span> <span class="tw-missing">' + escapeText(w) + '</span>';
    return '<span class="tw-missing">' + escapeText(w) + '</span>';
  }).join(' ');

  var pct = Math.round((right / targetWords.length) * 100);
  document.getElementById('bTypeResult').innerHTML =
    '<div class="mem-type-score">' + right + ' of ' + targetWords.length + ' words right (' + pct + '%)</div>' + html;
}

function beatSplitBeatitude(text) {
  // Split on the "... for ..." pivot, handling comma or colon before "for".
  var m = text.match(/^(.*?)[,:]\s+for\s+(.*)$/i);
  if (m) return { left: m[1].trim(), right: m[2].trim().replace(/\.$/, '') };
  return { left: text, right: '' };
}

function beatShuffle(arr, seed) {
  // Deterministic shuffle (no Math.random) seeded by length so it is stable.
  var a = arr.slice();
  var s = seed || a.length;
  for (var i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    var j = Math.floor((s / 233280) * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function beatRenderMatch() {
  var beats = beatLearnedBeatitudes();
  var hint = document.getElementById('bMatchHint');
  var leftCol = document.getElementById('bMatchLeft');
  var rightCol = document.getElementById('bMatchRight');
  document.getElementById('bMatchStatus').textContent = '';
  beatMatchSel = null;
  beatMatchDone = 0;
  if (beats.length < 2) {
    hint.textContent = 'Come back once you have learned a couple of Beatitudes and you can match them here.';
    leftCol.innerHTML = ''; rightCol.innerHTML = '';
    return;
  }
  hint.textContent = 'Tap a blessing on the left, then the promise that goes with it.';
  var pairs = beats.map(function(v) { var p = beatSplitBeatitude(v.text); return { b: v.beatitude, left: p.left, right: p.right }; });
  var lefts = pairs.slice();
  var rights = beatShuffle(pairs, pairs.length * 7);
  leftCol.innerHTML = lefts.map(function(p) {
    return '<button class="mem-chip" data-b="' + p.b + '" data-side="L" onclick="beatMatchTap(this)">' + escapeText(p.left) + '</button>';
  }).join('');
  rightCol.innerHTML = rights.map(function(p) {
    return '<button class="mem-chip" data-b="' + p.b + '" data-side="R" onclick="beatMatchTap(this)">' + escapeText(p.right) + '</button>';
  }).join('');
}

function beatMatchTap(btn) {
  if (btn.classList.contains('done')) return;
  var side = btn.getAttribute('data-side');
  if (!beatMatchSel) {
    if (side !== 'L') return; // start with a blessing
    beatMatchSel = btn;
    btn.classList.add('sel');
    return;
  }
  if (side === 'L') { // switch selection
    beatMatchSel.classList.remove('sel');
    beatMatchSel = btn;
    btn.classList.add('sel');
    return;
  }
  // side R: check the pair
  if (btn.getAttribute('data-b') === beatMatchSel.getAttribute('data-b')) {
    btn.classList.add('done');
    beatMatchSel.classList.remove('sel');
    beatMatchSel.classList.add('done');
    beatMatchSel = null;
    beatMatchDone++;
    var total = document.querySelectorAll('#bMatchLeft .mem-chip').length;
    if (beatMatchDone >= total) document.getElementById('bMatchStatus').textContent = 'You matched them all. Well done.';
  } else {
    btn.classList.add('wrong');
    setTimeout(function() { btn.classList.remove('wrong'); }, 350);
  }
}

function beatRenderOrder() {
  var beats = beatLearnedBeatitudes();
  var target = document.getElementById('bOrderTarget');
  var pool = document.getElementById('bOrderPool');
  document.getElementById('bOrderStatus').textContent = '';
  target.innerHTML = '';
  beatOrderPlaced = 0;
  if (beats.length < 2) {
    pool.innerHTML = '<p class="mem-match-hint">Come back once you have learned a couple of Beatitudes and you can put them in order here.</p>';
    beatOrderExpected = [];
    return;
  }
  beatOrderExpected = beats.map(function(v) { return v.beatitude; });
  var shuffled = beatShuffle(beats, beats.length * 13);
  pool.innerHTML = shuffled.map(function(v) {
    var label = beatSplitBeatitude(v.text).left;
    return '<button class="mem-chip" data-b="' + v.beatitude + '" onclick="beatOrderTap(this)">' + escapeText(label) + '</button>';
  }).join('');
}

function beatOrderTap(btn) {
  var expected = beatOrderExpected[beatOrderPlaced];
  if (parseInt(btn.getAttribute('data-b'), 10) === expected) {
    var target = document.getElementById('bOrderTarget');
    var slot = document.createElement('div');
    slot.className = 'mem-order-slot';
    slot.innerHTML = '<span class="ord-num">' + (beatOrderPlaced + 1) + '</span><span>' + btn.textContent + '</span>';
    target.appendChild(slot);
    btn.remove();
    beatOrderPlaced++;
    if (beatOrderPlaced >= beatOrderExpected.length) {
      document.getElementById('bOrderStatus').textContent = 'Perfect order. You know them.';
    }
  } else {
    btn.classList.add('wrong');
    setTimeout(function() { btn.classList.remove('wrong'); }, 350);
  }
}

function beatRenderScramble() {
  var beats = beatLearnedBeatitudes();
  var target = document.getElementById('bScrambleTarget');
  var pool = document.getElementById('bScramblePool');
  document.getElementById('bScrambleStatus').textContent = '';
  target.innerHTML = '';
  beatScramblePlaced = 0;
  if (!beats.length) {
    pool.innerHTML = '<p class="mem-match-hint">Learn your first line and this game opens up.</p>';
    beatScrambleWords = [];
    return;
  }
  var v = beats[beatScramblePick % beats.length];
  document.getElementById('bScrambleHint').textContent = 'Rebuild ' + v.ref + '. Tap the words in order.';
  beatScrambleWords = v.text.split(' ');
  var shuffled = beatShuffle(beatScrambleWords.map(function(w, i) { return { w: w, i: i }; }), beatScrambleWords.length * 11 + beatScramblePick * 7 + 3);
  pool.innerHTML = shuffled.map(function(o) {
    return '<button type="button" class="mem-chip" onclick="beatScrambleTap(this)">' + escapeText(o.w) + '</button>';
  }).join('');
}

function beatScrambleTap(btn) {
  var expected = beatScrambleWords[beatScramblePlaced];
  if (btn.textContent === expected) {
    var target = document.getElementById('bScrambleTarget');
    target.innerHTML += '<span class="mword revealed" style="margin:0 4px 4px 0;display:inline-block;">' + escapeText(expected) + '</span>';
    btn.remove();
    beatScramblePlaced++;
    if (beatScramblePlaced >= beatScrambleWords.length) {
      document.getElementById('bScrambleStatus').textContent = 'That is the line, word for word. Well done.';
    }
  } else {
    btn.classList.add('wrong');
    setTimeout(function() { btn.classList.remove('wrong'); }, 350);
  }
}

function beatNewScramble() {
  beatScramblePick++;
  beatRenderScramble();
}

function beatSpeedBestKey() { return 'beat_speed_best_' + (userEmail || 'anon'); }

function beatLocalBest() {
  var b = 0;
  try { b = parseInt(localStorage.getItem(beatSpeedBestKey()) || '0', 10); } catch (e) {}
  return b;
}

function beatLoadScores() {
  if (!userEmail || !userToken) {
    // Preview mode: sample board so the race is visible before launch
    if (new URLSearchParams(window.location.search).get('preview') === '1') {
      beatScoreBest = 11;
      beatScoreBoard = [
        { name: 'Rachel', score: 14, you: false },
        { name: userName || 'Heather', score: 11, you: true },
        { name: 'Harmony', score: 9, you: false },
        { name: 'Kenzie', score: 6, you: false }
      ];
    }
    beatScoreLoaded = true;
    beatRenderScoreUI();
    return;
  }
  fetch('/api/memory-score?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken) + '&challenge=september-beatitudes-2026&game=speed')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.success) {
        beatScoreBest = Math.max(d.best || 0, beatLocalBest());
        beatScoreBoard = d.leaderboard || null;
      }
      beatScoreLoaded = true;
      beatRenderScoreUI();
    })
    .catch(function() { beatScoreLoaded = true; });
}

function beatBoardHtml() {
  if (!beatScoreBoard || beatScoreBoard.length < 2) return '';
  var medals = ['🥇', '🥈', '🥉'];
  var rows = beatScoreBoard.map(function(m, i) {
    var rank = i < 3 ? medals[i] : '<span style="font-size:12px;color:var(--ink-quiet);font-weight:600;">' + (i + 1) + '</span>';
    return '<div class="speed-board-row' + (m.you ? ' you' : '') + '">' +
      '<span class="sb-rank">' + rank + '</span>' +
      '<span class="sb-name">' + escapeText(m.name) + (m.you ? ' <span class="sb-you-tag">(you)</span>' : '') + '</span>' +
      '<span class="sb-score">' + (m.score || 0) + ' <small>words</small></span>' +
      '</div>';
  });
  return '<div class="speed-board-title">Race your group</div>' + rows.join('') +
    '<div class="speed-board-note">Best scores in the Speed round. Only your group sees this.</div>';
}

function beatRenderScoreUI() {
  var best = Math.max(beatScoreBest, beatLocalBest());
  var bestEl = document.getElementById('bSpeedBest');
  if (bestEl) bestEl.textContent = best ? ('Your best: ' + best + ' words.') : '';
  var boardHtml = beatBoardHtml();
  var b1 = document.getElementById('bSpeedBoard');
  var b2 = document.getElementById('bSpeedBoardDone');
  if (b1) b1.innerHTML = boardHtml;
  if (b2) b2.innerHTML = boardHtml;
}

function beatChaseLine() {
  if (!beatScoreBoard || beatScoreBoard.length < 2) return '';
  var meIdx = -1;
  for (var i = 0; i < beatScoreBoard.length; i++) { if (beatScoreBoard[i].you) { meIdx = i; break; } }
  if (meIdx === -1) return '';
  if (meIdx === 0) return ' You lead the group!';
  var ahead = beatScoreBoard[meIdx - 1];
  var gap = (ahead.score || 0) - (beatScoreBoard[meIdx].score || 0) + 1;
  return ' ' + gap + ' more to catch ' + ahead.name + '.';
}

function beatSaveScore(points) {
  if (!userEmail || !userToken) { beatRenderScoreUI(); return; }
  fetch('/api/memory-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, token: userToken, challenge: 'september-beatitudes-2026', game: 'speed', score: points })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.success) {
        beatScoreBest = Math.max(d.best || 0, beatLocalBest());
        beatScoreBoard = d.leaderboard || null;
        beatRenderScoreUI();
        var res = document.getElementById('bSpeedResult');
        if (res) res.textContent += beatChaseLine();
      }
    })
    .catch(function() {});
}

function beatRenderSpeed() {
  clearInterval(beatSpeedTimerId);
  document.getElementById('bSpeedIntro').style.display = 'block';
  document.getElementById('bSpeedPlay').style.display = 'none';
  document.getElementById('bSpeedDone').style.display = 'none';
  if (!beatScoreLoaded) beatLoadScores();
  else beatRenderScoreUI();
}

function beatStartSpeed() {
  var verses = beatVisibleVerses();
  if (!verses.length) return;
  var qs = [];
  verses.forEach(function(v) {
    var words = v.text.split(' ');
    words.forEach(function(w, i) {
      if (w.replace(/[^A-Za-z]/g, '').length < 4) return;
      qs.push({ words: words, i: i, ref: v.ref });
    });
  });
  if (!qs.length) return;
  beatSpeedQueue = beatShuffle(qs, Math.floor(Math.random() * 100000) + 1);
  beatSpeedIdx = 0;
  beatSpeedPoints = 0;
  beatSpeedLeft = 60;
  document.getElementById('bSpeedIntro').style.display = 'none';
  document.getElementById('bSpeedDone').style.display = 'none';
  document.getElementById('bSpeedPlay').style.display = 'block';
  document.getElementById('bSpeedScore').textContent = '0 words';
  document.getElementById('bSpeedTimer').textContent = '60';
  clearInterval(beatSpeedTimerId);
  beatSpeedTimerId = setInterval(function() {
    beatSpeedLeft--;
    var t = document.getElementById('bSpeedTimer');
    if (t) t.textContent = beatSpeedLeft;
    if (beatSpeedLeft <= 0) beatEndSpeed();
  }, 1000);
  beatSpeedNext();
}

function beatSpeedNext() {
  var q = beatSpeedQueue[beatSpeedIdx % beatSpeedQueue.length];
  beatSpeedIdx++;
  var host = document.getElementById('bSpeedLine');
  host.innerHTML = '<div class="mem-verse"><span class="mem-vref">' + escapeText(q.ref) + '</span>' +
    q.words.map(function(w, i) {
      if (i === q.i) return '<span class="mword hidden">____</span>';
      return '<span class="mword">' + escapeText(w) + '</span>';
    }).join(' ') + '</div>';

  var correct = q.words[q.i];
  var norm = beatNormalize(correct);
  var pool = beatSpeedQueue.map(function(x) { return x.words[x.i]; });
  var decoys = [];
  var guard = 0;
  while (decoys.length < 2 && guard++ < 300) {
    var cand = pool[Math.floor(Math.random() * pool.length)];
    var cn = beatNormalize(cand);
    if (cn !== norm && decoys.every(function(d) { return beatNormalize(d) !== cn; })) decoys.push(cand);
  }
  var opts = beatShuffle([correct].concat(decoys), Math.floor(Math.random() * 100000) + 1);
  document.getElementById('bSpeedChoices').innerHTML = opts.map(function(o) {
    var clean = o.replace(/[,.:;]$/, '');
    return '<button type="button" class="mem-chip" onclick="beatSpeedPick(this, ' + (beatNormalize(o) === norm ? 'true' : 'false') + ')">' + escapeText(clean) + '</button>';
  }).join('');
}

function beatSpeedPick(btn, right) {
  if (right) {
    beatSpeedPoints++;
    document.getElementById('bSpeedScore').textContent = beatSpeedPoints + (beatSpeedPoints === 1 ? ' word' : ' words');
    beatSpeedNext();
  } else {
    btn.classList.add('wrong');
    setTimeout(function() { btn.classList.remove('wrong'); }, 350);
  }
}

function beatEndSpeed() {
  clearInterval(beatSpeedTimerId);
  document.getElementById('bSpeedPlay').style.display = 'none';
  var best = Math.max(beatScoreBest, beatLocalBest());
  var msg = beatSpeedPoints + ' words in 60 seconds.';
  if (beatSpeedPoints > best) {
    msg += ' A new personal best!';
    try { localStorage.setItem(beatSpeedBestKey(), String(beatSpeedPoints)); } catch (e) {}
  } else if (best) {
    msg += ' Your best is ' + best + '.';
  }
  document.getElementById('bSpeedResult').textContent = msg;
  document.getElementById('bSpeedDone').style.display = 'block';
  beatRenderScoreUI();
  beatSaveScore(beatSpeedPoints);
}

function beatNewWrong() {
  var verses = beatVisibleVerses().filter(function(v) { return v.text.split(' ').length >= 4; });
  var status = document.getElementById('bWrongStatus');
  var host = document.getElementById('bWrongLine');
  document.getElementById('bWrongNextBtn').style.display = 'none';
  status.textContent = '';
  if (!verses.length) {
    host.innerHTML = '';
    status.textContent = 'Learn your first line and this game opens up.';
    return;
  }
  var v = verses[Math.floor(Math.random() * verses.length)];
  var words = v.text.split(' ');
  var idxs = [];
  words.forEach(function(w, i) { if (w.replace(/[^A-Za-z]/g, '').length >= 3) idxs.push(i); });
  var i = idxs[Math.floor(Math.random() * idxs.length)];
  var orig = words[i];
  var key = orig.toLowerCase().replace(/[^a-z]/g, '');
  var replacement = BEAT_WRONG_SWAPS[key];
  if (!replacement) {
    var all = [];
    beatVisibleVerses().forEach(function(vv) {
      vv.text.split(' ').forEach(function(w) {
        var c = w.replace(/[^A-Za-z]/g, '');
        if (c.length >= 3 && beatNormalize(w) !== beatNormalize(orig)) all.push(c.toLowerCase());
      });
    });
    replacement = all.length ? all[Math.floor(Math.random() * all.length)] : 'earth';
  }
  var punct = (orig.match(/[,.:;]$/) || [''])[0];
  var rep = (orig.charAt(0) === orig.charAt(0).toUpperCase())
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
  rep = rep.replace(/[,.:;]$/, '') + punct;

  beatWrongAnswer = i;
  beatWrongOrig = orig;
  host.innerHTML = '<div class="mem-verse"><span class="mem-vref">' + escapeText(v.ref) + '</span>' +
    words.map(function(w, j) {
      var shown = (j === i) ? rep : w;
      return '<span class="mword" style="cursor:pointer;" onclick="beatWrongTap(this, ' + j + ')">' + escapeText(shown) + '</span>';
    }).join(' ') + '</div>';
}

function beatWrongTap(sp, j) {
  var status = document.getElementById('bWrongStatus');
  if (j === beatWrongAnswer) {
    beatWrongStreak++;
    sp.textContent = beatWrongOrig;
    sp.style.color = 'var(--accent)';
    sp.style.fontWeight = '700';
    status.textContent = 'Caught it. The real word is "' + beatWrongOrig.replace(/[,.:;]$/, '') + '". Streak: ' + beatWrongStreak + '.';
    document.getElementById('bWrongNextBtn').style.display = 'inline-block';
  } else {
    beatWrongStreak = 0;
    var was = sp.style.background;
    sp.style.background = '#fde8e8';
    setTimeout(function() { sp.style.background = was; }, 350);
    status.textContent = 'Not that one. Look again.';
  }
}

function beatPrintLadder() {
  if (!beatPassage) return;
  var tr = beatPassage[beatTranslation] || beatPassage.niv;
  var rows = '';
  for (var b = 1; b <= 8; b++) {
    var v = null;
    tr.verses.forEach(function(x) { if (x.beatitude === b && !v) v = x; });
    rows += '<tr>' +
      '<td style="font-size:24px;font-weight:700;color:#b85638;padding:10px 16px 10px 0;white-space:nowrap;vertical-align:top;font-family:Georgia,serif;">' + b + '. ' + BEAT_LADDER_KEYS[b - 1] + '</td>' +
      '<td style="font-size:13px;color:#4b5563;padding:12px 0 10px;line-height:1.5;border-bottom:1px solid #f0ebe0;">' + escapeText(v ? v.text : '') + '</td>' +
      '</tr>';
  }
  var w = window.open('', '_blank');
  if (!w) return;
  w.document.write('<html><head><title>The One Word Ladder</title></head>' +
    '<body style="font-family:Georgia,serif;max-width:560px;margin:36px auto;padding:28px;border:3px solid #c8a365;color:#1f2937;">' +
    beatBackBar() +
    '<h1 style="text-align:center;font-size:24px;margin:0 0 4px;">The One Word Ladder</h1>' +
    '<p style="text-align:center;color:#b85638;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 10px;">The Beatitudes &middot; Matthew 5:3-12 &middot; ' + tr.label + '</p>' +
    '<p style="text-align:center;color:#4b5563;font-size:13px;line-height:1.6;margin:0 0 18px;">Eight words, one for each finger. Learn the ladder first and count it on your hands: Poor, Mourn, Meek, Hunger, Mercy, Pure, Peace, Persecuted. Once the eight words are yours, the full lines hang on them like coats on hooks.</p>' +
    '<table style="border-collapse:collapse;width:100%;">' + rows + '</table>' +
    '<p style="text-align:center;color:#c8a365;margin-top:20px;font-size:12px;">HeatherLynWilson.com &middot; #HideItInYourHeart</p>' +
    '<p style="text-align:center;font-size:10px;color:#999;margin-top:8px;">' + escapeText(tr.credit) + '</p>' +
    '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(function() { w.print(); }, 300);
}

function beatPrintPegs() {
  beatPrintCards();
}

function beatSetTranslation(t) {
  beatTranslation = t;
  try { localStorage.setItem('beat_trans_' + (userEmail || 'anon'), t); } catch (e) {}
  beatMarkActiveTrans();
  beatRevealed = {};
  beatRenderGame();
  beatRenderLessonVerses();
  var listen = document.getElementById('bListenLink');
  if (listen) listen.href = 'https://www.biblegateway.com/passage/?search=Matthew%205%3A1-12&version=' + t.toUpperCase();
  // Persist the choice to the database so daily emails match (best effort)
  if (userEmail && userToken && beatitudesChallenge) {
    fetch('/api/challenge-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userName, email: userEmail, track: t, challenge: BEAT_CHALLENGE, dash_token: userToken })
    }).catch(function() {});
  }
}

function beatMarkActiveTrans() {
  // Two pickers: the sidebar one during the challenge and the one on the
  // countdown screen. Both reflect the same choice.
  document.querySelectorAll('#bTransSwitch button, #bTransSwitchPre button').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-t') === beatTranslation);
  });
  // The passage on screen is in the chosen translation, so the notice follows it.
  var tr = beatPassage ? (beatPassage[beatTranslation] || beatPassage.niv) : null;
  document.querySelectorAll('#bTransCredit, #bTransCreditPre').forEach(function(el) {
    el.textContent = (tr && tr.credit) ? tr.credit : '';
  });
}

function beatOnPractice() {
  var day = beatViewingDay;
  if (day < 1) return;
  if (!beatEntries[day]) beatEntries[day] = {};
  var checked = document.getElementById('bPracticeCheckbox').checked;
  beatEntries[day].read_confirmed = checked ? 1 : 0;
  var recEl = document.getElementById('bRecordLink');
  if (recEl && day >= 30) beatEntries[day].stood_out = recEl.value;

  if (checked) beatCheckedDays.add(day); else beatCheckedDays.delete(day);
  beatRenderGrid();
  beatUpdateStats();

  var st = document.getElementById('bSaveStatus');
  if (!userEmail || !userToken) { if (st) { st.textContent = 'Preview only. Nothing is saved.'; st.className = 'save-status'; } return; }
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status saving'; }
  clearTimeout(beatSaveTimer);
  beatSaveTimer = setTimeout(function() { beatSaveEntry(day); }, 800);
}

function beatSaveEntry(day) {
  var entry = beatEntries[day] || {};
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail, token: userToken, challenge: BEAT_CHALLENGE, day: day,
      stood_out: entry.stood_out || '', read_confirmed: entry.read_confirmed === 1
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var st = document.getElementById('bSaveStatus');
      if (data && data.success) {
        if (st) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
        beatLoadData().then(function() { beatUpdateStats(); maybeShowCompletionCelebration('september-beatitudes-2026', 30, beatCheckedDays.size); });
        if (activeGroupId) loadGroupDashboard(activeGroupId);
      } else if (st) { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() {
      var st = document.getElementById('bSaveStatus');
      if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; }
    });
}

function beatBackBar() {
  var home = location.href.replace(/&/g, '&amp;').replace(/'/g, '%27');
  return '<style>.backbar{font-family:-apple-system,Inter,sans-serif;text-align:center;padding:14px 12px 4px;}' +
    '.backbar button{background:#b85638;color:#fff;border:none;border-radius:8px;padding:11px 20px;' +
    'font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;}' +
    '@media print{.backbar{display:none !important;}}</style>' +
    '<div class="backbar"><button onclick="window.close();' +
    'setTimeout(function(){location.href=\'' + home + '\';},400);">&#8592; Back to the dashboard</button></div>';
}

function beatPrintCard() {
  if (!beatPassage) return;
  var tr = beatPassage[beatTranslation] || beatPassage.niv;
  var lines = tr.verses.map(function(v) { return '<p style="margin:0 0 8px;">' + escapeText(v.text) + '</p>'; }).join('');
  var w = window.open('', '_blank');
  if (!w) return;
  w.document.write('<html><head><title>The Beatitudes</title></head><body style="font-family:Georgia,serif;max-width:520px;margin:40px auto;padding:24px;border:3px solid #c8a365;color:#1f2937;">' +
    beatBackBar() +
    '<h1 style="text-align:center;font-size:24px;">The Beatitudes</h1>' +
    '<p style="text-align:center;color:#b85638;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Matthew 5:1-12 &middot; ' + tr.label + '</p>' +
    '<div style="font-size:18px;line-height:1.7;margin-top:20px;">' + lines + '</div>' +
    '<p style="text-align:center;color:#c8a365;margin-top:24px;font-size:12px;">HeatherLynWilson.com &middot; #HideItInYourHeart</p>' +
    '<p style="text-align:center;font-size:10px;color:#999;margin-top:12px;">' + escapeText(tr.credit) + '</p>' +
    '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(function() { w.print(); }, 300);
}

function beatRunPreview(params) {
  userName = params.get('name') || 'Heather';
  beatitudesChallenge = { challenge: BEAT_CHALLENGE, track: params.get('track') || 'niv', personal_start_date: BEAT_START };
  userChallenges = [beatitudesChallenge];
  beatLoaded = true;
  beatTranslation = params.get('track') || 'niv';

  if (params.get('state') === 'pre') {
    showBeatitudesView();
    document.getElementById('bUserName').textContent = userName;
    document.getElementById('bPreChallenge').style.display = 'block';
    document.getElementById('dashLoading').style.display = 'none';
    beatStartCountdown();
    initBeatPrep();
    initPreStartFix('preFixBeat', beatStartIso);
    beatMarkActiveTrans();
    beatRenderCardGrid();
    fetch('beatitudes-passage.json').then(function(r) { return r.json(); })
      .then(function(d) { beatPassage = d; }).catch(function() {});
    previewShowGroupBox('beatitudesView');
    return;
  }

  var fakeDay = parseInt(params.get('day') || '11', 10);
  if (!Number.isFinite(fakeDay) || fakeDay < 1) fakeDay = 1;
  if (fakeDay > 30) fakeDay = 30;
  beatCurrentDay = fakeDay;
  beatViewingDay = fakeDay;
  beatCheckedDays = new Set();
  for (var d = 1; d < fakeDay; d++) beatCheckedDays.add(d);
  beatStreak = fakeDay - 1;

  showBeatitudesView();
  document.getElementById('bUserName').textContent = userName;
  document.getElementById('bActiveChallenge').style.display = 'block';
  document.getElementById('dashLoading').style.display = 'none';

  Promise.all([
    fetch('beatitudes-passage.json').then(function(r) { return r.json(); }).then(function(d) { beatPassage = d; }).catch(function() {}),
    loadPlanContent('beatitudes', 'emails-beatitudes.json').then(function(d) { beatContent = d || []; })
  ]).then(function() {
    // The day's hide level comes from the content, so it can only be read
    // once the content has loaded. The live dashboard already did this in the
    // right order; the preview was reading it too early and always got 0.
    beatHidePct = beatDefaultHide(fakeDay);
    beatMarkActiveTrans();
    beatRenderDay();
    beatUpdateStats();
  });
}
