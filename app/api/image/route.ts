import { NextResponse } from 'next/server';

export const revalidate = 86400;

/**
 * Product photo for Guess the Price: looks the item up on Wikipedia and streams the lead image back from our own
 * origin, so the studio can draw it into the episode video (a cross-origin image would block the recording canvas).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.slice(0, 120);
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 });
  const ua = { 'user-agent': 'StudioThree/1.0 (https://theboys.space)' };
  try {
    const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=900&titles=${encodeURIComponent(q)}`;
    let src = Object.values((await (await fetch(api, { headers: ua, next: { revalidate } })).json())?.query?.pages ?? {})
      .map((p) => (p as { thumbnail?: { source: string } }).thumbnail?.source).find(Boolean);
    if (!src) {
      const search = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(q)}&prop=pageimages&piprop=thumbnail&pithumbsize=900`;
      src = Object.values((await (await fetch(search, { headers: ua, next: { revalidate } })).json())?.query?.pages ?? {})
        .map((p) => (p as { thumbnail?: { source: string } }).thumbnail?.source).find(Boolean);
    }
    if (!src) return NextResponse.json({ error: 'No image' }, { status: 404 });
    const img = await fetch(src, { headers: ua, next: { revalidate } });
    if (!img.ok) return NextResponse.json({ error: 'No image' }, { status: 404 });
    return new NextResponse(img.body, { headers: { 'content-type': img.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'public, max-age=86400, s-maxage=604800' } });
  } catch {
    return NextResponse.json({ error: 'No image' }, { status: 502 });
  }
}
