// FB Posts management API
// GET  /api/fb-posts?key=ADMIN_KEY — list all posts (optionally ?category=book)
// GET  /api/fb-posts?key=ADMIN_KEY&schedule=1 — upcoming 60 days schedule
// POST /api/fb-posts?key=ADMIN_KEY — create a new post
// PUT  /api/fb-posts?key=ADMIN_KEY — update an existing post

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// Challenge promos (hardcoded — these rotate based on date, not from DB)
const CHALLENGE_PROMOS = {
  "august-james-2026": {
    start: "2026-08-01", link: "https://heatherlynwilson.com/challenge-james",
    images: [
      "https://heatherlynwilson.com/images/promo-james-start.jpg",
      "https://heatherlynwilson.com/images/promo-james-deeper.jpg",
      "https://heatherlynwilson.com/images/promo-read-together.jpg",
    ],
    posts: [
      "One Book Deep starts August 1st.\n\nRead the book of James every single day for 31 days. Same five chapters, thirty-one times. Repetition is how the Word gets from your head to your heart.\n\nJoin us. It is free.",
      "Read less. Read deeper.\n\nWhat would happen if you read the same five chapters of the Bible every day for a month? That is the One Book Deep challenge. James. Every day. For 31 days. By the end it will be part of you.\n\nStarts August 1st.",
      "Do not read alone. Read together.\n\nStart a group with your friends, your small group, your family. Everyone reads James together. You see who checked in. You cheer each other on.\n\nOne Book Deep starts August 1st.",
    ],
  },
  "september-beatitudes-2026": {
    start: "2026-09-01", link: "https://heatherlynwilson.com/challenge-beatitudes",
    image: "https://heatherlynwilson.com/images/og-challenge.png",
    posts: [
      "What if you memorized the Beatitudes this September?\n\nHide It In Your Heart: 30 days, one line at a time, a memory game on your dashboard that hides more words each day. By Day 30 you say the whole passage from memory.\n\nPick your translation and join us.",
      "Once Scripture is in you, no one can take it. It is there in the hard moments, the waiting, the times you do not know what to pray.\n\nThis September, memorize the Beatitudes with me. One line at a time. 30 days. Join us.",
      "Blessed are the poor in spirit, for theirs is the kingdom of heaven.\n\nWhat if you knew those words by heart? All of them. By the end of September.\n\nHide It In Your Heart starts September 1st. Pick your translation and let's go.",
    ],
  },
  "october-proverbs-2026": {
    start: "2026-10-01", link: "https://heatherlynwilson.com/challenge-proverbs",
    image: "https://heatherlynwilson.com/images/challenge-card.jpg",
    posts: [
      "What if your family read one chapter of Proverbs together every day in October?\n\nAround the Table gives you the chapter, questions for your kids by age, and one small family challenge. Ten minutes. No table required. The car works fine.",
      "Thirty-one days of Proverbs will put more wisdom in your kids than a year of lectures.\n\nAround the Table starts October 1st. One chapter a day, questions by age, one family challenge. Ten minutes wherever you are.",
      "You do not need a quiet house or a formal dinner to do family devotions.\n\nAround the Table works at breakfast, in the car, or wherever your family actually is. One Proverbs chapter, ten minutes, and real conversation that counts.\n\nStarts October 1st.",
    ],
  },
  "november-thanks-2026": {
    start: "2026-11-01", link: "https://heatherlynwilson.com/challenge-thanks",
    image: "https://heatherlynwilson.com/images/og-challenge.png",
    posts: [
      "This November: one psalm a day, one short note from me, and three things you are thankful for.\n\nBy Thanksgiving your list will be ninety long, and you will read it at the table.\n\nGive Thanks starts November 1st.",
      "What if you spent November building a gratitude list instead of a wish list?\n\nGive Thanks: a psalm a day, a gratitude prompt, and by Thanksgiving you have ninety things written down. Join us.",
      "Ninety things you are thankful for, written down, by Thanksgiving.\n\nThat is Give Thanks. One psalm a day. Three things on your list. Five quiet minutes that will change your November.\n\nStarts November 1st.",
    ],
  },
  "december-gospels-2026": {
    start: "2026-12-01", link: "https://heatherlynwilson.com/challenge-gospels",
    image: "https://heatherlynwilson.com/images/og-challenge.png",
    posts: [
      "This December, read the Gospels with me.\n\nMark shows you what Jesus did. John tells you who He is. Matthew proves He is the promised King. And Luke sits you at the manger on Christmas Eve.\n\nOr just read Luke, one chapter a day, and finish by Christmas Eve.",
      "What if this Christmas you knew exactly who that baby was?\n\nGod With Us: all four Gospels in December, ending at the manger on Christmas Eve. Or just Luke, one chapter a day.\n\nStarts December 1st.",
      "By Christmas Eve you will have read every word Jesus spoke, every miracle, every parable, every moment from the cross to the empty tomb.\n\nGod With Us starts December 1st. Fifteen minutes a day. Join us.",
    ],
  },
};

function getNextChallenge(dateStr) {
  const today = new Date(dateStr + "T00:00:00");
  for (const [id, cfg] of Object.entries(CHALLENGE_PROMOS)) {
    const start = new Date(cfg.start + "T00:00:00");
    const daysSince = Math.floor((today - start) / 86400000);
    if (daysSince < 14) return cfg;
  }
  return null;
}


// Pick the day's promo with back-to-back limits:
//   - Max 1 book post in a row
//   - Max 2 engage posts in a row
// If the limit would be exceeded, step forward to the next valid post.
// Deterministic, so the admin preview matches real posts.
function pickPromoForDate(pool, date) {
  const doyOf = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const baseIdx = (doy) => (doy * 23) % pool.length;
  const catAt = (i) => pool[i].category || "engage";

  // Find the previous 2 posting days
  const prevCats = [];
  let back = 1;
  while (prevCats.length < 2 && back < 8) {
    const pd = new Date(date.getTime() - back * 86400000);
    const wd = pd.getUTCDay();
    if (wd === 0 || wd === 2 || wd === 4 || wd === 6) {
      prevCats.push(catAt(baseIdx(doyOf(pd))));
    }
    back++;
  }

  let idx = baseIdx(doyOf(date));
  const thisCat = catAt(idx);

  // Book: max 1 in a row
  const bookBlocked = thisCat === "book" && prevCats.length >= 1 && prevCats[0] === "book";
  // Engage: max 2 in a row
  const engageBlocked = thisCat === "engage" && prevCats.length >= 2 && prevCats[0] === "engage" && prevCats[1] === "engage";

  if (bookBlocked || engageBlocked) {
    for (let step = 1; step <= pool.length; step++) {
      const j = (idx + step) % pool.length;
      const c = catAt(j);
      if (c !== thisCat) { idx = j; break; }
    }
  }
  return pool[idx];
}

function buildSchedule(dbPosts, days) {
  const now = new Date();
  const schedule = [];

  // Build interleaved pool from DB posts (same logic as worker)
  const buckets = {};
  for (const p of dbPosts) {
    if (!p.active) continue;
    if (!buckets[p.category]) buckets[p.category] = [];
    buckets[p.category].push(p);
  }
  // Sort each bucket by sort_order
  for (const cat of Object.keys(buckets)) {
    buckets[cat].sort((a, b) => a.sort_order - b.sort_order);
  }

  const bucketOrder = ["book", "engage", "bts", "site", "project"].filter(c => buckets[c]?.length);
  const bucketArrays = bucketOrder.map(c => buckets[c]);

  for (let d = 0; d < days; d++) {
    const date = new Date(now.getTime() + d * 86400000);
    const day = date.getUTCDay();
    const easternDate = date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Check if this is a posting day (Tue 11am, Thu 6pm, Sat 11am, Sun 6pm)
    // For schedule purposes, just show the date for Tue/Thu/Sat/Sun
    if (day !== 0 && day !== 2 && day !== 4 && day !== 6) continue;

    // Build pool with challenge posts
    const nextCh = getNextChallenge(easternDate);
    const chPosts = [];
    if (nextCh) {
      nextCh.posts.forEach((msg, i) => {
        const img = nextCh.images ? nextCh.images[i % nextCh.images.length] : (nextCh.image || "");
        chPosts.push({ id: null, category: "challenge", message: msg, link: nextCh.link, image_url: img });
      });
    }

    const allBuckets = [...bucketArrays];
    if (chPosts.length) allBuckets.push(chPosts);

    const pool = [];
    const maxLen = Math.max(...allBuckets.map(b => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const bucket of allBuckets) {
        if (i < bucket.length) pool.push(bucket[i]);
      }
    }

    if (!pool.length) continue;

    const post = pickPromoForDate(pool, date);

    schedule.push({
      date: easternDate,
      day_name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day],
      time: (day === 2 || day === 6) ? "11:05am ET" : "6:05pm ET",
      post_id: post.id || null,
      category: post.category,
      message: post.message,
      link: post.link || "",
      image_url: post.image_url || "",
    });
  }

  return schedule;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    if (url.searchParams.get("schedule")) {
      const days = parseInt(url.searchParams.get("days") || "60", 10);
      const { results } = await context.env.DB.prepare("SELECT * FROM fb_posts ORDER BY category, sort_order").all();
      const schedule = buildSchedule(results || [], days);
      return json({ schedule });
    }

    const category = url.searchParams.get("category");
    let results;
    if (category) {
      results = (await context.env.DB.prepare("SELECT * FROM fb_posts WHERE category = ? ORDER BY sort_order").bind(category).all()).results;
    } else {
      results = (await context.env.DB.prepare("SELECT * FROM fb_posts ORDER BY category, sort_order").all()).results;
    }
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
    const { category, message, link, image_url } = body;
    if (!category || !message) return json({ error: "category and message required" }, 400);

    // Get max sort_order for this category
    const maxRow = await context.env.DB.prepare("SELECT MAX(sort_order) as mx FROM fb_posts WHERE category = ?").bind(category).first();
    const nextOrder = (maxRow?.mx ?? -1) + 1;

    const result = await context.env.DB.prepare(
      "INSERT INTO fb_posts (category, message, link, image_url, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).bind(category, message, link || "", image_url || "", nextOrder).run();

    return json({ success: true, id: result.meta.last_row_id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await context.request.json();
    const { id, message, link, image_url, active, category } = body;
    if (!id) return json({ error: "id required" }, 400);

    const sets = [];
    const vals = [];
    if (message !== undefined) { sets.push("message = ?"); vals.push(message); }
    if (link !== undefined) { sets.push("link = ?"); vals.push(link); }
    if (image_url !== undefined) { sets.push("image_url = ?"); vals.push(image_url); }
    if (active !== undefined) { sets.push("active = ?"); vals.push(active ? 1 : 0); }
    if (category !== undefined) { sets.push("category = ?"); vals.push(category); }

    if (!sets.length) return json({ error: "nothing to update" }, 400);

    vals.push(id);
    await context.env.DB.prepare(`UPDATE fb_posts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
    return json({ success: true });
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
    await context.env.DB.prepare("DELETE FROM fb_posts WHERE id = ?").bind(id).run();
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
