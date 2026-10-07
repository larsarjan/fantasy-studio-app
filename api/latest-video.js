import { latestVideo } from "../src/public/video.js";
export async function GET() {
  const result = await latestVideo();
  return Response.json(result, {
    headers: {
      "Cache-Control":
        result.source === "youtube"
          ? "public, s-maxage=1800, stale-while-revalidate=86400"
          : "public, s-maxage=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
