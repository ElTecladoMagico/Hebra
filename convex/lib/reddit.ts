import { withRetry } from "./retry";

export interface RedditPostRaw {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  permalink: string;
  created_utc: number;
}

interface SearchListing {
  data: { children: { data: RedditPostRaw }[] };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

// Exported for tests only — allows clearing the in-memory token cache between cases.
export function _resetTokenCacheForTests(): void {
  cachedToken = null;
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  if (!id || !secret || !username || !password) {
    throw new Error("Reddit credentials not configured");
  }
  const auth = btoa(`${id}:${secret}`);
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "web:com.gethebra.app:v1.0.0 (by /u/hebra_app)",
    },
    body: `grant_type=password&username=${username}&password=${password}`,
  });
  if (!res.ok) {
    const err = new Error(`Reddit auth failed: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export interface FetchedPost {
  redditId: string;
  subreddit: string;
  title: string;
  body: string;
  author: string;
  url: string;
  permalink: string;
  postedAt: number;
}

export async function searchSubreddit(
  subreddit: string,
  keyword: string,
  limit = 25,
): Promise<FetchedPost[]> {
  const token = await getToken();
  const url = new URL(`https://oauth.reddit.com/r/${subreddit}/search`);
  url.searchParams.set("q", keyword);
  url.searchParams.set("restrict_sr", "true");
  url.searchParams.set("sort", "new");
  url.searchParams.set("t", "hour");
  url.searchParams.set("limit", String(limit));

  const res = await withRetry(async () => {
    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "web:com.gethebra.app:v1.0.0 (by /u/hebra_app)",
      },
    });
    if (!r.ok) {
      const err = new Error(`Reddit search failed: ${r.status}`) as Error & { status: number };
      err.status = r.status;
      throw err;
    }
    return r;
  });

  const json = (await res.json()) as SearchListing;
  return json.data.children
    .map((c) => c.data)
    .filter((p) => p.author !== "[deleted]" && p.title !== "[deleted]")
    .map((p) => ({
      redditId: `t3_${p.id}`,
      subreddit: p.subreddit,
      title: p.title,
      body: p.selftext ?? "",
      author: p.author,
      url: p.url,
      permalink: `https://reddit.com${p.permalink}`,
      postedAt: p.created_utc * 1000,
    }));
}
