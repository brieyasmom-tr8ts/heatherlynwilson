// Blog post engagement: likes, comments, share
(function () {
  var slug = window.location.pathname.replace(/^\/blog\//, "").replace(/\.html$/, "");
  var pageUrl = window.location.href;
  var pageTitle = document.title;

  // Find insertion point
  var backLink = document.querySelector(".back-to-blog");
  if (!backLink) return;

  var container = document.createElement("div");
  container.className = "engagement";
  backLink.parentNode.insertBefore(container, backLink);

  container.innerHTML =
    '<div class="engagement-inner">' +

    // Share row
    '<div class="engage-actions">' +
    '<button class="like-btn" id="likeBtn">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' +
    ' <span id="likeCount">0</span>' +
    '</button>' +
    '<div class="share-links">' +
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl) + '" target="_blank" rel="noopener" class="share-link" id="shareLink">Share</a>' +
    '<a href="https://twitter.com/intent/tweet?url=' + encodeURIComponent(pageUrl) + '&text=' + encodeURIComponent(pageTitle) + '" target="_blank" rel="noopener" class="share-link">Share on X</a>' +
    '<a href="mailto:?subject=' + encodeURIComponent(pageTitle) + '&body=' + encodeURIComponent("I thought you might like this: " + pageUrl) + '" class="share-link">Email to a friend</a>' +
    '</div>' +
    '</div>' +

    // Comments
    '<div class="comments-section">' +
    '<h3>Comments</h3>' +
    '<div id="commentsList"></div>' +
    '<form id="commentForm" class="comment-form">' +
    '<input type="text" id="commentName" placeholder="Your name" required maxlength="100">' +
    '<input type="email" id="commentEmail" placeholder="Your email (not shown publicly)" required>' +
    '<label class="subscribe-check" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-soft);cursor:pointer;margin:2px 0 4px;"><input type="checkbox" id="commentSubscribe" style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer;"> Get new posts delivered to your inbox</label>' +
    '<textarea id="commentText" placeholder="Leave a comment..." required maxlength="2000" rows="3"></textarea>' +
    '<div class="cf-turnstile" data-sitekey="0x4AAAAAADWH0XKiWPSwgeOy" data-size="compact"></div>' +
    '<button type="submit">Post Comment</button>' +
    '</form>' +
    '</div>' +

    '</div>';

  var likeBtn = document.getElementById("likeBtn");
  var likeCount = document.getElementById("likeCount");
  var commentForm = document.getElementById("commentForm");
  var commentsList = document.getElementById("commentsList");

  // Share: on phones this opens the native share sheet (pick any app).
  // On desktop browsers without it, fall back to Facebook's share page.
  var shareLink = document.getElementById("shareLink");
  if (shareLink && navigator.share) {
    shareLink.addEventListener("click", function (e) {
      e.preventDefault();
      navigator.share({ title: pageTitle, url: pageUrl }).catch(function () {});
    });
  }
  // Admin mode: add ?admin=1 to URL, enter password once
  var isAdmin = false;
  var adminKey = localStorage.getItem("admin_key");
  if (window.location.search.indexOf("admin=1") > -1 && !adminKey) {
    var key = prompt("Enter admin password:");
    if (key) {
      localStorage.setItem("admin_key", key);
      adminKey = key;
    }
  }
  if (adminKey) isAdmin = true;

  var likedKey = "liked_" + slug;

  if (localStorage.getItem(likedKey)) {
    likeBtn.classList.add("liked");
  }

  // Load likes
  fetch("/api/like?slug=" + slug)
    .then(function (r) { return r.json(); })
    .then(function (data) { likeCount.textContent = data.count || 0; })
    .catch(function () {});

  // Load comments
  loadComments();

  likeBtn.addEventListener("click", function () {
    if (localStorage.getItem(likedKey)) return;
    // Set the flag and disable the button BEFORE the request fires so a
    // rapid second click cannot send a second like before the first responds.
    localStorage.setItem(likedKey, "1");
    likeBtn.classList.add("liked");
    likeBtn.disabled = true;
    fetch("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        likeCount.textContent = data.count;
      })
      .catch(function () {
        // Roll back if the request failed so they can try again
        localStorage.removeItem(likedKey);
        likeBtn.classList.remove("liked");
        likeBtn.disabled = false;
      });
  });

  commentForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("commentName").value.trim();
    var email = document.getElementById("commentEmail").value.trim();
    var comment = document.getElementById("commentText").value.trim();
    if (!name || !email || !comment) return;

    var turnstileInput = commentForm.querySelector('[name="cf-turnstile-response"]');
    var turnstileToken = turnstileInput ? turnstileInput.value : "";

    var btn = commentForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Posting...";

    var wantsSubscribe = document.getElementById("commentSubscribe").checked;

    fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug, name: name, email: email, comment: comment, "cf-turnstile-response": turnstileToken }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.error) {
          // Tell them what happened and keep their words in the box
          btn.disabled = false;
          btn.textContent = "Post Comment";
          showCommentError(data.error);
          if (window.turnstile) try { turnstile.reset(); } catch (err) {}
          return;
        }
        renderComments(data.comments);
        showCommentError("");
        if (wantsSubscribe) {
          fetch("/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email, source: "comment" }),
          }).catch(function () {});
        }
        commentForm.reset();
        if (window.turnstile) turnstile.reset();
        btn.disabled = false;
        btn.textContent = "Post Comment";
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Post Comment";
      });
  });

  function showCommentError(msg) {
    var el = document.getElementById("commentError");
    if (!el) {
      el = document.createElement("p");
      el.id = "commentError";
      el.style.cssText = "color:#8d3e26;font-size:14px;margin:8px 0 0;";
      commentForm.appendChild(el);
    }
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  // The captcha widget arrives by script injection, so its auto-render can
  // lose the race with this form being built. Render it by hand once the
  // script is ready; without it, comments were rejected silently.
  (function ensureTurnstile() {
    var tsEl = commentForm.querySelector(".cf-turnstile");
    if (!tsEl) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (tsEl.childElementCount > 0) { clearInterval(timer); return; }
      if (window.turnstile && window.turnstile.render) {
        try { turnstile.render(tsEl); } catch (e) {}
        clearInterval(timer);
      } else if (tries > 50) {
        clearInterval(timer);
      }
    }, 200);
  })();

  function loadComments() {
    fetch("/api/comments?slug=" + slug)
      .then(function (r) { return r.json(); })
      .then(function (data) { renderComments(data.comments); })
      .catch(function () {});
  }

  // ─── Comment hearts ────────────────────────────────────────────────────────
  // Each browser gets a random id; the server allows one heart per id per
  // comment, and localStorage remembers what this reader already hearted so
  // the little heart stays red on return visits.
  var heartVid = localStorage.getItem("hlw_heart_vid");
  if (!heartVid) {
    heartVid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
      "v" + Date.now() + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("hlw_heart_vid", heartVid);
  }
  function heartedSet() {
    try { return JSON.parse(localStorage.getItem("hearted_comments") || "[]"); } catch (e) { return []; }
  }
  function setHearted(id, on) {
    var s = heartedSet().filter(function (x) { return x !== id; });
    if (on) s.push(id);
    localStorage.setItem("hearted_comments", JSON.stringify(s.slice(-500)));
  }

  // Styles ride along with the script so no stylesheet edits are needed
  (function () {
    var st = document.createElement("style");
    st.textContent =
      ".comment-heart{display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;padding:2px 4px;margin-top:6px;font-family:Inter,sans-serif;font-size:13px;color:#6b7280;transition:color 0.15s;}" +
      ".comment-heart svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;transition:transform 0.15s;}" +
      ".comment-heart:hover{color:#b85638;}" +
      ".comment-heart.hearted{color:#b85638;}" +
      ".comment-heart.hearted svg{fill:#b85638;transform:scale(1.15);}";
    document.head.appendChild(st);
  })();

  var HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';

  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first.</p>';
      return;
    }
    var hearted = heartedSet();
    commentsList.innerHTML = comments
      .map(function (c) {
        var date = new Date(c.created_at + "Z");
        var dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        var deleteBtn = isAdmin ? ' <button class="delete-comment" data-id="' + c.id + '" style="background:none;border:none;color:#c00;cursor:pointer;font-size:12px;margin-left:8px;">delete</button>' : '';
        var isHearted = hearted.indexOf(c.id) > -1;
        var n = c.hearts || 0;
        return (
          '<div class="comment">' +
          '<div class="comment-meta"><strong>' + escapeHtml(c.name) + '</strong><span>' + dateStr + deleteBtn + '</span></div>' +
          '<p>' + escapeHtml(c.comment) + '</p>' +
          '<button type="button" class="comment-heart' + (isHearted ? " hearted" : "") + '" data-id="' + c.id + '" aria-label="Heart this comment">' +
          HEART_SVG + '<span class="heart-n">' + (n > 0 ? n : "") + '</span>' +
          '</button>' +
          '</div>'
        );
      })
      .join("");

    // Heart toggles: instant on screen, saved in the background
    commentsList.querySelectorAll(".comment-heart").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.dataset.id, 10);
        var on = !btn.classList.contains("hearted");
        btn.classList.toggle("hearted", on);
        var nEl = btn.querySelector(".heart-n");
        var n = parseInt(nEl.textContent || "0", 10) + (on ? 1 : -1);
        nEl.textContent = n > 0 ? n : "";
        setHearted(id, on);
        fetch("/api/comment-heart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment_id: id, visitor: heartVid, on: on }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && typeof data.count === "number") {
              nEl.textContent = data.count > 0 ? data.count : "";
            }
          })
          .catch(function () {});
      });
    });

    // Attach delete handlers
    if (isAdmin) {
      commentsList.querySelectorAll('.delete-comment').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (!confirm('Delete this comment?')) return;
          var id = btn.dataset.id;
          fetch('/api/comments?id=' + id + '&key=' + encodeURIComponent(adminKey), { method: 'DELETE' })
            .then(function() { loadComments(); });
        });
      });
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
