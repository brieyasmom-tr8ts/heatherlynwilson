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
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl) + '" target="_blank" rel="noopener" class="share-link">Share on Facebook</a>' +
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
    '<textarea id="commentText" placeholder="Leave a comment..." required maxlength="2000" rows="3"></textarea>' +
    '<button type="submit">Post Comment</button>' +
    '</form>' +
    '</div>' +

    '</div>';

  var likeBtn = document.getElementById("likeBtn");
  var likeCount = document.getElementById("likeCount");
  var commentForm = document.getElementById("commentForm");
  var commentsList = document.getElementById("commentsList");
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
    fetch("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        likeCount.textContent = data.count;
        likeBtn.classList.add("liked");
        localStorage.setItem(likedKey, "1");
      })
      .catch(function () {});
  });

  commentForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("commentName").value.trim();
    var comment = document.getElementById("commentText").value.trim();
    if (!name || !comment) return;

    var btn = commentForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Posting...";

    fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug, name: name, comment: comment }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderComments(data.comments);
        commentForm.reset();
        btn.disabled = false;
        btn.textContent = "Post Comment";
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Post Comment";
      });
  });

  function loadComments() {
    fetch("/api/comments?slug=" + slug)
      .then(function (r) { return r.json(); })
      .then(function (data) { renderComments(data.comments); })
      .catch(function () {});
  }

  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first.</p>';
      return;
    }
    commentsList.innerHTML = comments
      .map(function (c) {
        var date = new Date(c.created_at + "Z");
        var dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        var deleteBtn = isAdmin ? ' <button class="delete-comment" data-id="' + c.id + '" style="background:none;border:none;color:#c00;cursor:pointer;font-size:12px;margin-left:8px;">delete</button>' : '';
        return (
          '<div class="comment">' +
          '<div class="comment-meta"><strong>' + escapeHtml(c.name) + '</strong><span>' + dateStr + deleteBtn + '</span></div>' +
          '<p>' + escapeHtml(c.comment) + '</p>' +
          '</div>'
        );
      })
      .join("");

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
