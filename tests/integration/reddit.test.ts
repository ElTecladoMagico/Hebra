// @vitest-environment node
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import searchPage from "../fixtures/reddit/search-page.json";
import deletedPage from "../fixtures/reddit/post-deleted.json";
import { _resetTokenCacheForTests, searchSubreddit } from "../../convex/lib/reddit";

const server = setupServer(
  http.post("https://www.reddit.com/api/v1/access_token", () =>
    HttpResponse.json({ access_token: "fake_token", expires_in: 3600 }),
  ),
);

beforeAll(() => {
  process.env.REDDIT_CLIENT_ID = "test_id";
  process.env.REDDIT_CLIENT_SECRET = "test_secret";
  process.env.REDDIT_USERNAME = "test_user";
  process.env.REDDIT_PASSWORD = "test_pw";
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  _resetTokenCacheForTests();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("searchSubreddit", () => {
  test("returns mapped FetchedPost array", async () => {
    server.use(
      http.post("https://www.reddit.com/api/v1/access_token", () =>
        HttpResponse.json({ access_token: "fake_token", expires_in: 3600 }),
      ),
      http.get("https://oauth.reddit.com/r/:sub/search", () =>
        HttpResponse.json(searchPage),
      ),
    );
    const posts = await searchSubreddit("españa", "programador");
    expect(posts).toHaveLength(1);
    expect(posts[0].redditId).toBe("t3_abc123");
    expect(posts[0].subreddit).toBe("españa");
    expect(posts[0].title).toBe("Busco programador para web");
    expect(posts[0].permalink).toBe(
      "https://reddit.com/r/españa/comments/abc123/busco_programador/",
    );
    expect(posts[0].postedAt).toBe(1714485600 * 1000);
  });

  test("filters out deleted authors and titles", async () => {
    server.use(
      http.post("https://www.reddit.com/api/v1/access_token", () =>
        HttpResponse.json({ access_token: "fake_token", expires_in: 3600 }),
      ),
      http.get("https://oauth.reddit.com/r/:sub/search", () =>
        HttpResponse.json(deletedPage),
      ),
    );
    const posts = await searchSubreddit("españa", "any");
    expect(posts).toHaveLength(0);
  });

  test("retries on 503 then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post("https://www.reddit.com/api/v1/access_token", () =>
        HttpResponse.json({ access_token: "fake_token", expires_in: 3600 }),
      ),
      http.get("https://oauth.reddit.com/r/:sub/search", () => {
        calls++;
        if (calls < 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json(searchPage);
      }),
    );
    const posts = await searchSubreddit("españa", "any");
    expect(posts).toHaveLength(1);
    expect(calls).toBe(2);
  });

  test("throws on auth failure (non-retryable 401)", async () => {
    server.use(
      http.post("https://www.reddit.com/api/v1/access_token", () =>
        HttpResponse.text("forbidden", { status: 401 }),
      ),
    );
    await expect(searchSubreddit("españa", "any")).rejects.toThrow(/Reddit auth failed: 401/);
  });
});
