import test from "node:test";
import assert from "node:assert/strict";
import {
  relativeRoute,
  studioScreen,
  studioPath,
  loginDestination,
} from "../src/platform/routes.js";
import {
  channelId,
  fallbackVideo,
  latestVideo,
  parseVideoFeed,
  validVideo,
} from "../src/public/video.js";
const feed = `<feed><yt:channelId>${channelId}</yt:channelId><entry><yt:videoId>95hoTNaS6xo</yt:videoId><title>FVT &amp; fantasy &lt;keuzes&gt;</title><published>2026-10-06T14:15:43Z</published></entry></feed>`;
test("public login always enters Studio; canonical and legacy screens survive reload", () => {
  for (const path of [
    "/",
    "/videos",
    "/community",
    "/about",
    "/privacy",
    "/contact",
    "/auth/callback",
  ])
    assert.equal(loginDestination(path), "/studio");
  for (const path of ["/studio/players", "/players"])
    assert.equal(studioScreen(path), "players");
  assert.equal(studioScreen("/studio/"), "dashboard");
  assert.equal(studioPath(), "/studio");
  assert.equal(loginDestination("/studio/optimizer"), "/studio/optimizer");
  assert.equal(studioScreen("/fvt/studio/fixtures", "/fvt/"), "fixtures");
  assert.equal(studioPath("compare", "/fvt/"), "/fvt/studio/compare");
  assert.equal(relativeRoute("/videos/"), "videos");
});
test("YouTube XML: fixed channel, validated identities, decoded text, malformed and entity feeds rejected", () => {
  assert.equal(parseVideoFeed(feed).title, "FVT & fantasy <keuzes>");
  for (const xml of [
    "",
    feed.replace(channelId, "other"),
    feed.replace("95hoTNaS6xo", "bad/id"),
    feed.replace("2026-10-06T14:15:43Z", "invalid"),
    `<!DOCTYPE feed>${feed}`,
    "x".repeat(1000001),
  ])
    assert.throws(() => parseVideoFeed(xml));
  assert.equal(validVideo({ ...fallbackVideo, id: "javascript:evil" }), false);
});
test("video API uses a verified fallback on upstream failures and invalid data", async () => {
  for (const fetcher of [
    async () => {
      throw Error("offline");
    },
    async () => new Response("", { status: 503 }),
    async () => new Response("<html>blocked</html>"),
    async () => new Response("x".repeat(1000001)),
  ]) {
    assert.deepEqual(await latestVideo(fetcher), {
      video: fallbackVideo,
      source: "fallback",
    });
  }
  const result = await latestVideo(async (url, options) => {
    assert.match(
      url,
      /^https:\/\/www.youtube.com\/feeds\/videos.xml\?channel_id=/,
    );
    assert(options.signal);
    return new Response(feed);
  });
  assert.equal(result.source, "youtube");
  assert.equal(result.video.id, fallbackVideo.id);
});
