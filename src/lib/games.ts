/**
 * Game catalog (brief: Games spec). Each game declares a minimum player count and rules per count (G14, G15),
 * the one-line text shown in the Games tab, and whether the board is in the active video by default (V4).
 */
export type GameId =
  | 'imposter' | 'imposter-question' | 'tier-list' | 'fast-money' | 'blind-ranking' | 'auction-draft' | 'snake-draft'
  | 'most-likely-to' | 'red-green-flag' | 'higher-lower' | 'trivia' | 'thermostat' | 'thermostat-questions'
  | 'name-3-in-5' | 'guess-the-sound' | 'tell-me-without' | 'guess-the-price';

export type Game = {
  id: GameId; code: string; name: string; line: string; min: 1 | 2 | 3; boardOnRecording: boolean;
  rules: Partial<Record<1 | 2 | 3, string>>;
  /** Special media routing the game needs from the call layer. */
  routing?: 'mute-asker-for-guessers' | 'hide-video-from-guessers';
};

export const GAMES: Game[] = [
  { id: 'imposter', code: 'G1', name: 'Imposter', line: 'Find who doesn’t know the word.', min: 3, boardOnRecording: false,
    rules: { 3: 'Two get the secret word, the imposter gets only the category; one-word clues for 3 rounds, then vote.' } },
  { id: 'imposter-question', code: 'G16', name: 'Imposter question', line: 'Spot who got a different question.', min: 3, boardOnRecording: true,
    rules: { 3: 'Everyone answers a question privately; the imposter got a different one. Reveal your answers one by one out loud, then one player reads the real question, then vote.' } },
  { id: 'tier-list', code: 'G2', name: 'Tier list', line: 'Rank anything from S to F.', min: 1, boardOnRecording: true,
    rules: { 1: 'Rank solo and explain your picks.', 2: 'Build one list together; argue every placement.', 3: 'One shared list; majority breaks ties.' } },
  { id: 'fast-money', code: 'G3', name: 'Fast Money, no sound', line: 'Read the asker’s lips.', min: 2, boardOnRecording: true, routing: 'mute-asker-for-guessers',
    rules: { 2: 'One person asks all 5 questions; the other can’t hear, reads lips and types an answer. Answers, then points, are revealed at the end.', 3: 'One person asks all 5 questions; the other two can’t hear, read lips and type answers. Answers, then points, are revealed at the end — most points wins.' } },
  { id: 'blind-ranking', code: 'G4', name: 'Blind ranking', line: 'Rank 1–5 without seeing what’s next.', min: 1, boardOnRecording: true,
    rules: { 1: 'Rank alone.', 2: 'Side by side, compare at the end.', 3: 'Three rankings revealed together.' } },
  { id: 'auction-draft', code: 'G17', name: 'Auction draft', line: '$20 each. Bid your way to the best 5.', min: 2, boardOnRecording: true,
    rules: { 2: 'Each has $20 to bid on items for the perfect list of 5; poll picks the best list.', 3: 'Same with three bidders; vote picks the best list.' } },
  { id: 'snake-draft', code: 'G5', name: 'Snake draft', line: 'Take turns picking the best list.', min: 2, boardOnRecording: true,
    rules: { 2: '1v1 snake draft (1-2, 2-1, …).', 3: 'Three-team snake draft (1-2-3, 3-2-1, …).' } },
  { id: 'most-likely-to', code: 'G6', name: 'Most Likely To', line: 'Point at who fits.', min: 3, boardOnRecording: false,
    rules: { 3: 'Everyone points at who fits the prompt.' } },
  { id: 'red-green-flag', code: 'G6b', name: 'Red Flag or Green Flag', line: 'Vote red or green.', min: 1, boardOnRecording: false,
    rules: { 1: 'Give your verdict.', 2: 'A split vote means a 30-second debate.', 3: 'Majority wins; the odd one out defends.' } },
  { id: 'higher-lower', code: 'G7', name: 'Higher or Lower', line: 'Guess higher or lower.', min: 1, boardOnRecording: true,
    rules: { 1: 'Keep a streak.', 2: 'Take turns, best streak wins.', 3: 'Take turns, best streak wins.' } },
  { id: 'trivia', code: 'G18', name: 'Trivia', line: 'Guess the answer, reveal when ready.', min: 1, boardOnRecording: true,
    rules: { 1: 'Guess, then reveal.', 2: 'Closest guess wins.', 3: 'Closest guess wins.' } },
  { id: 'thermostat', code: 'G19', name: 'Thermostat', line: 'Show a secret number without words.', min: 2, boardOnRecording: true,
    rules: { 2: 'One shows a secret number with body language; the other guesses.', 3: 'One shows; the other two race to guess.' } },
  { id: 'thermostat-questions', code: 'G24', name: 'Thermostat: Questions', line: 'Ask questions to find their secret number.', min: 2, boardOnRecording: true,
    rules: { 2: 'One holds a secret number 1–10; the other asks questions, then guesses.', 3: 'One holds the number; the other two take turns asking and race to guess.' } },
  { id: 'name-3-in-5', code: 'G20', name: 'Name 3 in 5', line: 'Name three things in five seconds.', min: 1, boardOnRecording: true,
    rules: { 1: 'Beat the clock.', 2: 'Take turns; the other judges.', 3: 'Take turns; the others judge.' } },
  { id: 'guess-the-sound', code: 'G21', name: 'Guess the Sound', line: 'Guess the sound in three seconds.', min: 2, boardOnRecording: true, routing: 'hide-video-from-guessers',
    rules: { 2: 'One makes a sound off camera; the other guesses in 3 s.', 3: 'One makes the sound; the other two race.' } },
  { id: 'tell-me-without', code: 'G22', name: 'Tell Me Without Telling Me', line: 'Describe a word under a twist rule.', min: 2, boardOnRecording: true,
    rules: { 2: 'Describe a secret word under a twist rule; the other guesses.', 3: 'Describe it; the other two race.' } },
  { id: 'guess-the-price', code: 'G23', name: 'Guess the Price', line: 'Closest without going over wins.', min: 1, boardOnRecording: true,
    rules: { 1: 'Try to get within 10%.', 2: 'Closest without going over wins.', 3: 'Closest without going over wins.' } },
];

export const clampCount = (n: number) => Math.min(3, Math.max(1, n)) as 1 | 2 | 3;
export const isPlayable = (g: Game, people: number) => people >= g.min;
export const rulesFor = (g: Game, people: number) => g.rules[clampCount(people)] ?? '';

/** Trivia questions (G18). Replace with packs from the database (G10). Answers must carry a source. */
export const TRIVIA: { q: string; a: string; source: string }[] = [
  { q: 'How many words are in the English language?', a: 'The Oxford English Dictionary lists over 600,000 word forms', source: 'Oxford English Dictionary' },
  { q: 'How many bones are in the adult human body?', a: '206', source: 'Standard anatomy' },
  { q: 'How many keys does a standard piano have?', a: '88', source: 'Standard piano' },
  { q: 'How many countries are members of the United Nations?', a: '193', source: 'United Nations' },
];
