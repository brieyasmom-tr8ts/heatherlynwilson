/**
 * Cloudflare Worker cron trigger that dispatches the
 * "Publish scheduled blog posts" GitHub Actions workflow.
 *
 * Secrets (set via `wrangler secret put`):
 *   GITHUB_TOKEN  – fine-grained PAT with Actions write on the repo
 */

const REPO = "brieyasmom-tr8ts/heatherlynwilson";
const WORKFLOW = "publish-blog.yml";

export default {
  async scheduled(event, env) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "blog-publish-cron",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );

    if (res.ok) {
      console.log("Workflow dispatched successfully.");
    } else {
      const text = await res.text();
      console.error(`GitHub API ${res.status}: ${text}`);
    }
  },
};
