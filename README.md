# heatherlynwilson.com

Personal author/speaker site for Heather Lyn Wilson.

## Quick Start

1. Open `index.html` in a browser to preview locally
2. All pages are static HTML — no build step needed
3. Edit content directly in the HTML files

## Deploy to Cloudflare Pages

1. Push to GitHub `main` branch
2. Cloudflare Pages auto-deploys
3. Domain: heatherlynwilson.com

### First-time setup

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Initial site build"
```

```bash
git remote add origin https://github.com/brieyasmom-tr8ts/heatherlynwilson.git
```

```bash
git branch -M main
```

```bash
git push -u origin main
```

Then in Cloudflare dashboard:
1. Workers & Pages > Create > Pages
2. Connect to Git > select `heatherlynwilson` repo
3. Build command: (leave blank)
4. Output directory: `/`
5. Deploy

After first deploy, add custom domain `heatherlynwilson.com` in the Custom Domains tab.

## Project Structure

```
heatherlynwilson/
├── index.html          # Home page
├── about.html          # About Heather
├── books.html          # All books with buy buttons
├── speaking.html       # Speaking topics + booking form
├── blog.html           # Blog landing page
├── contact.html        # Contact form
├── css/
│   └── main.css        # Brand system, typography, nav, footer
├── images/             # All photos and book covers
├── CLAUDE.md           # Project context for Claude Code
└── README.md
```

## See CLAUDE.md for full project context and to-do list.
