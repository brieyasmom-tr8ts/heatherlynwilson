// Simple cookie consent banner
(function() {
  if (localStorage.getItem('cookie_ok')) return;
  var banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = '<span>This site uses cookies to measure traffic and improve your experience. <a href="/privacy.html">Privacy Policy</a></span>' +
    '<button onclick="localStorage.setItem(\'cookie_ok\',\'1\');this.parentElement.remove();">Got it</button>';
  document.body.appendChild(banner);
})();
