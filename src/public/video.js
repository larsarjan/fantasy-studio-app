export const channelId = "UCj3NGUiqw1zqEQ-djIu71zQ";
export const channelUrl =
  "https://www.youtube.com/@FantasyVoetbalTalkEredivisie";
export const instagramUrl =
  "https://www.instagram.com/fantasyvoetbaltalkeredivisie/";
export const fallbackVideo = Object.freeze({
  id: "95hoTNaS6xo",
  title:
    "Fantasy Voetbal TEAMCHECK 🔥 | Wij beoordelen jullie teams! ft. EFV Tips | Deel 1",
  published: "2026-10-06T14:15:43+00:00",
  channel: "Fantasy Voetbal Talk Eredivisie",
});
export function validVideo(video) {
  return (
    video &&
    /^[\w-]{11}$/.test(video.id) &&
    typeof video.title === "string" &&
    video.title.length > 0 &&
    video.title.length < 500 &&
    typeof video.published === "string" &&
    Number.isFinite(Date.parse(video.published))
  );
}
const decode = (value) =>
  value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = {
      "&amp;": "&",
      "&quot;": '"',
      "&apos;": "'",
      "&lt;": "<",
      "&gt;": ">",
    };
    if (named[entity]) return named[entity];
    const n = entity.startsWith("&#x")
      ? parseInt(entity.slice(3, -1), 16)
      : parseInt(entity.slice(2, -1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
export function parseVideoFeed(xml) {
  if (
    typeof xml !== "string" ||
    xml.length > 1000000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw new Error("Invalid feed");
  if (!xml.includes(`<yt:channelId>${channelId}</yt:channelId>`))
    throw new Error("Unexpected channel");
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  const field = (tag) =>
    decode(
      entry
        ?.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]
        ?.trim() ?? "",
    );
  const video = {
    id: field("yt:videoId"),
    title: field("title"),
    published: field("published"),
    channel: fallbackVideo.channel,
  };
  if (!validVideo(video)) throw new Error("Invalid video");
  return video;
}
export async function latestVideo(fetcher = fetch) {
  try {
    const response = await fetcher(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("Feed unavailable");
    const reader = response.body.getReader();
    let xml = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      xml += decoder.decode(value, { stream: true });
      if (xml.length > 1000000) {
        await reader.cancel();
        throw new Error("Feed too large");
      }
    }
    xml += decoder.decode();
    return { video: parseVideoFeed(xml), source: "youtube" };
  } catch {
    return { video: fallbackVideo, source: "fallback" };
  }
}
