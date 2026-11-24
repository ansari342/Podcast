'use client';
import { useEffect, useState } from 'react';
import type { SharedStore } from '@/lib/sync';
import type { Person } from '@/hooks/useLiveRoom';
import { GAMES, rulesFor, type GameId } from '@/lib/games';
import * as C from '@/lib/gameContent';
import { autoPoints, newFastMoneyRound, type Survey } from '@/lib/fastMoney';

/**
 * Every game board (G1–G24). State lives in the shared store under `g.<round>.` so all three browsers see the same
 * board; anything one person writes (an answer, a vote, a bid) goes under its own key. Secrets (the word, the number,
 * the question) are shown only to the person who should see them, and never on the recording until revealed.
 */
type M = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type GameRef = { id: GameId; round: number };

const ids = (people: Person[]) => people.map((p) => p.identity);

function initMeta(id: GameId, people: Person[]): M {
  const who = ids(people);
  const someone = () => C.pick(who);
  switch (id) {
    case 'imposter': { const cat = C.pick(Object.keys(C.IMPOSTER)); return { phase: 'clues', cat, word: C.pick(C.IMPOSTER[cat]), imp: someone() }; }
    case 'imposter-question': { const [q, iq] = C.pick(C.IMPOSTER_QUESTIONS); const imp = someone(); return { phase: 'answer', q, iq, imp, reader: C.pick(who.filter((w) => w !== imp)) ?? imp }; }
    case 'tier-list': { const t = C.pick(C.TIER_LISTS); return { topic: t.topic, items: t.items }; }
    case 'fast-money': { const asker = someone(); return { phase: 'ask', asker, guessers: who.filter((w) => w !== asker), qs: newFastMoneyRound(5), i: 0 }; }
    case 'blind-ranking': { const t = C.pick(C.BLIND_RANKING); return { topic: t.topic, items: C.shuffle(t.items).slice(0, 5) }; }
    case 'auction-draft': { const p = C.pick(C.DRAFT_POOLS); return { phase: 'bid', cat: p.cat, pool: C.shuffle(p.items).slice(0, 5 * who.length + 3) }; }
    case 'snake-draft': return { phase: 'pick', cat: C.pick(C.SNAKE_CATEGORIES), order: C.shuffle(who), rounds: 5 };
    case 'most-likely-to': return { prompt: C.pick(C.MOST_LIKELY) };
    case 'red-green-flag': return { prompt: C.pick(C.FLAGS) };
    case 'higher-lower': return { items: C.shuffle(C.HEIGHTS), order: who };
    case 'trivia': return { ...C.pick(C.TRIVIA) };
    case 'thermostat': case 'thermostat-questions': return { holder: someone(), n: 1 + Math.floor(Math.random() * 10), prompts: C.shuffle(C.THERMO_PROMPTS).slice(0, 4) };
    case 'name-3-in-5': return { cats: C.shuffle(C.NAME3), order: who };
    case 'guess-the-sound': return { maker: someone(), sound: C.pick(C.SOUNDS_TO_MAKE) };
    case 'tell-me-without': return { describer: someone(), word: C.pick(C.TELL_WORDS), twist: C.pick(C.TELL_TWISTS) };
    case 'guess-the-price': return { ...C.pick(C.PRICES) };
  }
}

/** Start a game (or a new round of the current one). */
export function startGame(store: SharedStore, id: GameId, people: Person[], patch: M = {}) {
  const round = (store.get<GameRef>('game')?.round ?? 0) + 1;
  store.setMany({ game: { id, round }, [`g.${round}.m`]: { ...initMeta(id, people), ...patch } });
}
export const endGame = (store: SharedStore) => store.set('game', null);

const metaOf = (s: SharedStore) => { const g = s.get<GameRef>('game'); return g ? { g, m: (s.get<M>(`g.${g.round}.m`) ?? {}) } : null; };

/** G3: while the asker speaks, the guessers must not hear them (the asker is still recorded). */
export function mutedForMe(s: SharedStore, me: string): string[] {
  const x = metaOf(s); if (!x || x.g.id !== 'fast-money') return [];
  return x.m.phase === 'ask' && x.m.asker !== me ? [x.m.asker] : [];
}
/** G21: the sound maker's video is hidden from the guessers. */
export function hiddenForMe(s: SharedStore, me: string): string[] {
  const x = metaOf(s); if (!x || x.g.id !== 'guess-the-sound') return [];
  return !s.get(`g.${x.g.round}.revealed`) && x.m.maker !== me ? [x.m.maker] : [];
}

/** What the active video shows for the game (never a secret before the reveal). */
export function caption(s: SharedStore, people: Person[]): { title: string; big: string; lines: string[]; table?: FmTable; image?: string; score?: string } | null {
  const c = captionBody(s, people); if (!c) return null;
  const score = scoreLine(s); return score ? { ...c, score } : c;
}
function captionBody(s: SharedStore, people: Person[]): { title: string; big: string; lines: string[]; table?: FmTable; image?: string } | null {
  const x = metaOf(s); if (!x) return null;
  const { g, m } = x; const P = `g.${g.round}.`; const get = (k: string) => s.get<M>(P + k);
  const name = (id: string) => people.find((p) => p.identity === id)?.name ?? 'Someone';
  const game = GAMES.find((q) => q.id === g.id)!;
  const rev = !!get('revealed');
  switch (g.id) {
    case 'imposter': return { title: game.name, big: m.phase === 'reveal' ? `${name(m.imp)} was the imposter` : `Category: ${m.cat}`, lines: m.phase === 'reveal' ? [`The word was ${m.word}`] : [] };
    case 'imposter-question': {
      const ans = s.under<string>(P + 'ans.'); const shown = s.under<boolean>(P + 'shown.');
      const qOut = m.phase === 'question' || m.phase === 'vote' || m.phase === 'reveal';
      const lines = Object.entries(ans).filter(([id]) => qOut || shown[id]).map(([id, a]) => `${name(id)}: ${a}`);
      return { title: game.name, big: m.phase === 'answer' ? 'Answering…' : qOut ? m.q : 'What was the question?', lines: lines.concat(m.phase === 'reveal' ? [`Imposter: ${name(m.imp)} (“${m.iq}”)`] : []) };
    }
    case 'tier-list': { const pl = s.under<string>(P + 'tier.'); const all = [...m.items, ...Object.values(s.under<string>(P + 'add.'))]; return { title: `${game.name}: ${m.topic}`, big: '', lines: ['S', 'A', 'B', 'C', 'D', 'F'].map((t) => `${t}  ${all.filter((it: string) => pl[slug(it)] === t).join(' · ')}`) }; }
    case 'fast-money': return m.phase === 'ask'
      ? { title: game.name, big: `Question ${m.i + 1} of ${m.qs.length}`, lines: [`${name(m.asker)} is asking — the others can’t hear`] }
      : { title: game.name, big: '', lines: [], table: fmTable(s, P, m, name) };
    case 'trivia': return { title: game.name, big: m.q, lines: rev ? [m.a] : [] };
    case 'guess-the-price': return { title: game.name, big: m.item, lines: rev ? [`$${m.price.toLocaleString()}`] : [], image: m.wiki ? imageUrl(m.wiki) : undefined };
    case 'most-likely-to': case 'red-green-flag': return { title: game.name, big: m.prompt, lines: [] };
    case 'thermostat': case 'thermostat-questions': return { title: game.name, big: rev ? `The number was ${m.n}` : `${name(m.holder)} has a number`, lines: [] };
    case 'higher-lower': { const i = s.get<number>(P + 'i') ?? 0; return { title: game.name, big: `${m.items[i].name}: ${m.items[i].value} m`, lines: [`vs ${m.items[i + 1]?.name ?? '—'}`] }; }
    default: return { title: game.name, big: '', lines: [] };
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function Timer({ endsAt }: { endsAt?: number }) {
  const [, tick] = useState(0);
  useEffect(() => { if (!endsAt) return; const t = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(t); }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  return <span style={{ fontFamily: 'var(--font-head)', fontSize: 56, fontWeight: 700, color: left ? 'var(--text)' : 'var(--rec)' }}>{left}</span>;
}

const Big = ({ children }: { children: React.ReactNode }) => <div style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 600, lineHeight: 1.25 }}>{children}</div>;
const Secret = ({ children }: { children: React.ReactNode }) => <div style={{ padding: '14px 20px', borderRadius: 12, background: '#2A1A12', border: '1px solid var(--accent)', fontSize: 20, fontWeight: 600 }}>{children}</div>;
const Good = ({ children }: { children: React.ReactNode }) => <div style={{ padding: '10px 18px', borderRadius: 12, background: '#13261C', color: '#CDEFD9', fontWeight: 600, fontSize: 18 }}>{children}</div>;
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>{children}</div>;

export function GameBoard({ store, me, people, isHost }: { store: SharedStore; me: string; people: Person[]; isHost: boolean }) {
  const [text, setText] = useState('');
  const x = metaOf(store); if (!x) return null;
  const { g, m } = x;
  const game = GAMES.find((q) => q.id === g.id)!;
  const P = `g.${g.round}.`;
  const get = <T = any,>(k: string) => store.get<T>(P + k); // eslint-disable-line @typescript-eslint/no-explicit-any
  const set = (kv: Record<string, unknown>) => store.setMany(Object.fromEntries(Object.entries(kv).map(([k, v]) => [P + k, v])));
  const setM = (patch: M) => store.set(P + 'm', { ...m, ...patch });
  const under = <T = string,>(k: string) => store.under<T>(P + k);
  const who = ids(people);
  const name = (id: string) => people.find((p) => p.identity === id)?.name ?? 'Someone';
  const others = people.filter((p) => p.identity !== me);
  const again = () => startGame(store, g.id, people);
  const revealed = !!get('revealed');
  const reveal = () => set({ revealed: true });
  const Again = <button className="btn btn-primary" onClick={again}>Next round</button>;

  const VotePeople = ({ k }: { k: string }) => <Vote people={people} mine={get(`${k}.${me}`)} onVote={(id) => set({ [`${k}.${me}`]: id })} />;
  const tally = (k: string) => { const t: Record<string, number> = {}; for (const v of Object.values(under(k + '.'))) t[v] = (t[v] ?? 0) + 1; return t; };
  const voted = (k: string) => Object.keys(under(k + '.')).length;
  const Answer = ({ k, placeholder, numeric }: { k: string; placeholder: string; numeric?: boolean }) =>
    <AnswerBox key={P + k} cur={get<string>(`${k}.${me}`)} placeholder={placeholder} numeric={numeric} onLock={(v) => set({ [`${k}.${me}`]: v })} />;
  const Answers = ({ k }: { k: string }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{Object.entries(under(k + '.')).map(([id, a]) => <span key={id}><strong>{name(id)}</strong>: {String(a)}</span>)}</div>;
  let body: React.ReactNode;
  let winners: string[] | null = null; // set when this round has a clear winner (feeds the scoreboard)
  /** Imposter games: the group wins if the imposter got the most votes outright, otherwise the imposter wins. */
  const impWin = () => { const t = tally('vote'); const top = Math.max(0, ...Object.values(t)); const lead = Object.keys(t).filter((id) => t[id] === top);
    return top > 0 && lead.length === 1 && lead[0] === m.imp ? who.filter((id) => id !== m.imp) : [m.imp]; };
  switch (g.id) {
    case 'imposter': {
      const t = tally('vote'); if (m.phase === 'reveal') winners = impWin();
      body = (<>
        {m.phase !== 'reveal' && (m.imp === me ? <Secret>You’re the imposter. Category: {m.cat}</Secret> : <Secret>Word: {m.word}</Secret>)}
        <Big>Category: {m.cat}</Big>
        {m.phase === 'clues' && (<><button className="btn btn-primary" onClick={() => setM({ phase: 'vote' })}>Start voting</button></>)}
        {m.phase === 'vote' && (<><span>Who’s the imposter? ({voted('vote')}/{who.length})</span>{VotePeople({ k: "vote",})}<button className="btn btn-primary" onClick={() => setM({ phase: 'reveal' })}>Reveal</button></>)}
        {m.phase === 'reveal' && (<><Good>{name(m.imp)} was the imposter · word: {m.word}</Good><span className="muted">{Object.entries(t).map(([id, n]) => `${name(id)} ${n}`).join(' · ')}</span>{Again}</>)}
      </>); break;
    }
    case 'imposter-question': {
      const answered = voted('ans'); const ans = under('ans.'); const shown = under<boolean>('shown.');
      const allShown = Object.keys(ans).length > 0 && Object.keys(ans).every((id) => shown[id]);
      const reader: string = m.reader ?? who.find((w) => w !== m.imp) ?? m.imp;
      const qOut = m.phase === 'question' || m.phase === 'vote' || m.phase === 'reveal';
      if (m.phase === 'reveal') winners = impWin();
      body = (<>
        {m.phase === 'answer' && (<><Secret>{m.imp === me ? m.iq : m.q}</Secret>{Answer({ k: "ans", placeholder: "Your answer",})}<span className="muted" style={{ fontSize: 13 }}>{answered}/{who.length}</span>
          {answered >= who.length || isHost ? <button className="btn btn-primary" onClick={() => setM({ phase: 'answers' })}>Reveal answers</button> : null}</>)}
        {m.phase === 'answers' && (<>
          <Big>What was the question?</Big>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 300 }}>
            {people.map((p) => { const a = ans[p.identity]; return (
              <div key={p.identity} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderRadius: 10, background: 'var(--panel-2)' }}>
                <strong>{p.isLocal ? 'You' : p.name}</strong>
                {a === undefined ? <span className="muted">No answer</span>
                  : shown[p.identity] ? <span style={{ fontSize: 20, fontWeight: 600 }}>{a}</span>
                  : p.identity === me ? <button className="btn btn-primary" style={{ minHeight: 34 }} onClick={() => set({ [`shown.${me}`]: true })}>Reveal my answer</button>
                  : <span className="muted">Hidden</span>}
              </div>); })}
          </div>
          {!allShown && <button className="btn" style={{ fontSize: 13, minHeight: 32 }} onClick={() => set(Object.fromEntries(Object.keys(ans).map((id) => [`shown.${id}`, true])))}>Reveal everyone’s</button>}
          {allShown && (reader === me
            ? <><Secret>Read aloud: {m.q}</Secret><button className="btn btn-primary" onClick={() => setM({ phase: 'question' })}>Show question</button></>
            : <><Good>{name(reader)} is reading the question out loud</Good><button className="btn" style={{ fontSize: 13, minHeight: 32 }} onClick={() => setM({ phase: 'question' })}>Show the question</button></>)}
        </>)}
        {qOut && (<><Big>{m.q}</Big>{Answers({ k: "ans",})}</>)}
        {m.phase === 'question' && <button className="btn btn-primary" onClick={() => setM({ phase: 'vote' })}>Vote</button>}
        {m.phase === 'vote' && (<><span>Who’s the imposter?</span>{VotePeople({ k: "vote",})}<button className="btn btn-primary" onClick={() => setM({ phase: 'reveal' })}>Reveal</button></>)}
        {m.phase === 'reveal' && (<><Good>{name(m.imp)} was the imposter — their question: “{m.iq}”</Good>{Again}</>)}
      </>); break;
    }
    case 'tier-list': {
      const pl = under('tier.'); const extra = Object.values(under('add.')); const all: string[] = [...m.items, ...extra];
      const sel = get<string>(`sel.${me}`);
            body = (<>
        <Big>{m.topic}</Big>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['S', 'A', 'B', 'C', 'D', 'F'].map((t, i) => (
            <div key={t} onClick={() => sel && set({ [`tier.${slug(sel)}`]: t, [`sel.${me}`]: null })} style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 40, borderRadius: 8, background: 'var(--panel-2)', cursor: sel ? 'pointer' : 'default', outline: sel ? '1px dashed var(--accent)' : 'none' }}>
              <span style={{ width: 40, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, borderRadius: '8px 0 0 8px', color: '#111', background: ['#FF7F7F', '#FFBF7F', '#FFDF7F', '#BFFF7F', '#7FBFFF', '#BF7FBF'][i] }}>{t}</span>
              {all.filter((it) => pl[slug(it)] === t).map((it) => <span key={it} onClick={(e) => { e.stopPropagation(); set({ [`sel.${me}`]: it }); }} style={{ padding: '4px 8px', borderRadius: 6, background: sel === it ? 'var(--accent)' : 'var(--panel)', cursor: 'pointer' }}>{it}</span>)}
            </div>))}
        </div>
        <Row>{all.filter((it) => !pl[slug(it)]).map((it) => <button key={it} className="btn" style={{ minHeight: 34, background: sel === it ? 'var(--accent)' : undefined, color: sel === it ? 'var(--bg)' : undefined }} onClick={() => set({ [`sel.${me}`]: sel === it ? null : it })}>{it}</button>)}</Row>
        <span className="muted" style={{ fontSize: 13 }}>{sel ? `Now tap a tier for “${sel}”` : 'Tap an item, then a tier.'}</span>
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { set({ [`add.${Date.now()}`]: text.trim() }); setText(''); } }} style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Add an item" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn">Add</button>
        </form>
        <button className="btn" onClick={again}>New topic</button>
      </>); break;
    }
    case 'fast-money': {
      if (m.phase === 'reveal') winners = fmWinners(fmTable(store, P, m, name), m.guessers ?? []);
      body = <FastMoney store={store} P={P} m={m} me={me} people={people} name={name} answer={(k, ph) => Answer({ k, placeholder: ph })} />; break;
    }
    case 'blind-ranking': {
      const shown = get<number>('shown') ?? 0; const item = m.items[shown] as string | undefined;
      const mine = under<number>(`p.${me}.`);
      const taken = new Set(Object.values(mine));
      const placedCur = item !== undefined && mine[String(shown)] !== undefined;
      body = (<>
        <Big>{m.topic}</Big>
        {item !== undefined ? (<><Secret>{item}</Secret>
          {!placedCur ? <Row>{[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn" disabled={taken.has(n)} onClick={() => set({ [`p.${me}.${shown}`]: n })}>#{n}</button>)}</Row> : <span className="muted">Placed. Waiting for the next item.</span>}
          <button className="btn btn-primary" onClick={() => set({ shown: shown + 1 })}>Next item</button></>) : <Good>All five ranked</Good>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${people.length}, minmax(0,1fr))`, gap: 12, width: '100%' }}>
          {people.map((p) => { const r = under<number>(`p.${p.identity}.`); return (
            <div key={p.identity} className="panel" style={{ padding: 10, background: 'var(--panel-2)' }}><strong>{p.isLocal ? 'You' : p.name}</strong>
              {[1, 2, 3, 4, 5].map((n) => { const idx = Object.entries(r).find(([, v]) => v === n)?.[0]; return <div key={n} style={{ fontSize: 14 }}>#{n} {idx !== undefined ? m.items[Number(idx)] : '—'}</div>; })}
            </div>); })}
        </div>
        {item === undefined && Again}
      </>); break;
    }
    case 'auction-draft': {
      const won = under<{ by: string; price: number }>('won.');
      const spent = (id: string) => Object.values(won).filter((w) => w.by === id).reduce((a, w) => a + w.price, 0);
      const count = (id: string) => Object.values(won).filter((w) => w.by === id).length;
      const cur = get<number>('cur');
      const bids = cur !== undefined ? under<number>(`bid.${cur}.`) : {};
      const top = Object.entries(bids).sort((a, b) => b[1] - a[1] || who.indexOf(a[0]) - who.indexOf(b[0]))[0];
      const high = top?.[1] ?? 0;
      const left = 20 - spent(me); const full = count(me) >= 5;
      const maxBid = left - Math.max(0, 4 - count(me)); // keep $1 for each empty slot
      const done = people.every((p) => count(p.identity) >= 5) || m.pool.every((_: string, i: number) => won[String(i)]);
      body = (<>
        <Big>{m.cat}</Big>
        <span className="muted">$20 each · 5 items · You have ${left} and {count(me)}/5</span>
        {!done && cur === undefined && (<><span>Pick the next item to auction</span><Row>{m.pool.map((it: string, i: number) => !won[String(i)] && <button key={i} className="btn" onClick={() => set({ cur: i })}>{it}</button>)}</Row></>)}
        {!done && cur !== undefined && (<><Secret>{m.pool[cur]}</Secret>
          <span>{top ? `${name(top[0])} leads at $${high}` : 'No bids yet'}</span>
          {!full && <Row>{[1, 2, 5].map((n) => <button key={n} className="btn" disabled={high + n > maxBid} onClick={() => set({ [`bid.${cur}.${me}`]: high + n })}>${high + n}</button>)}</Row>}
          <button className="btn btn-primary" disabled={!top} onClick={() => set({ [`won.${cur}`]: { by: top![0], price: high }, cur: null })}>Sold</button></>)}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${people.length}, minmax(0,1fr))`, gap: 12, width: '100%' }}>
          {people.map((p) => (<div key={p.identity} className="panel" style={{ padding: 10, background: 'var(--panel-2)' }}>
            <strong>{p.isLocal ? 'You' : p.name}</strong> <span className="muted">${20 - spent(p.identity)} left</span>
            {Object.entries(won).filter(([, w]) => w.by === p.identity).map(([i, w]) => <div key={i} style={{ fontSize: 14 }}>{m.pool[Number(i)]} · ${w.price}</div>)}
          </div>))}
        </div>
        {done && (<><span>Best list?</span>{VotePeople({ k: "vote",})}{voted('vote') > 0 && <span className="muted">{Object.entries(tally('vote')).map(([id, n]) => `${name(id)} ${n}`).join(' · ')}</span>}{Again}</>)}
      </>); break;
    }
    case 'snake-draft': {
      const picks = under<{ by: string; text: string }>('pick.');
      const n = Object.keys(picks).length; const total = m.rounds * m.order.length;
      const roundIdx = Math.floor(n / m.order.length); const pos = n % m.order.length;
      const turn = m.order[roundIdx % 2 === 0 ? pos : m.order.length - 1 - pos];
            body = (<>
        <Big>{m.cat}</Big>
        {n < total ? (turn === me
          ? <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { set({ [`pick.${String(n).padStart(3, '0')}`]: { by: me, text: text.trim() } }); setText(''); } }} style={{ display: 'flex', gap: 8 }}>
              <input className="input" autoFocus placeholder="Your pick" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn btn-primary">Pick</button></form>
          : <span>{name(turn)} is picking… (round {roundIdx + 1} of {m.rounds})</span>) : <Good>Draft complete</Good>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${m.order.length}, minmax(0,1fr))`, gap: 12, width: '100%' }}>
          {m.order.map((id: string) => (<div key={id} className="panel" style={{ padding: 10, background: 'var(--panel-2)', outline: id === turn && n < total ? '1px solid var(--accent)' : 'none' }}>
            <strong>{id === me ? 'You' : name(id)}</strong>
            {Object.values(picks).filter((p) => p.by === id).map((p, i) => <div key={i} style={{ fontSize: 14 }}>{i + 1}. {p.text}</div>)}
          </div>))}
        </div>
        {n >= total && (<><span>Best list?</span>{VotePeople({ k: "vote",})}{Again}</>)}
      </>); break;
    }
    case 'most-likely-to': {
      const t = tally('vote');
      body = (<><Big>{m.prompt}</Big>{VotePeople({ k: "vote",})}<span className="muted">{voted('vote')}/{who.length} voted</span>
        {revealed ? <Good>{Object.entries(t).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${name(id)} ${n}`).join(' · ')}</Good> : <button className="btn btn-primary" onClick={reveal}>Reveal</button>}
        {Again}</>); break;
    }
    case 'red-green-flag': {
      const mine = get(`vote.${me}`); const t = tally('vote');
      body = (<><Big>{m.prompt}</Big>
        <Row>{(['red', 'green'] as const).map((c) => <button key={c} className="btn" onClick={() => set({ [`vote.${me}`]: c })} style={{ minWidth: 140, background: c === 'red' ? (mine === c ? '#F0524F' : '#3A1E1E') : (mine === c ? '#7FD6A4' : '#1B3326'), color: mine === c ? '#111' : 'var(--text)', fontWeight: 600 }}>{c === 'red' ? 'Red flag' : 'Green flag'}</button>)}</Row>
        <span className="muted">{voted('vote')}/{who.length} voted</span>
        {revealed ? <Good>{Object.entries(under('vote.')).map(([id, c]) => `${name(id)}: ${c}`).join(' · ')}{t.red && t.green ? ' — split! 30 seconds to argue.' : ''}</Good> : <button className="btn btn-primary" onClick={reveal}>Reveal</button>}
        {Again}</>); break;
    }
    case 'higher-lower': {
      const i = get<number>('i') ?? 0; const turnIdx = get<number>('turn') ?? 0; const turn = m.order[turnIdx % m.order.length];
      const a = m.items[i], b = m.items[i + 1]; const last = get<{ ok: boolean; v: number }>('last');
      const streak = get<number>(`streak.${turn}`) ?? 0; const best = under<number>('best.');
      const guess = (hi: boolean) => {
        const ok = hi ? b.value >= a.value : b.value <= a.value;
        const s = ok ? streak + 1 : 0;
        set({ i: i + 1, last: { ok, v: b.value }, [`streak.${turn}`]: s, [`best.${turn}`]: Math.max(best[turn] ?? 0, ok ? s : streak), ...(ok ? {} : { turn: turnIdx + 1 }) });
      };
      body = (<>
        
        {last && <span style={{ color: last.ok ? 'var(--good)' : 'var(--rec)' }}>{last.ok ? 'Correct' : 'Wrong'} — {m.items[i].name} is {last.v} m</span>}
        {b ? (<><Big>{a.name}: {a.value} m</Big><span>vs</span><Big>{b.name}</Big>
          {turn === me || people.length === 1 ? <Row><button className="btn btn-primary" onClick={() => guess(true)}>Higher</button><button className="btn btn-primary" onClick={() => guess(false)}>Lower</button></Row>
            : <span>{name(turn)}’s turn · streak {streak}</span>}</>) : <Good>Out of items</Good>}
        <span className="muted">Best streaks: {people.map((p) => `${p.isLocal ? 'You' : p.name} ${best[p.identity] ?? 0}`).join(' · ')}</span>
        {!b && Again}
      </>); break;
    }
    case 'trivia': {
      const closest = () => { if (m.n === undefined) return null; const g2 = Object.entries(under('guess.')).map(([id, v]) => [id, Math.abs(parseFloat(String(v).replace(/[^0-9.-]/g, '')) - m.n)] as const).filter(([, d]) => !Number.isNaN(d)).sort((x2, y) => x2[1] - y[1]); return g2[0]?.[0]; };
      const w = revealed ? closest() : null; if (w) winners = [w];
      body = (<><Big>{m.q}</Big>{people.length > 1 && Answer({ k: "guess", placeholder: "Your guess", numeric: m.n !== undefined,})}
        {revealed && (<><Good>{m.a}</Good>{Answers({ k: "guess",})}{w && <span>Closest: <strong>{name(w)}</strong></span>}</>)}
        <Row>{!revealed && <button className="btn btn-primary" onClick={reveal}>Reveal answer</button>}<button className="btn" onClick={again}>Next question</button></Row></>); break;
    }
    case 'thermostat': case 'thermostat-questions': {
      const holder = m.holder === me;
      body = (<>
        {holder ? <Secret>Your number: {m.n}</Secret> : <Big>{name(m.holder)} has a secret number from 1 to 10</Big>}
        {g.id === 'thermostat' ? <span className="muted">{holder ? 'Show it with your face and body — no words, no numbers.' : 'Read them and guess.'}</span>
          : <><span className="muted">{holder ? 'Answer each question at the level of your number (1 = worst, 10 = best).' : 'Ask questions like these, then guess:'}</span><Row>{m.prompts.map((p: string) => <span key={p} className="btn" style={{ minHeight: 32, cursor: 'default' }}>{p}</span>)}</Row></>}
        {!holder && Answer({ k: "guess", placeholder: "1–10", numeric: true,})}
        {revealed ? <><Good>The number was {m.n}</Good>{Answers({ k: "guess",})}</> : <button className="btn btn-primary" onClick={reveal}>Reveal number</button>}
        {Again}
      </>); break;
    }
    case 'name-3-in-5': {
      const k = get<number>('k') ?? 0; const turn = m.order[k % m.order.length]; const cat = m.cats[k % m.cats.length];
      const endsAt = get<number>('endsAt'); const score = under<number>('score.');
      body = (<>
        <span className="muted">{turn === me ? 'Your turn' : `${name(turn)}’s turn`}</span><Big>{cat}</Big>
        {endsAt ? <Timer endsAt={endsAt} /> : <button className="btn btn-primary" onClick={() => set({ endsAt: Date.now() + 5000 })}>Go (5 seconds)</button>}
        {endsAt && turn !== me && <Row><button className="btn" onClick={() => set({ [`score.${turn}`]: (score[turn] ?? 0) + 1, k: k + 1, endsAt: null })}>Got all 3 ✓</button><button className="btn" onClick={() => set({ k: k + 1, endsAt: null })}>Missed ✗</button></Row>}
        <span className="muted">{people.map((p) => `${p.isLocal ? 'You' : p.name} ${score[p.identity] ?? 0}`).join(' · ')}</span>
      </>); break;
    }
    case 'guess-the-sound': {
      const maker = m.maker === me; const endsAt = get<number>('endsAt');
      body = (<>
        {maker ? <><Secret>Make the sound of: {m.sound}</Secret></> : <Big>Listen to {name(m.maker)}…</Big>}
        {endsAt ? <Timer endsAt={endsAt} /> : maker && <button className="btn btn-primary" onClick={() => set({ endsAt: Date.now() + 3000 })}>Go (3 seconds)</button>}
        {!maker && Answer({ k: "guess", placeholder: "What was it?",})}
        {revealed ? <><Good>{m.sound}</Good>{Answers({ k: "guess",})}</> : <button className="btn" onClick={reveal}>Reveal</button>}
        {Again}
      </>); break;
    }
    case 'tell-me-without': {
      const d = m.describer === me; const endsAt = get<number>('endsAt');
      body = (<>
        <span className="muted">Rule: <strong style={{ color: 'var(--text)' }}>{m.twist}</strong></span>
        {d ? <Secret>Describe: {m.word}</Secret> : <Big>{name(m.describer)} is describing</Big>}
        {endsAt ? <Timer endsAt={endsAt} /> : <button className="btn btn-primary" onClick={() => set({ endsAt: Date.now() + 60000 })}>Start 60 seconds</button>}
        {revealed ? <Good>{m.word}</Good> : <button className="btn" onClick={reveal}>Got it / reveal</button>}
        {Again}
      </>); break;
    }
    case 'guess-the-price': {
      const parsed = Object.entries(under('guess.')).map(([id, v]) => [id, parseFloat(String(v).replace(/[^0-9.]/g, ''))] as const).filter(([, n]) => !Number.isNaN(n));
      const win = parsed.filter(([, n]) => n <= m.price).sort((a, b) => b[1] - a[1])[0];
      if (revealed) winners = win ? [win[0]] : [];
      body = (<>{m.wiki && <ItemPhoto q={m.wiki} />}<Big>{m.item}</Big>
        {Answer({ k: "guess", placeholder: "$", numeric: true,})}
        {revealed ? <><Good>${m.price.toLocaleString()}</Good>{Answers({ k: "guess",})}<span>{win ? <>Closest without going over: <strong>{name(win[0])}</strong></> : 'Everyone went over'}</span></> : <button className="btn btn-primary" onClick={reveal}>Reveal price</button>}
        {Again}</>); break;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--accent-text)' }}>{game.name.toUpperCase()}</span>
        <span title={rulesFor(game, people.length)} aria-label="Rules" style={{ cursor: 'help', width: 18, height: 18, borderRadius: 9, border: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>i</span>
        <span style={{ flex: 1 }} />
        <Scoreboard store={store} people={people} compact />
        {isHost && <button className="btn btn-ghost" aria-label="End game" title="End game" style={{ minHeight: 28, padding: '0 8px', fontSize: 18 }} onClick={() => endGame(store)}>×</button>}
      </div>
      {body}
      <RoundWinner key={g.round} store={store} round={g.round} people={people} suggested={winners} />
    </div>
  );
}

function Vote({ people, mine, onVote }: { people: Person[]; mine?: string; onVote: (id: string) => void }) {
  return <Row>{people.map((p) => (
    <button key={p.identity} className="btn" aria-pressed={mine === p.identity} style={{ background: mine === p.identity ? 'var(--accent)' : undefined, color: mine === p.identity ? 'var(--bg)' : undefined }} onClick={() => onVote(p.identity)}>{p.isLocal ? 'Me' : p.name}</button>
  ))}</Row>;
}

function AnswerBox({ cur, placeholder, numeric, onLock }: { cur?: string; placeholder: string; numeric?: boolean; onLock: (v: string) => void }) {
  const [v, setV] = useState('');
  if (cur !== undefined && cur !== null) return <span className="muted">Locked in: <strong style={{ color: 'var(--text)' }}>{cur}</strong></span>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onLock(v.trim()); }} style={{ display: 'flex', gap: 8 }}>
      <input className="input" autoFocus inputMode={numeric ? 'decimal' : undefined} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} style={{ width: 260 }} />
      <button className="btn btn-primary">Lock in</button>
    </form>);
}

/* ---------------- Fast Money (G3) ---------------- */

export type FmTable = {
  cols: string[];
  rows: { q: string | null; cells: { a: string | null; p: number | null }[] }[];
  totals: number[];
  done: boolean;
};

/** Board state for the reveal: answers come out one cell at a time (row by row), then points the same way. */
export function fmTable(s: SharedStore, P: string, m: M, name: (id: string) => string): FmTable {
  const G: string[] = m.guessers ?? []; const qs: Survey[] = m.qs ?? [];
  const fa = s.get<number>(P + 'fa') ?? 0; const fp = s.get<number>(P + 'fp') ?? 0;
  const totals = G.map(() => 0);
  const rows = qs.map((sv, i) => ({
    q: fa > i * G.length ? sv.q : null,
    cells: G.map((id, j) => {
      const k = i * G.length + j; const p = k < fp ? fmPoints(s, P, sv, i, id) : null;
      if (p !== null) totals[j] += p;
      return { a: k < fa ? (s.get<string>(`${P}guess.${i}.${id}`) || '—') : null, p };
    }),
  }));
  return { cols: G.map(name), rows, totals, done: G.length > 0 && fp >= qs.length * G.length };
}
const fmPoints = (s: SharedStore, P: string, sv: Survey, i: number, id: string) =>
  s.get<number>(`${P}pts.${i}.${id}`) ?? autoPoints(s.get<string>(`${P}guess.${i}.${id}`), sv);

/** Who won a finished Fast Money: highest total among guessers; a lone guesser needs 200 (the show's rule). */
export function fmWinners(t: FmTable, guessers: string[]): string[] | null {
  if (!t.done || !guessers.length) return null;
  if (guessers.length === 1) return t.totals[0] >= 200 ? [guessers[0]] : [];
  const top = Math.max(...t.totals); return top > 0 ? guessers.filter((_, j) => t.totals[j] === top) : [];
}

function FmBoardView({ t, canEdit, onEdit }: { t: FmTable; canEdit: boolean; onEdit: (row: number, col: number, v: number) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const cell: React.CSSProperties = { background: '#000', color: '#fff', fontWeight: 800, minHeight: 46, display: 'flex', alignItems: 'center', padding: '4px 12px', fontSize: 20, lineHeight: 1.1, textAlign: 'left' };
  const cols = t.cols.map(() => 'minmax(0,1fr) 62px').join(' ');
  return (
    <div style={{ width: '100%', maxWidth: 820, padding: 14, borderRadius: 6, border: '3px solid #0B1D4D', background: 'radial-gradient(ellipse at center, #2E62D0 0%, #1B3F98 55%, #102A6E 100%)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8 }}>
        {t.cols.map((c, j) => <span key={j} style={{ gridColumn: 'span 2', color: '#fff', fontWeight: 800, fontSize: 15, textAlign: 'left', letterSpacing: 0.5 }}>{c.toUpperCase()}</span>)}
      </div>
      {t.rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ color: '#C7D6FF', fontSize: 13, minHeight: 16, textAlign: 'left' }}>{r.q ? `${i + 1}. ${r.q}` : ''}</span>
          <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8 }}>
            {r.cells.map((c, j) => {
              const key = `${i}.${j}`;
              return [
                <div key={key + 'a'} style={{ ...cell, fontSize: (c.a?.length ?? 0) > 16 ? 15 : 20 }}>{c.a ?? ''}</div>,
                <div key={key + 'p'} style={{ ...cell, justifyContent: 'center', padding: 0, cursor: canEdit && c.p !== null ? 'pointer' : 'default' }}
                  title={canEdit && c.p !== null ? 'Click to change the points' : undefined}
                  onClick={() => canEdit && c.p !== null && setEditing(key)}>
                  {editing === key
                    ? <input autoFocus type="number" min={0} max={200} defaultValue={c.p ?? 0} style={{ width: 54, background: '#000', color: '#fff', border: '1px solid #FF8A5B', fontWeight: 800, fontSize: 18, textAlign: 'center' }}
                        onBlur={(e) => { onEdit(i, j, Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0)))); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
                    : c.p ?? ''}
                </div>,
              ];
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8, marginTop: 4 }}>
        {t.totals.map((n, j) => [
          <span key={j + 'l'} style={{ color: '#fff', fontWeight: 800, textAlign: 'right', alignSelf: 'center', paddingRight: 6 }}>TOTAL</span>,
          <div key={j + 'n'} style={{ ...cell, justifyContent: 'center', padding: 0, background: '#0B1D4D', border: '2px solid #fff' }}>{n}</div>,
        ])}
      </div>
    </div>
  );
}

function FastMoney({ store, P, m, me, people, name, answer }: {
  store: SharedStore; P: string; m: M; me: string; people: Person[]; name: (id: string) => string;
  answer: (k: string, placeholder: string) => React.ReactNode;
}) {
  const G: string[] = m.guessers ?? []; const qs: Survey[] = m.qs; const sv = qs[m.i];
  const set = (kv: Record<string, unknown>) => store.setMany(Object.fromEntries(Object.entries(kv).map(([k, v]) => [P + k, v])));
  const setM = (patch: M) => store.set(P + 'm', { ...m, ...patch });
  const who = people.map((p) => p.identity);
  // The asker runs the game; if they've dropped out, anyone can carry on.
  const drives = m.asker === me || !who.includes(m.asker);
  const N = qs.length * G.length;
  const fa = store.get<number>(P + 'fa') ?? 0; const fp = store.get<number>(P + 'fp') ?? 0;
  const next = (nx: string) => startGame(store, 'fast-money', people, { asker: nx, guessers: who.filter((w) => w !== nx) });

  if (m.phase === 'ask') {
    const locked = G.filter((id) => store.get(`${P}guess.${m.i}.${id}`) != null);
    return (<>
      <span className="muted" style={{ fontSize: 13 }}>{m.i + 1} / {qs.length}</span>
      {m.asker === me
        ? <Secret>{sv.q}</Secret>
        : G.includes(me) ? <><Big>Read the lips</Big>{answer(`guess.${m.i}`, 'Type your answer')}</> : <Big>{name(m.asker)} is asking</Big>}
      <Row>{G.map((id) => <span key={id} title={name(id)} style={{ fontSize: 13, color: locked.includes(id) ? 'var(--good)' : 'var(--muted)' }}>{locked.includes(id) ? '●' : '○'} {name(id)}</span>)}</Row>
      {drives && (m.i + 1 < qs.length
        ? <button className="btn btn-primary" onClick={() => setM({ i: m.i + 1 })}>Next question</button>
        : <button className="btn btn-primary" onClick={() => { setM({ phase: 'reveal' }); set({ fa: 0, fp: 0 }); }}>Reveal</button>)}
    </>);
  }

  const t = fmTable(store, P, m, name);
  return (<>
    <FmBoardView t={t} canEdit={drives} onEdit={(i, j, v) => set({ [`pts.${i}.${G[j]}`]: v })} />
    {drives
      ? (fa < N ? <button className="btn btn-primary" onClick={() => set({ fa: fa + 1 })}>Next answer</button>
        : fp < N ? <button className="btn btn-primary" onClick={() => set({ fp: fp + 1 })}>Next points</button>
        : null)
      : !t.done && <span className="muted">{name(m.asker)} is revealing</span>}
    {t.done && <Good>{G.length === 1
      ? (t.totals[0] >= 200 ? `${t.cols[0]} hit 200 with ${t.totals[0]}!` : `${t.cols[0]} scored ${t.totals[0]} — ${200 - t.totals[0]} short of 200`)
      : (() => { const w = fmWinners(t, G) ?? []; return !w.length ? 'Nobody scored' : w.length > 1 ? `Tie at ${Math.max(...t.totals)}` : `${name(w[0])} wins with ${Math.max(...t.totals)}`; })()}</Good>}
    {drives && (
      <details style={{ fontSize: 13, textAlign: 'left', maxWidth: 820, width: '100%' }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>Survey</summary>
        {qs.map((s, i) => <div key={i} style={{ marginTop: 6 }}><strong>{i + 1}. {s.q}</strong><div className="muted">{s.answers.map((a) => `${a.a} ${a.n}`).join(' · ')}</div></div>)}
      </details>)}
    {t.done && <Row>
      <button className="btn btn-primary" onClick={() => next(m.asker)}>Play again</button>
      {who.length > 1 && <button className="btn" onClick={() => next(who[(who.indexOf(m.asker) + 1) % who.length])}>Next asker</button>}
    </Row>}
  </>);
}

/* ---------------- Scoreboard: one point per mini game won ---------------- */

type Wins = Record<string, string>; // identity → name, for one round
export function scores(store: SharedStore): { id: string; name: string; pts: number }[] {
  const from = store.get<number>('scoreFrom') ?? 0; const t = new Map<string, { id: string; name: string; pts: number }>();
  for (const [round, w] of Object.entries(store.under<Wins | null>('win.'))) {
    if (!w || Number(round) <= from) continue;
    for (const [id, nm] of Object.entries(w)) { const cur = t.get(id) ?? { id, name: nm, pts: 0 }; cur.pts++; t.set(id, cur); }
  }
  return [...t.values()].sort((a, b) => b.pts - a.pts);
}
export const scoreLine = (store: SharedStore) => scores(store).map((x) => `${x.name} ${x.pts}`).join('  ·  ');

export function Scoreboard({ store, people, compact }: { store: SharedStore; people: Person[]; compact?: boolean }) {
  const list = scores(store);
  for (const p of people) if (!list.some((x) => x.id === p.identity)) list.push({ id: p.identity, name: p.name, pts: 0 });
  const top = list[0]?.pts ?? 0;
  const reset = () => { const rounds = Object.keys(store.under('win.')).map(Number); store.set('scoreFrom', Math.max(store.get<GameRef>('game')?.round ?? 0, ...rounds, 0)); };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      {!compact && <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)' }}>SCORE</span>}
      {list.map((x) => (
        <span key={x.id} style={{ padding: compact ? '2px 10px' : '4px 12px', borderRadius: 999, fontWeight: 600, fontSize: compact ? 13 : 14, background: top > 0 && x.pts === top ? 'var(--accent)' : 'var(--panel-2)', color: top > 0 && x.pts === top ? 'var(--bg)' : undefined }}>
          {x.name} {x.pts}
        </span>))}
      {top > 0 && !compact && <button className="btn" style={{ background: 'transparent', color: 'var(--muted)', fontSize: 12, minHeight: 28 }} onClick={reset}>Reset</button>}
    </div>);
}

/** Who won this round. Filled in automatically when the game has a clear winner; anyone can change it. */
function RoundWinner({ store, round, people, suggested }: { store: SharedStore; round: number; people: Person[]; suggested: string[] | null }) {
  const k = `win.${round}`; const cur = store.get<Wins | null>(k);
  const sugKey = suggested?.join(',');
  useEffect(() => {
    if (suggested && store.get(k) === undefined) store.set(k, Object.fromEntries(suggested.map((id) => [id, people.find((p) => p.identity === id)?.name ?? 'Someone'])));
  }, [sugKey, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (p: Person) => { const w = { ...(cur ?? {}) }; if (w[p.identity]) delete w[p.identity]; else w[p.identity] = p.name; store.set(k, w); };
  const [open, setOpen] = useState(false);
  const names = Object.values(cur ?? {});
  if (!open) return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
      {names.length ? <span style={{ fontWeight: 600 }}>🏆 {names.join(' & ')} +1</span> : null}
      <button className="btn btn-ghost" style={{ minHeight: 28, fontSize: 12 }} onClick={() => setOpen(true)}>{names.length ? 'Change' : '+1 winner'}</button>
    </div>);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      {people.map((p) => { const on = !!cur?.[p.identity]; return (
        <button key={p.identity} className="btn" aria-pressed={on} style={{ minHeight: 28, fontSize: 13, background: on ? 'var(--accent)' : undefined, color: on ? 'var(--bg)' : undefined }} onClick={() => toggle(p)}>{p.isLocal ? 'Me' : p.name}</button>); })}
      <button className="btn btn-ghost" style={{ minHeight: 28, fontSize: 12 }} onClick={() => setOpen(false)}>Done</button>
    </div>);
}

export const imageUrl = (q: string) => `/api/image?q=${encodeURIComponent(q)}`;
/** Guess the Price photo; hides itself if no image comes back. */
function ItemPhoto({ q }: { q: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={imageUrl(q)} alt="" onError={() => setOk(false)} style={{ maxWidth: 'min(420px, 90%)', maxHeight: 260, objectFit: 'contain', borderRadius: 12, background: '#fff', padding: 8 }} />; // eslint-disable-line @next/next/no-img-element
}
