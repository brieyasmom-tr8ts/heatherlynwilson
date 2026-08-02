// Gentle email typo catcher. When someone types a close miss like
// name@gnail.com or name@gmail.om, a small "Did you mean" hint appears
// under the field. Tapping it fixes the address. No hint, no friction
// for everyone who typed it right.
(function () {
  // Misspelled providers seen in real signups, mapped to what they meant
  var DOMAIN_FIX = {
    'gnail': 'gmail', 'gmial': 'gmail', 'gmal': 'gmail', 'gamil': 'gmail',
    'gmaill': 'gmail', 'gmali': 'gmail', 'gimail': 'gmail', 'gmil': 'gmail',
    'hotmial': 'hotmail', 'hotmal': 'hotmail', 'hotmali': 'hotmail', 'hotnail': 'hotmail',
    'yaho': 'yahoo', 'yahooo': 'yahoo', 'yhaoo': 'yahoo', 'yahho': 'yahoo',
    'icoud': 'icloud', 'iclould': 'icloud', 'icluod': 'icloud',
    'outlok': 'outlook', 'outllok': 'outlook', 'outook': 'outlook',
    'aoll': 'aol', 'comcat': 'comcast', 'comcst': 'comcast',
    'verzion': 'verizon', 'verixon': 'verizon'
  };
  // Endings that are never what people mean. Fixed on any domain.
  var TLD_FIX = {
    'om': 'com', 'cm': 'com', 'con': 'com', 'vom': 'com', 'xom': 'com',
    'comm': 'com', 'cmo': 'com', 'ocm': 'com', 'coom': 'com',
    'nte': 'net', 'ent': 'net'
  };
  // ".co" is a real ending, so only fix it on big mail providers
  var KNOWN = ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud', 'comcast', 'verizon', 'att', 'msn', 'live', 'protonmail'];

  function suggest(email) {
    var m = String(email || '').trim().match(/^([^@\s]+)@([^@\s.]+)\.([a-zA-Z]+)$/);
    if (!m) return null;
    var local = m[1];
    var dom = m[2].toLowerCase();
    var tld = m[3].toLowerCase();
    var newDom = DOMAIN_FIX[dom] || dom;
    var newTld = TLD_FIX[tld] || tld;
    if (newTld === tld && tld === 'co' && KNOWN.indexOf(newDom) !== -1) newTld = 'com';
    if (DOMAIN_FIX[dom] && KNOWN.indexOf(newDom) !== -1 && newTld !== 'com' && newTld !== 'net') newTld = 'com';
    if (newDom === dom && newTld === tld) return null;
    return local + '@' + newDom + '.' + newTld;
  }

  function attach(input) {
    if (input.dataset.emailHint) return;
    input.dataset.emailHint = '1';
    var hint = document.createElement('p');
    hint.style.cssText = 'display:none;font-size:13px;color:#8d3e26;background:rgba(255,255,255,0.95);border:1px solid #e5e0d5;border-radius:6px;padding:7px 12px;margin:6px 0 0;cursor:pointer;line-height:1.5;text-align:left;flex-basis:100%;';
    hint.setAttribute('role', 'button');
    // In a side-by-side form (input next to its button in a flex row) the
    // hint goes below the whole row, not squeezed into it
    var anchor = input;
    try {
      var ps = window.getComputedStyle(input.parentNode);
      if (ps.display.indexOf('flex') !== -1 && ps.flexDirection.indexOf('column') === -1) {
        anchor = input.parentNode;
      }
    } catch (e) {}
    anchor.parentNode.insertBefore(hint, anchor.nextSibling);

    function check() {
      var s = suggest(input.value);
      if (s) {
        hint.innerHTML = 'Did you mean <b style="text-decoration:underline;">' + s.replace(/</g, '&lt;') + '</b>? Tap to use it.';
        hint.style.display = 'block';
        hint.onclick = function () {
          input.value = s;
          hint.style.display = 'none';
          try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
          try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        };
      } else {
        hint.style.display = 'none';
      }
    }
    input.addEventListener('blur', check);
    input.addEventListener('input', function () {
      // Only re-check while typing if a hint is already showing, so it
      // clears itself the moment they fix the address by hand
      if (hint.style.display === 'block') check();
    });
  }

  function init() {
    var inputs = document.querySelectorAll('input[type="email"]');
    for (var i = 0; i < inputs.length; i++) attach(inputs[i]);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
