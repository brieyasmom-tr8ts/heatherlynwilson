# Add to Cart: Saturday Gift Series — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-post two gift recommendation posts to Facebook every Saturday (8:23am and 7:45pm ET), managed from the admin dashboard.

**Architecture:** New `gift_posts` D1 table stores scheduled posts. New API endpoint at `/api/gift-posts` handles CRUD. Admin UI section lets Heather queue posts per Saturday. Cron worker expanded to fire at gift post times and call `postGiftPost()`.

**Tech Stack:** Cloudflare Pages Functions (API), Cloudflare Workers (cron), D1 SQLite, vanilla JS admin UI, Facebook Graph API v20.0

## Global Constraints

- D1 crashes on `undefined` in `.bind()` — always use `|| null` or `|| ""` fallbacks
- Use `Promise.allSettled()` for parallel D1 queries, never `Promise.all()`
- Deploy worker: `cd C:\Users\Heather && gh workflow run worker-deploy.yml --ref main`
- Deploy pages: `git push origin main && gh workflow run cloudflare-deploy.yml --ref main`
- Admin auth: `adminKey` from localStorage, passed as `?key=` query param
- Image uploads reuse existing `/api/fb-upload` endpoint and `fb_images` table
- Existing FB promo schedule (Tue/Thu/Sat/Sun) must not break

---

### Task 1: Create gift_posts table and API endpoint

**Files:**
- Create: `functions/api/gift-posts.js`
- No test file (Cloudflare Pages Functions; tested via curl after deploy)

**Produces:**
- `GET /api/gift-posts?key=KEY` → `{ posts: [...] }` all gift posts ordered by scheduled_date, slot
- `POST /api/gift-posts?key=KEY` body `{ scheduled_date, slot, message, image_url? }` → upsert, returns `{ success, id }`
- `DELETE /api/gift-posts?key=KEY&id=N` → `{ success: true }`
- `OPTIONS /api/gift-posts` → CORS headers

- [ ] **Step 1: Create the gift_posts table in D1**

```bash
cd C:\Users\Heather && npx wrangler d1 execute blog-engagement --remote --command "CREATE TABLE IF NOT EXISTS gift_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, scheduled_date TEXT NOT NULL, slot TEXT NOT NULL, message TEXT NOT NULL, image_url TEXT, posted_at TEXT, fb_post_id TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(scheduled_date, slot))"
```

- [ ] **Step 2: Create `functions/api/gift-posts.js`**

```js
// Gift Posts management API
// GET    /api/gift-posts?key=ADMIN_KEY — list all gift posts
// POST   /api/gift-posts?key=ADMIN_KEY — create or update a gift post
// DELETE /api/gift-posts?key=ADMIN_KEY&id=N — delete a gift post

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM gift_posts ORDER BY scheduled_date, slot"
    ).all();
    return json({ posts: results || [] });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await context.request.json();
    const { scheduled_date, slot, message, image_url } = body;
    if (!scheduled_date || !slot || !message) return json({ error: "scheduled_date, slot, and message required" }, 400);
    if (slot !== "morning" && slot !== "evening") return json({ error: "slot must be 'morning' or 'evening'" }, 400);

    // Upsert: update if exists, insert if not
    const existing = await context.env.DB.prepare(
      "SELECT id FROM gift_posts WHERE scheduled_date = ? AND slot = ?"
    ).bind(scheduled_date, slot).first();

    let id;
    if (existing) {
      await context.env.DB.prepare(
        "UPDATE gift_posts SET message = ?, image_url = ? WHERE id = ?"
      ).bind(message, image_url || null, existing.id).run();
      id = existing.id;
    } else {
      const result = await context.env.DB.prepare(
        "INSERT INTO gift_posts (scheduled_date, slot, message, image_url) VALUES (?, ?, ?, ?)"
      ).bind(scheduled_date, slot, message, image_url || null).run();
      id = result.meta.last_row_id;
    }

    return json({ success: true, id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  try {
    await context.env.DB.prepare("DELETE FROM gift_posts WHERE id = ?").bind(id).run();
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd C:\Users\Heather\heatherlynwilson && git add functions/api/gift-posts.js && git commit -m "feat: add gift_posts API endpoint for Add to Cart series"
```

---

### Task 2: Add "Add to Cart" section to admin.html

**Files:**
- Modify: `admin.html` (nav button ~line 420, new section after fbposts ~line 683, new JS functions at end of script)

**Consumes:**
- `GET /api/gift-posts?key=KEY` → `{ posts: [...] }`
- `POST /api/gift-posts?key=KEY` with `{ scheduled_date, slot, message, image_url }`
- `DELETE /api/gift-posts?key=KEY&id=N`
- Existing `shrinkImageForUpload()` and `uploadFbImage()` functions (already in admin.html)
- Existing `/api/fb-upload` for image uploads

- [ ] **Step 1: Add nav button after the Facebook button**

Find line with `onclick="scrollToSection('fbposts')"` and add after it:

```html
      <button class="nav-link" onclick="scrollToSection('giftposts')">Gifts</button>
```

- [ ] **Step 2: Add the Add to Cart section HTML after the Facebook Posts section** (after the closing `</div>` of `sec-fbposts`, before `<!-- FB Post Edit Modal -->`)

```html
    <!-- Add to Cart Gift Posts -->
    <div class="dash-section" id="sec-giftposts">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <h2 class="section-title" style="margin:0;">Add to Cart</h2>
        <span style="font-size:13px;color:#6b7280;">Saturdays at 8:23am &amp; 7:45pm ET</span>
      </div>
      <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div id="giftScheduleList" class="empty">Loading...</div>
      </div>
    </div>

    <!-- Gift Post Edit Modal -->
    <div id="giftEditModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;overflow-y:auto;">
      <div style="max-width:600px;margin:60px auto;background:#fff;border-radius:16px;padding:32px;position:relative;">
        <button onclick="closeGiftModal()" style="position:absolute;top:16px;right:16px;border:none;background:none;font-size:24px;cursor:pointer;color:#6b7280;">&times;</button>
        <h3 style="margin:0 0 20px;font-family:Lora,serif;color:#1f2937;" id="giftModalTitle">Add Gift Post</h3>
        <input type="hidden" id="giftEditDate">
        <input type="hidden" id="giftEditSlot">
        <input type="hidden" id="giftEditId">
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;font-weight:600;color:#4b5563;display:block;margin-bottom:6px;">Post Text</label>
          <textarea id="giftEditMessage" rows="8" style="width:100%;padding:12px;border:1px solid #e5e0d5;border-radius:8px;font-size:14px;font-family:Inter,sans-serif;resize:vertical;" placeholder="Paste your gift post here..."></textarea>
          <div id="giftCharCount" style="font-size:11px;color:#6b7280;margin-top:4px;text-align:right;"></div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;font-weight:600;color:#4b5563;display:block;margin-bottom:6px;">Product Photo (optional)</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="url" id="giftEditImageUrl" style="flex:1;padding:10px;border:1px solid #e5e0d5;border-radius:8px;font-size:14px;font-family:Inter,sans-serif;" placeholder="Image URL or upload below">
          </div>
          <div style="margin-top:8px;">
            <input type="file" id="giftEditImageFile" accept="image/*" onchange="handleGiftImageUpload(this)" style="font-size:13px;">
            <div id="giftUploadStatus" style="font-size:12px;color:#6b7280;margin-top:4px;"></div>
          </div>
          <div id="giftImagePreview" style="margin-top:8px;"></div>
        </div>
        <div style="display:flex;gap:12px;justify-content:space-between;align-items:center;">
          <button id="giftDeleteBtn" onclick="deleteGiftPost()" style="display:none;padding:10px 16px;border:1px solid #ef4444;border-radius:8px;background:#fff;color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;">Delete</button>
          <div style="display:flex;gap:12px;margin-left:auto;">
            <button onclick="closeGiftModal()" style="padding:10px 20px;border:1px solid #e5e0d5;border-radius:8px;background:#fff;font-size:14px;cursor:pointer;">Cancel</button>
            <button onclick="saveGiftPost()" style="padding:10px 20px;border:none;border-radius:8px;background:#1f2937;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Save</button>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Add the JavaScript functions for the gift section**

Add these functions in the `<script>` block (near the existing FB post functions):

```js
// ─── Add to Cart Gift Posts ───

function loadGiftPosts() {
  fetch('/api/gift-posts?key=' + encodeURIComponent(adminKey))
    .then(function(r) { return r.json(); })
    .then(function(data) { renderGiftSchedule(data.posts || []); })
    .catch(function(e) { document.getElementById('giftScheduleList').innerHTML = '<p style="color:#ef4444;">Failed to load gift posts.</p>'; });
}

function renderGiftSchedule(posts) {
  var container = document.getElementById('giftScheduleList');
  // Build a map: date+slot → post
  var map = {};
  posts.forEach(function(p) { map[p.scheduled_date + ':' + p.slot] = p; });

  // Generate next 12 Saturdays starting from Sept 5 2026 or today, whichever is sooner
  var saturdays = [];
  var start = new Date();
  // Find next Saturday (or today if Saturday)
  var dayOfWeek = start.getUTCDay();
  var daysUntilSat = (6 - dayOfWeek + 7) % 7;
  if (daysUntilSat === 0 && start.getUTCHours() > 23) daysUntilSat = 7;
  start = new Date(start.getTime() + daysUntilSat * 86400000);

  // Also include past Saturdays that have posts
  var pastSats = [];
  posts.forEach(function(p) {
    if (pastSats.indexOf(p.scheduled_date) === -1) pastSats.push(p.scheduled_date);
  });
  pastSats.sort();

  for (var i = 0; i < 12; i++) {
    var d = new Date(start.getTime() + i * 7 * 86400000);
    var ds = d.toISOString().slice(0, 10);
    if (saturdays.indexOf(ds) === -1) saturdays.push(ds);
  }
  // Merge past dates that have posts
  pastSats.forEach(function(ds) { if (saturdays.indexOf(ds) === -1) saturdays.push(ds); });
  saturdays.sort();

  if (!saturdays.length) { container.innerHTML = '<p style="color:#6b7280;">No upcoming Saturdays.</p>'; return; }

  var html = '';
  saturdays.forEach(function(ds) {
    var dateObj = new Date(ds + 'T12:00:00Z');
    var label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var morning = map[ds + ':morning'];
    var evening = map[ds + ':evening'];

    html += '<div style="border:1px solid #e5e0d5;border-radius:10px;padding:16px;margin-bottom:12px;">';
    html += '<div style="font-family:Lora,serif;font-size:15px;font-weight:600;color:#1f2937;margin-bottom:12px;">Saturday, ' + escapeHtml(label) + '</div>';
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;">';
    html += renderGiftSlot(ds, 'morning', '8:23am', morning);
    html += renderGiftSlot(ds, 'evening', '7:45pm', evening);
    html += '</div></div>';
  });

  container.innerHTML = html;
}

function renderGiftSlot(date, slot, timeLabel, post) {
  var html = '<div style="flex:1;min-width:240px;border:1px solid #e5e0d5;border-radius:8px;padding:12px;background:#faf6ef;position:relative;">';
  html += '<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#b85638;margin-bottom:8px;">' + timeLabel + '</div>';

  if (post) {
    var preview = post.message.length > 120 ? post.message.substring(0, 120) + '...' : post.message;
    if (post.posted_at) {
      html += '<span style="position:absolute;top:10px;right:10px;font-size:10px;font-weight:700;background:#10b981;color:#fff;padding:2px 8px;border-radius:12px;">Posted</span>';
    }
    if (post.image_url) {
      html += '<img src="' + escapeHtml(post.image_url) + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px;float:right;margin:0 0 8px 8px;">';
    }
    html += '<div style="font-size:13px;color:#4b5563;line-height:1.5;white-space:pre-wrap;">' + escapeHtml(preview) + '</div>';
    html += '<button onclick="openGiftModal(\'' + date + '\',\'' + slot + '\')" style="margin-top:8px;font-size:12px;color:#b85638;background:none;border:none;cursor:pointer;font-weight:600;padding:0;">Edit</button>';
  } else {
    html += '<button onclick="openGiftModal(\'' + date + '\',\'' + slot + '\')" style="width:100%;padding:12px;border:1px dashed #d1cdc4;border-radius:6px;background:none;cursor:pointer;font-size:13px;color:#6b7280;">+ Add Post</button>';
  }

  html += '</div>';
  return html;
}

function openGiftModal(date, slot) {
  var dateObj = new Date(date + 'T12:00:00Z');
  var label = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  var timeLabel = slot === 'morning' ? '8:23am' : '7:45pm';
  document.getElementById('giftModalTitle').textContent = label + ' — ' + timeLabel;
  document.getElementById('giftEditDate').value = date;
  document.getElementById('giftEditSlot').value = slot;
  document.getElementById('giftEditMessage').value = '';
  document.getElementById('giftEditImageUrl').value = '';
  document.getElementById('giftImagePreview').innerHTML = '';
  document.getElementById('giftUploadStatus').textContent = '';
  document.getElementById('giftEditId').value = '';
  document.getElementById('giftDeleteBtn').style.display = 'none';
  document.getElementById('giftCharCount').textContent = '';

  // Load existing post for this slot if any
  fetch('/api/gift-posts?key=' + encodeURIComponent(adminKey))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var posts = data.posts || [];
      for (var i = 0; i < posts.length; i++) {
        if (posts[i].scheduled_date === date && posts[i].slot === slot) {
          var p = posts[i];
          document.getElementById('giftEditMessage').value = p.message;
          document.getElementById('giftEditImageUrl').value = p.image_url || '';
          document.getElementById('giftEditId').value = p.id;
          document.getElementById('giftDeleteBtn').style.display = '';
          if (p.image_url) {
            document.getElementById('giftImagePreview').innerHTML = '<img src="' + escapeHtml(p.image_url) + '" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid #e5e0d5;">';
          }
          updateGiftCharCount();
          break;
        }
      }
    });

  document.getElementById('giftEditModal').style.display = '';
}

function closeGiftModal() {
  document.getElementById('giftEditModal').style.display = 'none';
}

function updateGiftCharCount() {
  var msg = document.getElementById('giftEditMessage').value;
  document.getElementById('giftCharCount').textContent = msg.length + ' characters';
}

function handleGiftImageUpload(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var status = document.getElementById('giftUploadStatus');
  status.textContent = 'Preparing image...';
  shrinkImageForUpload(file, function(blob) {
    var toSend = blob || file;
    if (toSend.size > 2 * 1024 * 1024) { status.textContent = 'Image too large. Try a smaller photo.'; return; }
    var fd = new FormData();
    fd.append('image', toSend, blob ? 'photo.jpg' : (file.name || 'upload.png'));
    fetch('/api/fb-upload?key=' + encodeURIComponent(adminKey), { method: 'POST', body: fd })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.url) {
          document.getElementById('giftEditImageUrl').value = data.url;
          document.getElementById('giftImagePreview').innerHTML = '<img src="' + escapeHtml(data.url) + '" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid #e5e0d5;">';
          status.textContent = 'Uploaded!';
        } else {
          status.textContent = 'Upload failed: ' + (data.error || 'unknown');
        }
      })
      .catch(function(e) { status.textContent = 'Upload failed: ' + e.message; });
  });
}

function saveGiftPost() {
  var date = document.getElementById('giftEditDate').value;
  var slot = document.getElementById('giftEditSlot').value;
  var message = document.getElementById('giftEditMessage').value.trim();
  var image_url = document.getElementById('giftEditImageUrl').value.trim();
  if (!message) { alert('Post text is required.'); return; }

  fetch('/api/gift-posts?key=' + encodeURIComponent(adminKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_date: date, slot: slot, message: message, image_url: image_url || null })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) { closeGiftModal(); loadGiftPosts(); }
      else { alert('Save failed: ' + (data.error || 'unknown')); }
    })
    .catch(function(e) { alert('Save failed: ' + e.message); });
}

function deleteGiftPost() {
  var id = document.getElementById('giftEditId').value;
  if (!id) return;
  if (!confirm('Delete this gift post?')) return;

  fetch('/api/gift-posts?key=' + encodeURIComponent(adminKey) + '&id=' + id, { method: 'DELETE' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) { closeGiftModal(); loadGiftPosts(); }
      else { alert('Delete failed: ' + (data.error || 'unknown')); }
    })
    .catch(function(e) { alert('Delete failed: ' + e.message); });
}
```

- [ ] **Step 4: Add `loadGiftPosts()` call to the admin init function**

Find where other load functions are called (like `loadFbSchedule()`) and add `loadGiftPosts();` alongside them.

- [ ] **Step 5: Add character count listener**

Add after the gift functions:
```js
document.getElementById('giftEditMessage').addEventListener('input', updateGiftCharCount);
```

Or wrap in a DOMContentLoaded if needed. Check how the existing FB modal handles similar.

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Heather\heatherlynwilson && git add admin.html && git commit -m "feat: add Add to Cart admin section for gift post scheduling"
```

---

### Task 3: Add postGiftPost() to cron worker and update triggers

**Files:**
- Modify: `workers/blog-cron/src/index.js` (routing in `scheduled()` ~line 43-52, new function before `// ─── Challenge Emails`)
- Modify: `workers/blog-cron/wrangler.toml` (cron trigger line 11)

**Consumes:**
- `gift_posts` table (created in Task 1)
- `FB_PAGE_ID` constant (already exists, line 24)
- `FB_PAGE_TOKEN` env secret (already exists)

- [ ] **Step 1: Update wrangler.toml cron trigger**

Change line 11 from:
```
crons = ["5 10 * * *", "5 12 * * *", "5 15,22 * * *"]
```
to:
```
crons = ["5 10 * * *", "5 12 * * *", "5,23,45 12,15,22,23 * * *"]
```

Update the comment on line 9 to:
```
# 15:05/22:05 UTC daily → FB promo; 12:23/23:45 UTC Sat → gift posts
```

- [ ] **Step 2: Update the else branch in scheduled() to route gift posts**

In `workers/blog-cron/src/index.js`, replace lines 43-52:

```js
    } else {
      // One shared trigger covers FB promo times and Saturday gift post times.
      // Promo: 11:05am ET Tue/Sat, 6:05pm ET Thu/Sun.
      // Gift:  8:23am ET Sat, 7:45pm ET Sat.
      // Extra cron firings just fall through.
      const t = new Date(event.scheduledTime || Date.now());
      const h = t.getUTCHours(), m = t.getUTCMinutes(), day = t.getUTCDay();
      const giftMorning = h === 12 && m === 23 && day === 6;
      const giftEvening = h === 23 && m === 45 && day === 6;
      if (giftMorning || giftEvening) {
        await postGiftPost(env, giftMorning ? 'morning' : 'evening');
      } else {
        const morningPost = h === 15 && (day === 2 || day === 6);
        const eveningPost = h === 22 && (day === 0 || day === 4);
        if (morningPost || eveningPost) await postFbPromo(env);
      }
    }
```

- [ ] **Step 3: Add postGiftPost() function**

Add before the `// ─── Challenge Emails` comment (~line 1144):

```js
// ─── Saturday Gift Posts (Add to Cart series) ─────────────────────────────────

async function postGiftPost(env, slot) {
  if (!env.FB_PAGE_TOKEN) return;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  let post;
  try {
    post = await env.DB.prepare(
      "SELECT * FROM gift_posts WHERE scheduled_date = ? AND slot = ? AND posted_at IS NULL"
    ).bind(today, slot).first();
  } catch (e) {
    console.error("Gift post DB read failed:", e.message);
    return;
  }

  if (!post) return;

  try {
    const hasImage = !!post.image_url;
    const endpoint = hasImage
      ? `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`
      : `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/feed`;

    const bodyParts = [
      `message=${encodeURIComponent(post.message)}`,
      `access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`
    ];
    if (hasImage) bodyParts.push(`url=${encodeURIComponent(post.image_url)}`);

    const fbRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParts.join("&"),
    });

    if (fbRes.ok) {
      const result = await fbRes.json();
      const fbId = result.id || result.post_id || "";
      await env.DB.prepare(
        "UPDATE gift_posts SET posted_at = datetime('now'), fb_post_id = ? WHERE id = ?"
      ).bind(fbId || "", post.id).run();
      console.log("Gift post published: " + slot + " " + today);
    } else {
      const err = await fbRes.text();
      console.error("Gift post failed:", err);
      if (err.includes("OAuthException") || err.includes("expired")) {
        if (env.BREVO_API_KEY) {
          try {
            await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                sender: { name: "HeatherLynWilson.com", email: "heather@heatherlynwilson.com" },
                to: [{ email: "heather@givesendgo.com", name: "Heather" }],
                subject: "Facebook gift post failed: token expired",
                textContent: "Your Facebook Page token has expired. Gift posts are no longer auto-posting.\n\nTo fix: go to developers.facebook.com/tools/explorer, select the HeatherLynWilson app, select your page, add pages_manage_posts permission, generate a new token, and tell Claude to update it.",
              }),
            });
          } catch (e2) {}
        }
      }
    }
  } catch (e) {
    console.error("Gift post error:", e.message);
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd C:\Users\Heather\heatherlynwilson && git add workers/blog-cron/src/index.js workers/blog-cron/wrangler.toml && git commit -m "feat: add Saturday gift post cron and postGiftPost() function"
```

---

### Task 4: Deploy and verify

- [ ] **Step 1: Push and deploy Pages (API + admin)**

```bash
cd C:\Users\Heather\heatherlynwilson && git push origin main && gh workflow run cloudflare-deploy.yml --ref main
```

- [ ] **Step 2: Deploy Worker (cron)**

```bash
gh workflow run worker-deploy.yml --ref main
```

- [ ] **Step 3: Verify API works**

```bash
cd C:\Users\Heather && curl "https://heatherlynwilson.com/api/gift-posts?key=ADMIN_KEY"
```

Expected: `{"posts":[]}`

- [ ] **Step 4: Verify admin section loads**

Open `https://heatherlynwilson.com/admin.html`, scroll to "Add to Cart" section. Should show upcoming Saturdays with empty morning/evening slots.

- [ ] **Step 5: Test creating a gift post via admin**

Click "+ Add Post" on a Saturday morning slot, paste test text, save. Verify it appears in the schedule.
