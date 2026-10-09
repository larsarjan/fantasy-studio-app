import { latestVideo } from "../src/public/video.js";
import { createClient } from '@supabase/supabase-js';
export async function GET(request) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: 'Video service unavailable' }, { status: 503 });
  const authorization = request?.headers?.get('authorization');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: authorization ? { Authorization: authorization } : {} } });
  const catalog = await db.rpc('public_video_catalog');
  if (catalog.error) return Response.json({ error: 'Videos unavailable' }, { status: catalog.error.code === '42501' ? 403 : 503, headers: { 'Cache-Control': 'no-store' } });
  const result = await latestVideo();
  const suppressed = new Set(catalog.data.suppressed);
  const overrides = catalog.data.videos.map(v => ({ id: v.youtube_id, title: v.title, published: v.published_at, category: v.category, featured: v.featured, thumbnail_url: v.thumbnail_url, sort_order: v.sort_order, channel: 'Fantasy Voetbal Talk Eredivisie' }));
  const curated = new Set(overrides.map(v => v.id));
  result.videos = [...overrides, ...(result.videos || [result.video]).filter(v => v && !curated.has(v.id) && !suppressed.has(v.id))].sort((a,b) => Number(b.featured || 0)-Number(a.featured || 0) || Number(a.sort_order || 0)-Number(b.sort_order || 0) || Date.parse(b.published)-Date.parse(a.published));
  result.video = result.videos[0] || null;
  return Response.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
