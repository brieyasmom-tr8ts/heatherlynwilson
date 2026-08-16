
// Lead magnet popup
var lmPopup = document.getElementById('leadMagnetPopup');
var lmForm = document.getElementById('homeLeadMagnet');

// Show popup after 8 seconds if not already subscribed or dismissed
if (!localStorage.getItem('hlw_subscribed') && !sessionStorage.getItem('hlw_popup_closed')) {
  setTimeout(function() {
    if (lmPopup) lmPopup.style.display = 'block';
  }, 8000);
}

// Close button
document.getElementById('leadMagnetClose').addEventListener('click', function() {
  lmPopup.style.display = 'none';
  sessionStorage.setItem('hlw_popup_closed', '1');
});

// Popup form handler
if (lmForm) {
  lmForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var email = lmForm.querySelector('input[type="email"]').value.trim();
    var btn = lmForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    fetch('/api/subscribe', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, source: 'lead-magnet'})
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      if(typeof fbq!=='undefined')fbq('track','Subscribe');
      btn.textContent = 'Sent!';
      lmForm.querySelector('input[type="email"]').value = '';
      var status = document.getElementById('homeLeadStatus');
      if (status) {
        status.textContent = 'Check your inbox! Your guide is on the way.';
        status.style.color = '#c8a365';
        status.style.display = 'block';
      }
      localStorage.setItem('hlw_subscribed', '1');
      setTimeout(function() { lmPopup.style.display = 'none'; }, 4000);
    })
    .catch(function() {
      btn.textContent = 'Get the Guide';
      btn.disabled = false;
    });
  });
}

// Inline email capture form handler
var inlineForm = document.getElementById('inlineLeadForm');
if (inlineForm) {
  inlineForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var email = inlineForm.querySelector('input[type="email"]').value.trim();
    var btn = inlineForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    fetch('/api/subscribe', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, source: 'lead-magnet-inline'})
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      if(typeof fbq!=='undefined')fbq('track','Subscribe');
      btn.textContent = 'Sent!';
      inlineForm.querySelector('input[type="email"]').value = '';
      var status = document.getElementById('inlineLeadStatus');
      if (status) {
        status.textContent = 'Check your inbox! Your guide is on the way.';
        status.style.color = '#c8a365';
        status.style.display = 'block';
      }
      localStorage.setItem('hlw_subscribed', '1');
      // Also hide popup if visible
      if (lmPopup) lmPopup.style.display = 'none';
    })
    .catch(function() {
      btn.textContent = 'Get the Guide';
      btn.disabled = false;
    });
  });
}
