// ABC Bible Memory: the verse cards, practice and games.
// Lifted out of challenge/dashboard.html, unchanged.
//
// These read globals the page declares and are only called from click
// handlers or from inside other functions, never while the page parses,
// which is checked with a parser before the cut is made.

function abcLoad() {
  abcLoaded = true;
  document.getElementById('abcUserName').textContent = userName || 'friend';

  if (!abcChallenge) return;

  // Compute today's day
  var ch = abcChallenge;
  abcCurrentDay = computeDayFor(ch.personal_start_date, 56);

  initPreStartFix('preFixAbc', ch.personal_start_date);
  initPreStartFix('startFixAbc', ch.personal_start_date);

  if (abcCurrentDay === 0) {
    document.getElementById('abcPreChallenge').style.display = 'block';
    abcStartCountdown(ch.personal_start_date);
    renderRestart('abc-memory-2027');
    return;
  }

  document.getElementById('abcActiveChallenge').style.display = 'block';

  // Load ABC verse content and progress in parallel
  Promise.allSettled([
    fetch('/challenge/emails-abc.json').then(function(r) { return r.json(); }),
    userEmail && userToken ? fetch('/api/abc-progress?email=' + encodeURIComponent(userEmail) + '&token=' + encodeURIComponent(userToken)).then(function(r) { return r.json(); }) : Promise.resolve({ progress: [] })
  ]).then(function(results) {
    // Content
    var contentResult = results[0];
    if (contentResult.status === 'fulfilled' && Array.isArray(contentResult.value)) {
      abcData = contentResult.value;
    } else {
      abcData = abcFallbackData();
    }
    // Progress
    var progressResult = results[1];
    if (progressResult.status === 'fulfilled' && progressResult.value && Array.isArray(progressResult.value.progress)) {
      progressResult.value.progress.forEach(function(row) {
        abcProgress[row.letter] = row;
      });
    }
    abcRender();
    renderRestart('abc-memory-2027');
  }).catch(function() {
    abcData = abcFallbackData();
    abcRender();
    renderRestart('abc-memory-2027');
  });
}

function abcFallbackData() {
  // Minimal fallback — just the letters and review structure from emails-abc.json
  // If this fires, the user sees basic info. Full content loads from DB in production.
  return ABC_LETTERS.map(function(l) {
    var day = ABC_DAYS[l];
    var isReview = ABC_REVIEW_LETTERS.indexOf(l) !== -1;
    return { letter: l, day: day, type: isReview ? 'review' : 'verse', cue: l + '...', verse: '', reference: '', with_kids: '' };
  });
}

function abcTodayEntry() {
  if (!abcData) return null;
  // Find the entry whose day <= today, most recent
  var best = null;
  abcData.forEach(function(e) {
    if (e.day <= abcCurrentDay) {
      if (!best || e.day > best.day) best = e;
    }
  });
  return best;
}

function abcUnlockedLetters() {
  var result = [];
  ABC_WEEKS.forEach(function(w) {
    if (abcCurrentDay >= w.start) {
      result = result.concat(w.letters);
    }
  });
  return result;
}

function abcLetterWeek(letter) {
  for (var i = 0; i < ABC_WEEKS.length; i++) {
    if (ABC_WEEKS[i].letters.indexOf(letter) !== -1) return ABC_WEEKS[i].week;
  }
  return 0;
}

function abcLearnedCount() {
  return ABC_VERSE_LETTERS.filter(function(l) {
    return abcProgress[l] && abcProgress[l].status >= 2;
  }).length;
}

function abcRender() {
  var unlocked = abcUnlockedLetters();
  var unlockedVerses = unlocked.filter(function(l) { return ABC_VERSE_LETTERS.indexOf(l) !== -1; });
  var learned = abcLearnedCount();

  document.getElementById('abcHeroDay').textContent = abcCurrentDay;
  document.getElementById('abcHeroUnlocked').textContent = unlockedVerses.length;
  document.getElementById('abcHeroLearned').textContent = learned;

  // Today's entry
  var todayEntry = abcTodayEntry();
  if (todayEntry) abcRenderToday(todayEntry);

  // Card grid (replaces practice strip + alphabet grid)
  abcRenderCardGrid(unlocked);

  // Milestones
  if (learned >= 21) {
    document.getElementById('abcMilestoneCard').style.display = 'block';
    document.getElementById('abcMilestoneTitle').textContent = 'You did it!';
    document.getElementById('abcMilestoneText').textContent = '21 verses, A to Y, stored in your heart. The alphabet is yours now.';
  } else if (learned >= 14) {
    document.getElementById('abcMilestoneCard').style.display = 'block';
    document.getElementById('abcMilestoneTitle').textContent = 'Fourteen verses down.';
    document.getElementById('abcMilestoneText').textContent = 'More than half of 21. Keep going.';
  } else if (learned >= 7) {
    document.getElementById('abcMilestoneCard').style.display = 'block';
    document.getElementById('abcMilestoneTitle').textContent = 'Seven verses locked in.';
    document.getElementById('abcMilestoneText').textContent = 'A week in and it is working. Keep building.';
  }
}

function abcRenderToday(entry) {
  var isReview = entry.type === 'review' || entry.type === 'celebration';
  document.getElementById('abcTodayBadge').textContent = entry.letter;
  document.getElementById('abcTodayType').textContent = isReview ? 'REVIEW' : ('DAY ' + entry.day);

  if (isReview) {
    document.getElementById('abcTodayCue').textContent = entry.review_title || 'Review Day';
    document.getElementById('abcTodayRef').textContent = entry.review_scope ? 'Scope: ' + entry.review_scope : '';
    document.getElementById('abcVerseDisplay').style.display = 'none';
    document.getElementById('abcWithKidsBlock').style.display = 'none';
    document.getElementById('abcTodayBadge').style.background = 'var(--gold)';
    var rb = document.getElementById('abcReviewBlock');
    rb.style.display = 'block';
    document.getElementById('abcReviewTitle').textContent = entry.review_title || '';
    document.getElementById('abcReviewPrompt').textContent = entry.review_prompt || '';
    document.getElementById('abcReviewScope').textContent = entry.review_scope ? 'Letters: ' + entry.review_scope : '';
  } else {
    document.getElementById('abcTodayCue').textContent = entry.cue || (entry.letter + '...');
    document.getElementById('abcTodayRef').textContent = (entry.reference || '') + (entry.translation ? '  ' + entry.translation : '');
    document.getElementById('abcReviewBlock').style.display = 'none';
    abcSetMode('full', entry);
    if (entry.with_kids) {
      document.getElementById('abcWithKidsBlock').style.display = 'block';
      document.getElementById('abcWithKids').textContent = entry.with_kids;
      abcLoadKidsNote();
    }
  }
}

function abcKidsNoteChanged() {
  var st = document.getElementById('abcKidsNoteStatus');
  if (st) { st.textContent = 'Unsaved'; st.className = 'save-status'; }
  clearTimeout(abcKidsNoteTimer);
  abcKidsNoteTimer = setTimeout(abcSaveKidsNote, 1500);
}

function abcSaveKidsNote() {
  clearTimeout(abcKidsNoteTimer);
  var box = document.getElementById('abcKidsNote');
  var st = document.getElementById('abcKidsNoteStatus');
  var entry = abcTodayEntry();
  if (!box || !entry) return;
  if (st) { st.textContent = 'Saving...'; st.className = 'save-status'; }
  fetch('/api/challenge-journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      token: userToken,
      challenge: 'abc-memory-2027',
      day: entry.day,
      stood_out: box.value,
      god_speaking: '',
      prayer: '',
      yesterday_reflection: '',
      read_confirmed: false
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!st) return;
      if (d && d.success) { st.textContent = 'Saved'; st.className = 'save-status saved'; }
      else { st.textContent = 'Could not save. Try again.'; st.className = 'save-status'; }
    })
    .catch(function() {
      if (st) { st.textContent = 'Could not save. Check your connection.'; st.className = 'save-status'; }
    });
}

function abcLoadKidsNote() {
  var box = document.getElementById('abcKidsNote');
  var entry = abcTodayEntry();
  if (!box || !entry) return;
  box.value = '';
  var st = document.getElementById('abcKidsNoteStatus');
  if (st) { st.textContent = ''; st.className = 'save-status'; }
  fetch('/api/challenge-journal?email=' + encodeURIComponent(userEmail) +
        '&token=' + encodeURIComponent(userToken) + '&challenge=abc-memory-2027')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var rows = (d && d.entries) || [];
      for (var i = 0; i < rows.length; i++) {
        if (Number(rows[i].day) === Number(entry.day)) {
          box.value = rows[i].stood_out || '';
          break;
        }
      }
    })
    .catch(function() {});
}

function abcTestKey(e, i) {
  var k = e.key;
  if (k === ' ' || k === 'Spacebar' || e.keyCode === 32) {
    e.preventDefault();
    var next = document.getElementById('abcTI-' + (i + 1));
    if (next) { next.focus(); if (next.select) next.select(); }
    return;
  }
  if (k === 'Backspace' && !e.target.value) {
    var prev = document.getElementById('abcTI-' + (i - 1));
    if (prev) { e.preventDefault(); prev.focus(); }
  }
}

function abcRefToFirstLetters(ref) {
  var m = ref.match(/^(.*[A-Za-z])(.*)$/);
  if (!m) return ref.replace(/\d/g, '_');
  var maskedBook = m[1].replace(/[A-Za-z]+/g, function(w) {
    return w.charAt(0) + w.slice(1).replace(/./g, '_');
  });
  return maskedBook + m[2].replace(/\d/g, '_');
}

function abcNormalizeAnswer(t) {
  return String(t).trim().toLowerCase().replace(/\s+/g, ' ');
}

function abcVerseToFirstLetters(verse) {
  return verse.replace(/\b(\w)(\w*)/g, function(match, first, rest) {
    return first + rest.replace(/\S/g, '_');
  });
}

function abcSetMode(mode, entry) {
  abcVerseMode = mode;
  var todayEntry = entry || abcTodayEntry();
  if (!todayEntry || todayEntry.type === 'review' || todayEntry.type === 'celebration') return;

  var display = document.getElementById('abcVerseDisplay');
  if (!display) return;
  var verse = todayEntry.verse || '';

  if (mode === 'full') {
    display.textContent = verse;
    display.style.fontStyle = 'italic';
  } else if (mode === 'first') {
    display.textContent = abcVerseToFirstLetters(verse);
    display.style.fontStyle = 'normal';
  } else {
    display.textContent = verse.replace(/\S/g, '•');
    display.style.fontStyle = 'normal';
  }
  display.style.display = 'block';

  ['full','first','hidden'].forEach(function(m, i) {
    var btn = document.getElementById('abcModeBtn' + i);
    if (!btn) return;
    if (m === mode) {
      btn.style.background = 'var(--accent)';
      btn.style.color = 'white';
      btn.style.border = 'none';
    } else {
      btn.style.background = 'var(--bg-soft)';
      btn.style.color = 'var(--ink)';
      btn.style.border = '1px solid var(--border)';
    }
  });
}

function abcRenderCardGrid(unlockedLetters) {
  var grid = document.getElementById('abcCardGrid');
  if (!grid) return;

  var learnedCount = ABC_VERSE_LETTERS.filter(function(l) { return (abcProgress[l] || {}).status >= 2; }).length;
  var toGo = ABC_VERSE_LETTERS.filter(function(l) { return unlockedLetters.indexOf(l) !== -1 && (abcProgress[l] || {}).status < 2; }).length;

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
    '<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink);">Your verses</div>' +
    '<div style="font-size:12px;color:var(--ink-quiet);">' + learnedCount + ' learned' + (toGo > 0 ? ' &nbsp;·&nbsp; ' + toGo + ' to go' : '') + '</div>' +
  '</div>' +
  // Nothing on the grid said the pictures were tappable, so people were
  // looking at the art without ever finding the practice inside it.
  '<div style="font-size:13px;color:var(--ink-soft);margin:-6px 0 14px;">Tap any picture below to practice that verse.</div>';

  // The signup page promises that the verses you struggle with surface first.
  // "Keep practicing" is that signal, so anything carrying it gets bumped to
  // the top rather than waiting its turn in week order.
  var needWork = ABC_VERSE_LETTERS.filter(function(l) {
    return (abcProgress[l] || {}).status === 1 && unlockedLetters.indexOf(l) !== -1;
  });
  if (needWork.length) {
    html += '<div style="margin-bottom:22px;padding:14px 14px 12px;background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent);">Keep practicing</div>' +
        '<div style="font-size:11px;color:var(--ink-quiet);">' + needWork.length + (needWork.length === 1 ? ' verse' : ' verses') + '</div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--ink-soft);margin:0 0 12px;">The ones you marked keep practicing. Start here.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      needWork.map(function(letter) {
        var entry = abcData ? abcData.find(function(e) { return e.letter === letter; }) : null;
        var img = entry ? entry.image : ('/images/abc/' + letter.toLowerCase() + '.png');
        return '<div onclick="abcFlipCard(\'' + letter + '\')" style="position:relative;width:88px;height:88px;border-radius:9px;overflow:hidden;flex:none;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.12);">' +
          '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:3px 2px;text-align:center;font-size:8px;font-weight:700;background:var(--accent);color:white;">Practicing</div>' +
        '</div>';
      }).join('') +
      '</div></div>';
  }

  ABC_WEEKS.forEach(function(week) {
    var weekUnlocked = abcCurrentDay >= week.start;
    var weekLabel = 'Week ' + week.week;
    var unlocksOn = week.start === 1 ? 'Day 1' : 'Day ' + week.start;

    html += '<div style="margin-bottom:16px;">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' + (weekUnlocked ? 'var(--accent)' : 'var(--ink-quiet)') + ';margin-bottom:8px;">' +
        weekLabel + (weekUnlocked ? '' : '&ensp;<span style="font-weight:400;font-size:9px;letter-spacing:0;">unlocks ' + unlocksOn + '</span>') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">';

    week.letters.forEach(function(letter) {
      var entry = abcData ? abcData.find(function(e) { return e.letter === letter; }) : null;
      var p = abcProgress[letter] || {};
      var isReview = ABC_REVIEW_LETTERS.indexOf(letter) !== -1;
      var learned = !isReview && p.status >= 2;
      var practicing = !isReview && p.status === 1;
      var img = entry ? entry.image : ('/images/abc/' + letter.toLowerCase() + '.png');
      var clickable = weekUnlocked;

      var cardStyle = 'position:relative;width:110px;height:110px;border-radius:10px;overflow:hidden;flex:none;' +
        (clickable ? 'cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.12);' : 'opacity:0.35;');

      var onclickAttr = clickable ? ' onclick="abcFlipCard(\'' + letter + '\')" id="abc-gc-' + letter + '"' : ' id="abc-gc-' + letter + '"';

      // Status banner text + color
      var bannerBg = learned ? '#22c55e' : (practicing ? 'var(--accent)' : '');
      var bannerText = learned ? '&#10003; Learned' : (practicing ? 'Practicing' : '');
      var bannerStyle = (bannerBg ? '' : 'display:none;') + 'position:absolute;bottom:0;left:0;right:0;padding:3px 2px;text-align:center;font-size:8px;font-weight:700;letter-spacing:0.2px;background:' + (bannerBg || '#22c55e') + ';color:white;';

      html += '<div' + onclickAttr + ' style="' + cardStyle + '">' +
        '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">' +
        (weekUnlocked ? '' : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;">&#128274;</div>') +
        '<div id="abc-gb-' + letter + '" style="' + bannerStyle + '">' + bannerText + '</div>' +
      '</div>';
    });

    html += '</div></div>';
  });

  grid.innerHTML = html;
}

function abcMaybeCelebrate() {
  maybeShowCompletionCelebration('abc-memory-2027', ABC_VERSE_LETTERS.length, abcLearnedCount());
}

function abcMarkStatus(letter, status) {
  if (!abcProgress[letter]) abcProgress[letter] = {};
  abcProgress[letter].status = status;
  abcProgress[letter].last_practiced_at = new Date().toISOString();
  abcSaveProgress([{ letter: letter, status: status }]);
  abcRender();
  abcMaybeCelebrate();
}

function abcSaveProgress(updates) {
  if (!userEmail || !userToken) return;
  fetch('/api/abc-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, token: userToken, updates: updates })
  }).catch(function() {});
}

function abcFlipCard(letter) {
  var entry = abcData ? abcData.find(function(e) { return e.letter === letter; }) : null;
  if (!entry) return;
  abcActiveCard = letter;
  abcCardMode = 'full';

  // Spin the thumbnail
  var card = document.getElementById('abc-gc-' + letter);
  if (card) {
    card.classList.add('abc-card-spinning');
    card.addEventListener('animationend', function onEnd() {
      card.classList.remove('abc-card-spinning');
      card.removeEventListener('animationend', onEnd);
    });
  }

  // Build modal content
  var p = abcProgress[letter] || {};
  var isReview = ABC_REVIEW_LETTERS.indexOf(letter) !== -1;
  var isCelebration = entry.type === 'celebration';
  var week = abcLetterWeek(letter);
  var statusLabel = p.status >= 2 ? 'Learned' : p.status === 1 ? 'Practicing' : 'Not started yet';
  var statusColor = p.status >= 2 ? '#22c55e' : p.status === 1 ? 'var(--accent)' : 'var(--ink-quiet)';
  var img = entry.image || ('/images/abc/' + letter.toLowerCase() + '.png');

  var headerHtml =
    '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:20px;">' +
      '<div style="width:110px;height:110px;flex:none;border-radius:10px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.15);">' +
        '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;display:block;">' +
      '</div>' +
      '<div style="flex:1;min-width:0;padding-top:4px;">' +
        '<div style="font-size:28px;font-family:Lora,serif;font-weight:700;color:var(--ink);line-height:1;">' + letter + '</div>' +
        '<div style="font-size:14px;color:var(--accent);font-weight:600;margin-top:2px;">' + escapeHtml(entry.cue || '') + '</div>' +
        '<div style="font-size:11px;color:' + statusColor + ';font-weight:600;margin-top:4px;">' + statusLabel + '&ensp;·&ensp;Week ' + week + '</div>' +
      '</div>' +
      '<button onclick="abcCloseModal()" style="background:none;border:none;font-size:22px;color:var(--ink-quiet);cursor:pointer;padding:0 0 0 8px;line-height:1;">&times;</button>' +
    '</div>';

  var bodyHtml = '';

  if (isReview || isCelebration) {
    // Review / celebration — show prompt
    bodyHtml +=
      '<div style="background:var(--bg-warm);border-radius:10px;padding:16px;margin-bottom:20px;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px;">' + escapeHtml(entry.review_title || entry.cue || '') + '</div>' +
        '<div style="font-size:14px;color:var(--ink-soft);line-height:1.6;">' + escapeHtml(entry.review_prompt || '') + '</div>' +
        (entry.review_scope ? '<div style="font-size:11px;color:var(--ink-quiet);margin-top:8px;font-weight:600;">Letters: ' + entry.review_scope + '</div>' : '') +
      '</div>' +
      '<button onclick="abcCloseModal()" style="width:100%;padding:14px;font-size:15px;font-weight:600;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;">Got it</button>';
  } else {
    // Verse card
    var verse = entry.verse || '';
    var ref = (entry.reference || '') + (entry.translation ? '  ' + entry.translation : '');

    // Game mode toggle buttons
    bodyHtml +=
      '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
        '<button id="abcCM-full" onclick="abcSetCardMode(\'full\')" style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border-radius:7px;border:none;background:var(--accent);color:white;cursor:pointer;">Full verse</button>' +
        '<button id="abcCM-first" onclick="abcSetCardMode(\'first\')" style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border-radius:7px;border:1px solid var(--border);background:var(--bg-soft);color:var(--ink);cursor:pointer;">First letters</button>' +
        '<button id="abcCM-blank" onclick="abcSetCardMode(\'blank\')" style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border-radius:7px;border:1px solid var(--border);background:var(--bg-soft);color:var(--ink);cursor:pointer;">Test me</button>' +
      '</div>';

    // Verse display
    bodyHtml +=
      '<div id="abcCardVerseDisplay" style="font-size:16px;font-family:Lora,serif;font-style:italic;color:var(--ink);line-height:1.65;padding:16px;background:var(--bg-warm);border-radius:10px;margin-bottom:6px;">' +
        escapeHtml(verse) +
      '</div>' +
      '<div id="abcCardRefDisplay" style="font-size:13px;color:var(--ink-quiet);text-align:right;margin-bottom:16px;">' + escapeHtml(ref) + '</div>';

    // Memory anchor
    if (entry.mnemonic) {
      bodyHtml +=
        '<div style="background:#fef3c7;border-radius:10px;padding:12px 14px;margin-bottom:20px;display:flex;gap:10px;align-items:flex-start;">' +
          '<div style="font-size:20px;flex:none;">&#9995;</div>' +
          '<div>' +
            '<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#92400e;text-transform:uppercase;margin-bottom:4px;">Memory anchor</div>' +
            '<div style="font-size:13px;color:#78350f;line-height:1.5;">' + escapeHtml(entry.mnemonic) + '</div>' +
          '</div>' +
        '</div>';
    }

    // Action buttons
    bodyHtml +=
      '<div id="abcCardBtnRow" style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<button onclick="abcMarkStatusFromCard(1)" style="flex:1;padding:13px 8px;font-size:14px;font-weight:600;background:var(--bg-soft);color:var(--ink);border:1.5px solid var(--border);border-radius:10px;cursor:pointer;">Keep practicing</button>' +
        '<button onclick="abcMarkStatusFromCard(2)" style="flex:1;padding:13px 8px;font-size:14px;font-weight:600;background:#22c55e;color:white;border:none;border-radius:10px;cursor:pointer;">Learned it &#10003;</button>' +
      '</div>';
  }

  var modal = document.getElementById('abcFlipModal');
  var sheet = document.getElementById('abcFlipSheet');
  var content = document.getElementById('abcFlipContent');
  content.innerHTML = headerHtml + bodyHtml;
  modal.style.display = 'block';
  sheet.classList.add('abc-sheet-open');
  sheet.addEventListener('animationend', function onEnd() {
    sheet.classList.remove('abc-sheet-open');
    sheet.removeEventListener('animationend', onEnd);
  });
}

function abcCloseModal() {
  var modal = document.getElementById('abcFlipModal');
  if (modal) modal.style.display = 'none';
  abcActiveCard = null;
}

function abcSetCardMode(mode) {
  abcCardMode = mode;
  var entry = abcData ? abcData.find(function(e) { return e.letter === abcActiveCard; }) : null;
  if (!entry || !entry.verse) return;
  var el = document.getElementById('abcCardVerseDisplay');
  if (!el) return;
  var verse = entry.verse;

  // The reference practices right along with the verse. Knowing the words but
  // not where they live is half a memory.
  var refEl = document.getElementById('abcCardRefDisplay');
  var reference = entry.reference || '';
  var transSuffix = entry.translation ? '\u2002' + entry.translation : '';

  if (mode === 'full') {
    el.innerHTML = '';
    el.textContent = verse;
    el.style.fontStyle = 'italic';
    el.style.fontFamily = 'Lora, serif';
    if (refEl) {
      refEl.innerHTML = '';
      refEl.textContent = reference + transSuffix;
      refEl.style.fontFamily = 'inherit';
    }
  } else if (mode === 'first') {
    el.innerHTML = '';
    el.textContent = abcVerseToFirstLetters(verse);
    el.style.fontStyle = 'normal';
    el.style.fontFamily = 'monospace';
    if (refEl) {
      refEl.innerHTML = '';
      refEl.textContent = abcRefToFirstLetters(reference) + transSuffix;
      refEl.style.fontFamily = 'monospace';
    }
  } else {
    // Test me: each word becomes a text input
    var tokens = verse.split(/(\s+)/); // preserve spaces
    var wordIndex = 0;
    var html = '<div style="line-height:2.4;font-family:Lora,serif;font-size:15px;color:var(--ink);">';
    tokens.forEach(function(token) {
      if (/^\s+$/.test(token)) {
        html += ' ';
        return;
      }
      // Strip trailing punctuation to get the bare word for comparison
      var punct = (token.match(/[.,;:!?"]+$/) || [''])[0];
      var bare = token.slice(0, token.length - punct.length);
      var hint = bare.charAt(0);
      var w = Math.max(2, bare.length);
      html += '<input id="abcTI-' + wordIndex + '" data-ans="' + bare.toLowerCase() + '" ' +
        'placeholder="' + hint + '" ' +
        'style="display:inline-block;width:' + (w * 0.62 + 0.3) + 'em;min-width:1.6em;border:none;border-bottom:2px solid var(--border);' +
        'background:transparent;font-family:Lora,serif;font-size:15px;padding:0 1px;text-align:center;outline:none;vertical-align:baseline;" ' +
        'oninput="this.style.borderBottomColor=\'var(--border)\';this.style.color=\'var(--ink)\';" ' +
        'onkeydown="abcTestKey(event, ' + wordIndex + ')" />' + punct;
      wordIndex++;
    });
    html += '</div>';
    // The reference gets its own box and counts toward the score.
    var refIndex = wordIndex;
    html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--ink-quiet);margin-bottom:6px;">Where is it from?</div>' +
      '<input id="abcTI-' + refIndex + '" data-ans="' + escapeHtml(abcNormalizeAnswer(entry.reference || '')) + '" ' +
        'placeholder="Book chapter:verse" ' +
        'style="width:100%;box-sizing:border-box;border:none;border-bottom:2px solid var(--border);background:transparent;' +
        'font-family:Lora,serif;font-size:15px;padding:4px 2px;outline:none;" ' +
        'oninput="this.style.borderBottomColor=\'var(--border)\';this.style.color=\'var(--ink)\';" />' +
    '</div>';
    wordIndex++;
    html += '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button onclick="abcCheckAnswers(' + wordIndex + ')" style="flex:1;padding:10px;font-size:13px;font-weight:600;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;">Check my answers</button>' +
      '<button onclick="abcClearTest(' + wordIndex + ')" style="padding:10px 14px;font-size:13px;background:var(--bg-soft);color:var(--ink);border:1px solid var(--border);border-radius:8px;cursor:pointer;">Clear</button>' +
    '</div>' +
    '<div id="abcTestScore" style="text-align:center;margin-top:10px;font-size:14px;font-weight:700;color:var(--ink-quiet);min-height:1.4em;"></div>';
    el.innerHTML = html;
    el.style.fontStyle = 'normal';
    el.style.fontFamily = 'inherit';
    if (refEl) { refEl.innerHTML = ''; refEl.textContent = transSuffix ? transSuffix.trim() : ''; refEl.style.fontFamily = 'inherit'; }
    // Focus first input
    var first = document.getElementById('abcTI-0');
    if (first) setTimeout(function() { first.focus(); }, 50);
  }

  ['full','first','blank'].forEach(function(m) {
    var btn = document.getElementById('abcCM-' + m);
    if (!btn) return;
    if (m === mode) {
      btn.style.background = 'var(--accent)';
      btn.style.color = 'white';
      btn.style.border = 'none';
    } else {
      btn.style.background = 'var(--bg-soft)';
      btn.style.color = 'var(--ink)';
      btn.style.border = '1px solid var(--border)';
    }
  });
}

function abcCheckAnswers(count) {
  var correct = 0;
  for (var i = 0; i < count; i++) {
    var inp = document.getElementById('abcTI-' + i);
    if (!inp) continue;
    var typed = abcNormalizeAnswer(inp.value).replace(/[.,;:!?"]+$/, '');
    var expected = inp.getAttribute('data-ans') || '';
    if (typed === expected) {
      correct++;
      inp.style.borderBottomColor = '#22c55e';
      inp.style.color = '#22c55e';
    } else {
      inp.style.borderBottomColor = '#ef4444';
      inp.style.color = '#ef4444';
    }
  }
  var score = document.getElementById('abcTestScore');
  if (score) {
    if (correct === count) {
      score.textContent = 'Perfect! Verse and reference both right.';
      score.style.color = '#22c55e';
    } else {
      score.textContent = correct + ' of ' + count + ' correct, keep going!';
      score.style.color = 'var(--accent)';
    }
  }
}

function abcClearTest(count) {
  for (var i = 0; i < count; i++) {
    var inp = document.getElementById('abcTI-' + i);
    if (!inp) continue;
    inp.value = '';
    inp.style.borderBottomColor = 'var(--border)';
    inp.style.color = 'var(--ink)';
  }
  var score = document.getElementById('abcTestScore');
  if (score) score.textContent = '';
  var first = document.getElementById('abcTI-0');
  if (first) first.focus();
}

function abcMarkStatusFromCard(status) {
  var letter = abcActiveCard;
  if (!letter) return;
  if (!abcProgress[letter]) abcProgress[letter] = {};
  abcProgress[letter].status = status;
  abcProgress[letter].last_practiced_at = new Date().toISOString();
  abcSaveProgress([{ letter: letter, status: status }]);

  // Show brief success state in modal, then close
  var row = document.getElementById('abcCardBtnRow');
  if (row) {
    var msg = status >= 2
      ? '<div style="text-align:center;padding:14px;font-size:15px;font-weight:700;color:#22c55e;">&#10003; Learned it!</div>'
      : '<div style="text-align:center;padding:14px;font-size:15px;font-weight:700;color:var(--accent);">Saved — keep going!</div>';
    row.outerHTML = msg;
  }

  // Update the grid card thumbnail immediately
  var banner = document.getElementById('abc-gb-' + letter);
  if (banner) {
    banner.style.display = '';
    banner.style.background = status >= 2 ? '#22c55e' : 'var(--accent)';
    banner.innerHTML = status >= 2 ? '&#10003; Learned' : 'Practicing';
  }

  setTimeout(function() {
    abcCloseModal();
    abcRender();
    abcMaybeCelebrate();
  }, 1200);
}

function abcStartCountdown(startIso) {
  if (!startIso) return;
  var titleEl = document.getElementById('abcPreTitle');
  if (titleEl) titleEl.textContent = 'Your challenge starts ' + formatStartDate(startIso);
  function tick() {
    var now = new Date();
    var start = new Date(startIso + 'T00:00:00');
    var diff = start - now;
    if (diff <= 0) { location.reload(); return; }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    document.getElementById('abcCdDays').textContent = d;
    document.getElementById('abcCdHours').textContent = h;
    document.getElementById('abcCdMins').textContent = m;
  }
  tick();
  setInterval(tick, 60000);
}

function abcRunPreview(params) {
  var fakeDay = parseInt(params.get('day') || '10', 10);
  if (!Number.isFinite(fakeDay) || fakeDay < 1) fakeDay = 10;
  if (fakeDay > 56) fakeDay = 56;
  userName = params.get('name') || 'Heather';
  abcChallenge = { challenge: 'abc-memory-2027', track: 'abc', personal_start_date: '2026-01-01' };
  abcCurrentDay = fakeDay;
  // Seed some fake progress for realism
  ['A','B','C','D','E'].forEach(function(l) {
    abcProgress[l] = { status: 2, last_practiced_at: new Date(Date.now() - 86400000 * 3).toISOString() };
  });
  abcProgress['F'] = { status: 1, last_practiced_at: new Date(Date.now() - 86400000).toISOString() };
  abcProgress['G'] = { status: 0, last_practiced_at: null };
  document.getElementById('abcUserName').textContent = userName;
  document.getElementById('abcView').style.display = 'block';
  document.getElementById('abcActiveChallenge').style.display = 'block';
  document.getElementById('abcBackNav').style.display = 'none';
  document.getElementById('dashLoading').style.display = 'none';
  fetch('/challenge/emails-abc.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      abcData = data;
      abcRender();
    })
    .catch(function() {
      abcData = abcFallbackData();
      abcRender();
    });
}
