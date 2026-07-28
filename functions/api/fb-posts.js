// FB Posts management API
// GET  /api/fb-posts?key=ADMIN_KEY — list all posts (optionally ?category=book)
// GET  /api/fb-posts?key=ADMIN_KEY&schedule=1 — upcoming 60 days schedule
// POST /api/fb-posts?key=ADMIN_KEY — create a new post
// PUT  /api/fb-posts?key=ADMIN_KEY — update an existing post

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
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

// Book quote captions always credit the author. If a caption mentions one of
// the books after From but never names Heather, the byline is added right
// there, so posts loaded from the database get it too.
function withAuthor(msg) {
  if (!msg || msg.indexOf("Heather Lyn Wilson") !== -1) return msg;
  const titles = ["Are You That Dude's Girlfriend?", "I Am NOT a Banana", "You Can't Hide the Fruit", "Built to Shine"];
  for (const t of titles) {
    const marker = "From " + t;
    const i = msg.indexOf(marker);
    if (i === -1) continue;
    const at = i + marker.length;
    const next = msg[at] || "";
    if (".,!;:".indexOf(next) !== -1) {
      return msg.slice(0, at) + " by Heather Lyn Wilson" + msg.slice(at);
    }
    return msg.slice(0, at) + " by Heather Lyn Wilson." + msg.slice(at);
  }
  return msg;
}

function pickPromoForDate(pool, targetEastern, skipsMap) {
  // Walk every posting day from a fixed epoch to the target date, tracking
  // what ACTUALLY posts each day (including bumps and manual swaps). That
  // makes the back-to-back limits airtight: max 1 book in a row, max 2
  // engage in a row. Deterministic, so the admin preview matches real posts.
  const catAt = (i) => pool[i].category || "engage";
  const EPOCH = Date.UTC(2026, 0, 1);
  const prev = [];
  for (let t = EPOCH; t < EPOCH + 731 * 86400000; t += 86400000) {
    const mid = new Date(t + 12 * 3600000);
    const eastern = mid.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (eastern > targetEastern) break;
    const wd = mid.getUTCDay();
    if (wd !== 0 && wd !== 2 && wd !== 4 && wd !== 6) continue;
    const doy = Math.floor((mid - new Date(mid.getFullYear(), 0, 0)) / 86400000);
    const blocked = (c) =>
      (c === "book" && prev.length >= 1 && prev[0] === "book") ||
      (c === "engage" && prev.length >= 2 && prev[0] === "engage" && prev[1] === "engage");
    let idx = (doy * 23) % pool.length;
    if (blocked(catAt(idx))) {
      for (let step = 1; step <= pool.length; step++) {
        const j = (idx + step) % pool.length;
        if (!blocked(catAt(j))) { idx = j; break; }
      }
    }
    // Manual swaps from the admin schedule advance to the next valid post
    const skips = (skipsMap && skipsMap[eastern]) || 0;
    for (let s = 0; s < skips; s++) {
      for (let step = 1; step <= pool.length; step++) {
        const j = (idx + step) % pool.length;
        if (!blocked(catAt(j))) { idx = j; break; }
      }
    }
    if (eastern === targetEastern) return pool[idx];
    prev.unshift(catAt(idx));
    if (prev.length > 2) prev.length = 2;
  }
  return pool[0];
}

function buildSchedule(dbPosts, days, skipsMap) {
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

    const swapped = (skipsMap && skipsMap[easternDate]) || 0;
    const post = pickPromoForDate(pool, easternDate, skipsMap);

    schedule.push({
      date: easternDate,
      day_name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day],
      time: (day === 2 || day === 6) ? "11:05am ET" : "6:05pm ET",
      post_id: post.id || null,
      swapped: swapped,
      category: post.category,
      message: withAuthor(post.message),
      link: post.link || "",
      image_url: post.image_url || "",
    });
  }

  return schedule;
}



// Every graphic post from the code rotation must exist in the live fb_posts
// database too, since the database drives the real schedule. Checks by image
// filename and inserts whatever is missing. Runs cheap once present.
async function ensureRotationPosts(DB) {
  try {
    const wanted = [
      { category: "book", message: "What happens when you say yes to God, and everything gets harder?\n\nWhen five foster children from hard places showed up at my door, I thought I was ready. What followed was a crash course in chaos, surrender, and the kind of obedience that doesn't come with applause.\n\nAre You That Dude's Girlfriend? is my story of learning to love like Jesus.", link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/", image: "https://heatherlynwilson.com/images/cover-dude.png" },
      { category: "book", message: "As I pulled into my driveway, my front door swung open and five children rushed out to greet me.\n\nWith a smile, I asked, \"Hey, what are you all doing at my house?\" One of them looked me up and down and loudly asked, \"Are you that dude's girlfriend?\"\n\nThat moment changed everything. This is my story of learning to love like Jesus.", link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/", image: "https://heatherlynwilson.com/images/promo-dudes-gf.png" },
      { category: "book", message: "I sat for a minute and then slowly I unbuckled my seatbelt, got out of my minivan and opened the trunk. It was the only way to reach Silas who was sitting in the middle of the back row, so yes, I climbed into the trunk of my own minivan to reach him.\n\nSome moments in fostering look nothing like what you imagined. This one changed me.", link: "https://www.amazon.com/Are-You-That-Dudes-Girlfriend/dp/B0FD8RZD3X/", image: "https://heatherlynwilson.com/images/promo-dudes-gf-2.jpg" },
      { category: "book", message: "If someone called you a banana, would that make you one?\n\nI Am NOT a Banana is a children's book about knowing who you are. When hurtful names start to make Kenzie question herself, her mom helps her see the truth: just because someone says something doesn't make it true.\n\nPerfect for kids learning that their identity is not defined by what others say.", link: "https://a.co/d/02cusvs8", image: "https://heatherlynwilson.com/images/cover-banana.png" },
      { category: "book", message: "Your identity is not in what others say, but in who God says you are.\n\nWhen someone asks about the pin, share with them that their worth and identity are not found in what others say, but in who God says they are.\n\nI Am NOT a Banana. A children's book about knowing who you are.", link: "https://a.co/d/02cusvs8", image: "https://heatherlynwilson.com/images/promo-banana-pin.jpg" },
      { category: "book", message: "You are not yellow. You do not have a peel. You are not a fruit.\n\nWhen people lie about you or call you names, remember: they might as well be calling you a banana. Your identity is not in what others say, but in who God says you are.\n\nI Am NOT a Banana. For every kid who needs to hear this.", link: "https://a.co/d/02cusvs8", image: "https://heatherlynwilson.com/images/promo-banana-card.png" },
      { category: "book", message: "Plant seeds of faith early.\n\nYou Can't Hide the Fruit is a board book that brings the Fruit of the Spirit to life for kids through colorful illustrations and playful rhymes. Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control as gifts from God that shine through them.\n\nFree with Kindle Unlimited.", link: "https://www.amazon.com/You-Cant-Hide-Fruit-Colorful-ebook/dp/B0GCV1N9FG", image: "https://heatherlynwilson.com/images/cover-fruit.png" },
      { category: "book", message: "You can't plant hate and grow out love. So fill your heart with things above.\n\nBecause whatever's tucked inside your root will bloom and show up in your fruit.\n\nYou Can't Hide the Fruit. A Fruit of the Spirit board book for kids.", link: "https://www.amazon.com/You-Cant-Hide-Fruit-Colorful-ebook/dp/B0GCV1N9FG", image: "https://heatherlynwilson.com/images/promo-fruit-verse.png" },
      { category: "book", message: "When the God of the universe speaks, we should listen and remember.\n\nI made a leather journal for exactly that. Soft cover, 100 lined pages. Perfect for prayer notes, sermon thoughts, or capturing the moments when God whispers truth to your heart.", link: "https://heatherlynwilson.com/books#journal", image: "https://heatherlynwilson.com/images/cover-journal.jpg" },
      { category: "book", message: "\"That is the kind of God we serve. A God who is not shocked by our failures. A God who loves us too much to leave us stuck in them. A God who uses even our weakest, most broken moments to tell a bigger story of redemption.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q1.png" },
      { category: "book", message: "\"When we live so concerned about what others think of us, we can quickly turn any uncomfortable moment into an approval-seeking mission.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q2.png" },
      { category: "book", message: "\"If we're honest, we all wrestle with the desire to be noticed, to feel special, to be recognized and praised. Not just by people, but sometimes even by God.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q3.png" },
      { category: "book", message: "\"Two little girls. Two very different prayers. One filled with aching reality. One filled with innocent hopes. Both heard by the same God, who cared deeply about both.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q4.png" },
      { category: "book", message: "\"I told God I was tired. I did not want to keep loving people who hated me.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q5.png" },
      { category: "book", message: "\"Because loving like Jesus does not make sense. It never has.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q6.png" },
      { category: "book", message: "\"Chasing down a child who did not know how to trust love yet and showing up anyway. That is the Gospel.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q7.png" },
      { category: "book", message: "\"I never thought I'd be the kind of mom who makes dessert just so I could take it away... but there we were.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q8.png" },
      { category: "book", message: "\"The secret battles are the ones that shape our souls the most. Because they are the ones no one else sees. Only you and God know what is happening there.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q9.png" },
      { category: "book", message: "\"I learned that loving like Jesus is not about being perfect. It is not about being strong enough or prepared enough or spiritual enough. It is simply about being willing.\"\n\nFrom Are You That Dude's Girlfriend? by Heather Lyn Wilson. Free with Kindle Unlimited.", link: "https://a.co/d/099u6QDX", image: "https://heatherlynwilson.com/images/promo-dudes-q10.png" },
      { category: "bts", message: "My new book is coming this September, and I want to start introducing you to what is inside.\n\nBuilt to Shine is for the woman leading with faith in the business world. And it is built around the lies we quietly believe. This one runs deep: if I am doing this right, everything should feel balanced.\n\nNobody walking in real obedience feels balanced all the time. Some seasons God asks for more than feels tidy.\n\nDoes your life feel balanced right now? Be honest.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-balance.jpg" },
      { category: "bts", message: "The lie sounds like this: I am not qualified enough to lead here.\n\nIt shows up as chasing credentials instead of calling. Constant comparison. Feeling too young, or not enough. Passing yourself over before anyone else can.\n\nHere is the truth I wrote a whole chapter about: you do not need to earn your seat. You were invited before you arrived.\n\nBuilt to Shine comes out this September. For the woman leading with faith in the business world.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-legitimacy.jpg" },
      { category: "bts", message: "I have to hide my faith to be successful in business.\n\nI believed some version of that lie for years. Faith over here, work over there, and never let them touch. But God did not build you in compartments, and the version of you He built is the one your work actually needs.\n\nSo here is the question that chapter asks: what part of myself am I hiding?\n\nBuilt to Shine, my new book for women leading with faith in the business world, comes out this September.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-compartments.jpg" },
      { category: "bts", message: "Somewhere along the way, a lot of us picked up this lie: men and women are competitors, not co-laborers.\n\nScripture tells a different story. We were built to build together. When I stopped seeing the people around the table as rivals, leading got lighter and better.\n\nThe question this chapter of Built to Shine asks: who do I see as the enemy?\n\nComing this September, for the woman leading with faith in the business world.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-usthem.jpg" },
      { category: "bts", message: "The quietest lie of them all: what I am doing does not really matter.\n\nThe hidden faithfulness. The unseen obedience. The work nobody claps for. The enemy would love for you to believe none of it counts.\n\nIt counts. It has always counted. Did my obedience actually matter? That question gets a whole chapter in Built to Shine, and the answer might make you cry in a good way.\n\nComing this September. For the woman leading with faith in the business world.", link: "https://heatherlynwilson.com/built-to-shine", image: "https://heatherlynwilson.com/images/promo-bts-lie-smallimpact.jpg" }
    ];
    const existing = await DB.prepare("SELECT image_url FROM fb_posts").all();
    const have = new Set((existing.results || []).map(r => (r.image_url || "").split("/").pop()).filter(Boolean));
    // Rows inserted without an active value are invisible everywhere; heal
    // them (never touches posts deliberately switched off, those are 0)
    try { await DB.prepare("UPDATE fb_posts SET active = 1 WHERE active IS NULL").run(); } catch (e) {}
    const missing = wanted.filter(w => !have.has(w.image.split("/").pop()));
    if (!missing.length) return;
    const orders = {};
    for (const w of missing) {
      if (orders[w.category] === undefined) {
        const maxRow = await DB.prepare("SELECT MAX(sort_order) AS mx FROM fb_posts WHERE category = ?").bind(w.category).first();
        orders[w.category] = ((maxRow && maxRow.mx != null) ? maxRow.mx : -1) + 1;
      }
      await DB.prepare(
        "INSERT INTO fb_posts (category, message, link, image_url, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)"
      ).bind(w.category, w.message, w.link, w.image, orders[w.category]++).run();
    }
  } catch (e) {}
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (key !== context.env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  await ensureRotationPosts(context.env.DB);

  try {
    if (url.searchParams.get("schedule")) {
      const days = parseInt(url.searchParams.get("days") || "60", 10);
      const { results } = await context.env.DB.prepare("SELECT * FROM fb_posts ORDER BY category, sort_order").all();
      let skipsMap = {};
      try {
        const sk = await context.env.DB.prepare("SELECT date, skips FROM fb_skips").all();
        (sk.results || []).forEach(r => { skipsMap[r.date] = r.skips; });
      } catch (e) {}
      const schedule = buildSchedule(results || [], days, skipsMap);
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

  // Swap a day's scheduled post: each call advances that day to the next
  // valid post. Unskip puts the original back.
  const skipDate = url.searchParams.get("skip");
  const unskipDate = url.searchParams.get("unskip");
  if (skipDate || unskipDate) {
    try {
      await context.env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS fb_skips (date TEXT PRIMARY KEY, skips INTEGER NOT NULL DEFAULT 0)"
      ).run();
      if (skipDate) {
        await context.env.DB.prepare(
          "INSERT INTO fb_skips (date, skips) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET skips = skips + 1"
        ).bind(skipDate).run();
      } else {
        await context.env.DB.prepare("DELETE FROM fb_skips WHERE date = ?").bind(unskipDate).run();
      }
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  try {
    const body = await context.request.json();
    const { category, message, link, image_url } = body;
    if (!category || !message) return json({ error: "category and message required" }, 400);

    // Get max sort_order for this category
    const maxRow = await context.env.DB.prepare("SELECT MAX(sort_order) as mx FROM fb_posts WHERE category = ?").bind(category).first();
    const nextOrder = (maxRow?.mx ?? -1) + 1;

    const result = await context.env.DB.prepare(
      "INSERT INTO fb_posts (category, message, link, image_url, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)"
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
