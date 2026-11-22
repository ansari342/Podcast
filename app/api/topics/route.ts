import { NextResponse } from 'next/server';
import { TOPICS_EVERGREEN } from '@/lib/gameContent';

export const revalidate = 1800; // refresh every 30 minutes (C2)

/**
 * Topics (C1–C3): today's headlines from Google News (top, entertainment, sports, tech) plus evergreen debates.
 * TODO(C4): rank by what performs on the channel once YouTube Analytics is connected.
 */
const FEEDS: [string, string][] = [
  ['Top', 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'],
  ['Entertainment', 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en'],
  ['Sports', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en'],
  ['Tech', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en'],
];

const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function GET() {
  const news = (await Promise.all(FEEDS.map(async ([section, url]) => {
    try {
      const xml = await (await fetch(url, { next: { revalidate: 1800 } })).text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map((m) => {
        const raw = decode(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
        const i = raw.lastIndexOf(' - ');
        return { section, title: i > 0 ? raw.slice(0, i) : raw, source: i > 0 ? raw.slice(i + 3) : '', link: decode(m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '') };
      });
    } catch { return []; }
  }))).flat();
  return NextResponse.json({ news, debates: TOPICS_EVERGREEN, updatedAt: Date.now() });
}
