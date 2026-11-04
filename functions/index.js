// Homepage (Heather, November 4 2026). The "This Month's Challenge" button is
// filled in by a script in index.html, so anything that reads the page without
// running scripts (search engines, link previews, Muse) saw it pointing at the
// general challenges page. This fills in the same button on the server, from
// challenge/registry.json, so the page arrives with the right link already in
// it. The rules match the script in index.html: 1st to 15th, this month's
// challenge; 16th on, next month's. If anything here fails, the page is served
// exactly as it is in the repo and the browser script still fills the button.

export function pickButton(challenges, todayIso) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const key = (yy, mm) => yy + "-" + (mm < 10 ? "0" : "") + mm;
  const thisMonth = key(y, m);
  const nextMonth = m === 12 ? key(y + 1, 1) : key(y, m + 1);
  const find = (mk) => challenges.find((c) => c.official && c.official.slice(0, 7) === mk && c.signupPage) || null;
  const cur = find(thisMonth), next = find(nextMonth);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const starts = (c) => { const s = c.official.split("-"); return mon[+s[1] - 1] + " " + (+s[2]); };
  if (d > 15 && next) return { href: next.signupPage, text: "Next Challenge: " + next.name + ", Starts " + starts(next) };
  if (cur) return { href: cur.signupPage, text: "This Month's Challenge: " + cur.name };
  return { href: "challenge.html", text: "Browse the Challenges" };
}

export async function onRequestGet(context) {
  const res = await context.next();
  try {
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    const url = new URL(context.request.url);
    const reg = await context.env.ASSETS.fetch(new URL("/challenge/registry.json", url.origin));
    if (!reg.ok) return res;
    const challenges = ((await reg.json()) || {}).challenges || [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const btn = pickButton(challenges, today);
    return new HTMLRewriter()
      .on("#monthChallengeBtn", {
        element(el) {
          el.setAttribute("href", btn.href);
          el.setInnerContent(btn.text);
        },
      })
      .transform(res);
  } catch (e) {
    return res;
  }
}
