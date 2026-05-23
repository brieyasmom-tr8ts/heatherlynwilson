// Blog post engagement: likes, comments, share
(function () {
  var slug = window.location.pathname.replace(/^\/blog\//, "").replace(/\.html$/, "");
  var pageUrl = window.location.href;
  var pageTitle = document.title;

  // Find insertion point (after post-body, before post-nav or back-to-blog)
  var postBody = document.querySelector(".post-body");
  if (!postBody) return;

  var container = document.createElement("div");
  container.className = "engagement";
  postBody.parentNode.insertBefore(container, postBody.nextSibling);

  // Build UI
  container.innerHTML =
    '<div class="wrap-narrow">' +
    // Like + Share row
    '<div class="engage-row">' +
    '<button class="like-btn" id="likeBtn">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' +
    '<span id="likeCount">0</span>' +
    '</button>' +
    '<div class="share-btns">' +
    '<span class="share-label">Share</span>' +
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl) + '" target="_blank" rel="noopener" class="share-btn" title="Share on Facebook">Facebook</a>' +
    '<a href="https://twitter.com/intent/tweet?url=' + encodeURIComponent(pageUrl) + '&text=' + encodeURIComponent(pageTitle) + '" target="_blank" rel="noopener" class="share-btn" title="Share on X">X</a>' +
    '<a href="mailto:?subject=' + encodeURIComponent(pageTitle) + '&body=' + encodeURIComponent("Check this out: " + pageUrl) + '" class="share-btn" title="Share via email">Email</a>' +
    '</div>' +
    '</div>' +
    // Comments section
    '<div class="comments-section">' +
    '<h3 class="comments-heading">Leave a Comment</h3>' +
    '<form id="commentForm" class="comment-form">' +
    '<input type="text" id="commentName" placeholder="Your name" required maxlength="100">' +
    '<textarea id="commentText" placeholder="Your comment" required maxlength="2000"></textarea>' +
    '<button type="submit">Post Comment</button>' +
    '</form>' +
    '<div id="commentsList" class="comments-list"></div>' +
    '</div>' +
    '</div>';

  var likeBtn = document.getElementById("likeBtn");
  var likeCount = document.getElementById("likeCount");
  var commentForm = document.getElementById("commentForm");
  var commentsList = document.getElementById("commentsList");
  var likedKey = "liked_" + slug;

  // Check if already liked
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

  // Like handler
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

  // Comment handler
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
      commentsList.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
      return;
    }
    commentsList.innerHTML = comments
      .map(function (c) {
        var date = new Date(c.created_at + "Z");
        var dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return (
          '<div class="comment">' +
          '<div class="comment-header">' +
          '<strong class="comment-name">' + escapeHtml(c.name) + '</strong>' +
          '<span class="comment-date">' + dateStr + '</span>' +
          '</div>' +
          '<p class="comment-body">' + escapeHtml(c.comment) + '</p>' +
          '</div>'
        );
      })
      .join("");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
