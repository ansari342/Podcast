import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { canUseRoom, whoami } from '@/lib/auth';
import { s3 } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

/**
 * Plan import (P1): Instinct emails the day's agenda; an inbound-email service (Postmark or CloudMailin) turns the email
 * into JSON and POSTs it here: /api/agenda?token=<AGENDA_TOKEN>. We keep the latest agenda; the studio offers it as the plan.
 * GET (signed in, or in a room) returns the latest agenda.
 */
const KEY = 'agenda/latest.json';

function toItems(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n|(?<=\.)\s+(?=\d+[.)]\s)/)
    .map((l) => l.replace(/^\s*(?:[-*•–·>]|\d+[.)]|\[[ x]\])\s*/i, '')                    // bullets, numbers, checkboxes
      .replace(/^\s*\(?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\)?\s*[-–—:|]?\s*/i, '') // leading times (P3: no times shown)
      .replace(/\s*\(\d+\s*(?:min|mins|minutes)\)\s*$/i, '')                                 // trailing durations
      .trim())
    .filter((l) => l.length > 1 && l.length < 140 && !/^(sent from|--|on .+ wrote:|unsubscribe|view in browser|https?:\/\/|hi\b|hey\b|hello\b|good (morning|afternoon|evening)|thanks|cheers)/i.test(l) && !/:$/.test(l))
    .slice(0, 25);
}

export async function POST(req: Request) {
  const token = process.env.AGENDA_TOKEN;
  const u = new URL(req.url);
  const basic = (req.headers.get('authorization') ?? '').replace(/^Basic\s+/i, '');
  const basicPass = basic ? atob(basic).split(':').slice(1).join(':') : '';
  if (!token || (u.searchParams.get('token') !== token && basicPass !== token)) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  const c = s3(); if (!c) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });

  // Postmark: {Subject, TextBody, HtmlBody, From}; CloudMailin JSON: {headers:{subject,from}, plain, html}; plain form posts too.
  const ct = req.headers.get('content-type') ?? '';
  const b: Record<string, any> = ct.includes('json') ? await req.json() : Object.fromEntries((await req.formData()).entries()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const subject = String(b.Subject ?? b.headers?.subject ?? b.subject ?? 'Agenda');
  const from = String(b.From ?? b.headers?.from ?? b.from ?? '');
  const text = String(b.StrippedTextReply || b.TextBody || b.plain || b.text || b['body-plain'] || '').trim()
    || String(b.HtmlBody ?? b.html ?? '').replace(/<(br|\/p|\/li|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const items = toItems(text);
  const agenda = { subject, from, receivedAt: Date.now(), items };
  await c.client.send(new PutObjectCommand({ Bucket: c.bucket, Key: KEY, Body: JSON.stringify(agenda), ContentType: 'application/json' }));
  return NextResponse.json({ ok: true, items: items.length });
}

export async function GET(req: Request) {
  const room = new URL(req.url).searchParams.get('session') ?? '';
  if (!(await whoami(req)) && !(room && (await canUseRoom(req, room)))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  const c = s3(); if (!c) return NextResponse.json({ agenda: null });
  try { const r = await c.client.send(new GetObjectCommand({ Bucket: c.bucket, Key: KEY })); return NextResponse.json({ agenda: JSON.parse(await r.Body!.transformToString()) }); }
  catch { return NextResponse.json({ agenda: null }); }
}
