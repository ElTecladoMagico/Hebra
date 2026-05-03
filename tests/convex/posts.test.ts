import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

describe("posts.upsertBatch", () => {
  test("inserts new posts and returns their ids", async () => {
    const t = convexTest(schema);
    const ids = await t.mutation(internal.posts.upsertBatch, {
      posts: [
        {
          redditId: "t3_aaa",
          subreddit: "españa",
          title: "Busco dev",
          body: "Tío, busco freelance",
          author: "u1",
          url: "https://reddit.com/x",
          permalink: "https://reddit.com/r/españa/comments/aaa/",
          postedAt: 1714485600000,
        },
      ],
    });
    expect(ids).toHaveLength(1);
  });

  test("dedupes by redditId across batches", async () => {
    const t = convexTest(schema);
    const post = {
      redditId: "t3_bbb",
      subreddit: "españa",
      title: "Hola",
      body: "Mundo",
      author: "u1",
      url: "https://reddit.com/y",
      permalink: "https://reddit.com/r/españa/comments/bbb/",
      postedAt: 1714485600000,
    };
    await t.mutation(internal.posts.upsertBatch, { posts: [post] });
    const second = await t.mutation(internal.posts.upsertBatch, { posts: [post] });
    expect(second).toHaveLength(0); // duplicate not inserted
    const all = await t.run(async (ctx) =>
      ctx.db
        .query("redditPosts")
        .withIndex("by_redditId", (q) => q.eq("redditId", "t3_bbb"))
        .collect(),
    );
    expect(all).toHaveLength(1);
  });

  test("tags es-ES dialect when title contains 'tío'", async () => {
    const t = convexTest(schema);
    const ids = await t.mutation(internal.posts.upsertBatch, {
      posts: [
        {
          redditId: "t3_ccc",
          subreddit: "españa",
          title: "Tío, busco programador",
          body: "para mi proyecto",
          author: "u1",
          url: "https://reddit.com/z",
          permalink: "https://reddit.com/r/españa/comments/ccc/",
          postedAt: 1714485600000,
        },
      ],
    });
    const post = await t.run(async (ctx) => ctx.db.get(ids[0]));
    expect(post?.detectedDialect).toBe("es-ES");
  });
});
