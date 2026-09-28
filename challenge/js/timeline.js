// The story timeline for Beginnings.
//
// Markers come from the registry, never from the email content. Content fields
// that are not columns of challenge_emails get dropped the moment a plan is
// seeded into D1, which is how 1 Peter's "chapters" key quietly stopped
// existing. check_site fails the build if a marker stops landing on a real
// reading day.
//
// Fourteen markers is close to two phone screens, so the dashboard shows the
// three around where she is and the rest open from the button.

function tlMarkers(challengeId) {
  var reg = (typeof CHALLENGE_REGISTRY !== 'undefined' && CHALLENGE_REGISTRY) || null;
  if (!reg || !reg.challenges) return [];
  var c = reg.challenges.filter(function(x) { return x.id === challengeId; })[0];
  return (c && c.timeline) || [];
}

// Which markers to show when collapsed: the last one reached and the next two,
// so there is always something ahead to walk towards.
//
// The start is clamped so the window always holds three. Without that, the end
// of the month showed a single marker and looked like the timeline had broken:
// at the last marker there is no "next two" to take.
function tlWindow(marks, day) {
  var SHOW = 3;
  if (marks.length <= SHOW + 1) return marks.slice();
  var reached = -1;
  for (var i = 0; i < marks.length; i++) { if (day >= marks[i].day) reached = i; }
  var start = Math.max(0, Math.min(reached, marks.length - SHOW));
  return marks.slice(start, start + SHOW);
}

function tlRenderStops(marks, day, hideSealedNames) {
  var html = '';
  for (var i = 0; i < marks.length; i++) {
    var m = marks[i];
    var done = day >= m.day;
    // "Here" is the furthest marker she has actually reached.
    var isHere = done && (i === marks.length - 1 || day < marks[i + 1].day);
    var cls = 'tl-stop' + (i % 2 ? ' right' : '') + (isHere ? ' here' : (done ? ' done' : ''));
    // A sealed marker keeps its name back. Not knowing what day 15 is called
    // is a small pull forward, and this is a story.
    var name = done || !hideSealedNames ? m.name : 'Day ' + m.day;
    var when = done ? 'Day ' + m.day : '';
    html += '<div class="' + cls + '">' +
      '<div class="tl-dot"></div>' +
      '<div><p class="tl-name">' + escapeText(name) + '</p>' +
      (when ? '<p class="tl-when">' + when + '</p>' : '') + '</div>' +
      '</div>';
  }
  return html;
}

// tlExpanded is declared in dashboard.html with the other view state. These
// per-challenge files load before the main script, so they only declare
// functions; check_site fails the build on anything that runs at load.
function tlRender(challengeId, day, total) {
  var host = document.getElementById('tlCard');
  if (!host) return;
  // Remember what we drew, so the button can redraw without the page having to
  // hand it the arguments again.
  tlLast = { challengeId: challengeId, day: day, total: total };
  var marks = tlMarkers(challengeId);
  if (!marks.length) { host.style.display = 'none'; return; }
  host.style.display = 'block';

  // The last day IS the whole story, so open the path rather than making her
  // press a button to see what she just finished.
  var finished = day >= total;
  var shown = (tlExpanded || finished) ? marks : tlWindow(marks, day);
  var reached = marks.filter(function(m) { return day >= m.day; }).length;
  // Days read, not markers reached. Seven of fourteen markers would claim half
  // the story on day 14 of 31, which is not true.
  var pct = Math.max(0, Math.min(100, Math.round((Math.min(day, total) / total) * 100)));

  document.getElementById('tlFill').style.width = pct + '%';
  document.getElementById('tlPct').textContent = pct + '%';
  document.getElementById('tlStops').innerHTML = tlRenderStops(shown, day, true);

  var btn = document.getElementById('tlMore');
  if (btn) {
    var showingAll = shown.length === marks.length;
    btn.style.display = (showingAll && !tlExpanded) ? 'none' : 'block';
    btn.textContent = showingAll
      ? 'Show less'
      : 'See the whole story (' + reached + ' of ' + marks.length + ')';
  }
}

function tlToggle() {
  if (!tlLast) return;
  tlExpanded = !tlExpanded;
  tlRender(tlLast.challengeId, tlLast.day, tlLast.total);
}
