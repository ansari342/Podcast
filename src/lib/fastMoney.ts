/**
 * Fast Money (G3) survey data. On the real show, points come from polling 100–200 people. We don't have a poll, so
 * each question carries a hand-estimated "200 people surveyed" board, and every game re-rolls the counts around those
 * estimates (simulateSurvey) so no two games score the same. A guess earns the points of the survey answer it matches;
 * an answer nobody on the board gave scores 0 (the asker can change any score).
 */
export type SurveyAnswer = { a: string; n: number; alt?: string[] };
export type Survey = { q: string; answers: SurveyAnswer[] };
export const SURVEY_SIZE = 200;

const S = (q: string, answers: [string, number, string[]?][]): Survey => ({ q, answers: answers.map(([a, n, alt]) => ({ a, n, alt })) });

export const SURVEYS: Survey[] = [
  S('Name something people do right after waking up', [['Check phone', 58, ['phone', 'look at phone', 'scroll', 'social media', 'instagram', 'tiktok', 'check email', 'email', 'emails']], ['Use the bathroom', 38, ['bathroom', 'pee', 'toilet', 'restroom', 'go to the bathroom']], ['Brush teeth', 30, ['teeth', 'brush']], ['Drink coffee', 22, ['coffee', 'make coffee']], ['Stretch', 12, ['yawn']], ['Shower', 10, ['take a shower', 'wash face']], ['Make the bed', 6, ['bed']], ['Pray', 6, ['prayer', 'fajr']]]),
  S('Name a reason you’d be late to work', [['Traffic', 70, ['accident', 'car accident', 'road work']], ['Overslept', 55, ['slept in', 'alarm', 'woke up late', 'sleep', 'snooze', 'alarm didnt go off']], ['Car trouble', 18, ['car broke down', 'flat tire', 'flat', 'car', 'gas', 'no gas']], ['Kids', 12, ['children', 'school drop off', 'kid', 'son', 'daughter']], ['Weather', 8, ['snow', 'rain', 'storm']], ['Train delay', 7, ['train', 'bus', 'subway', 'bart', 'transit']], ['Hangover', 5, ['hungover', 'drunk']]]),
  S('Name something you bring to the beach', [['Towel', 62, ['beach towel']], ['Sunscreen', 45, ['sunblock', 'spf', 'lotion', 'suntan lotion']], ['Umbrella', 22, ['shade', 'parasol']], ['Chair', 14, ['beach chair', 'chairs']], ['Cooler', 12, ['drinks', 'snacks', 'food', 'water']], ['Swimsuit', 10, ['bathing suit', 'trunks', 'bikini', 'swim trunks']], ['Sunglasses', 8, ['shades']], ['Ball', 5, ['frisbee', 'volleyball', 'football']]]),
  S('Name a food people eat with their hands', [['Pizza', 50], ['Burger', 40, ['hamburger', 'cheeseburger']], ['Sandwich', 20, ['sub', 'hoagie']], ['Wings', 18, ['chicken wings', 'fried chicken', 'chicken', 'drumstick']], ['Tacos', 16, ['taco', 'burrito']], ['Fries', 14, ['french fries', 'chips']], ['Hot dog', 10, ['hotdog']], ['Ribs', 6]]),
  S('Name a famous superhero', [['Superman', 55, ['super man', 'clark kent']], ['Spider-Man', 50, ['spiderman', 'spider man', 'spidey', 'peter parker']], ['Batman', 40, ['bat man', 'bruce wayne']], ['Iron Man', 15, ['ironman', 'tony stark']], ['Wonder Woman', 8], ['Captain America', 7, ['cap']], ['Hulk', 5, ['the hulk', 'incredible hulk']], ['Thor', 4]]),
  S('Name something people are afraid of', [['Spiders', 50, ['bugs', 'insects', 'cockroach']], ['Heights', 38, ['falling']], ['Snakes', 28], ['Death', 18, ['dying']], ['Clowns', 12], ['The dark', 12, ['dark', 'darkness']], ['Flying', 10, ['planes', 'airplane']], ['Public speaking', 7, ['speaking', 'speeches']]]),
  S('Name a place people go on a first date', [['Restaurant', 70, ['dinner', 'food', 'lunch']], ['Movies', 50, ['movie theater', 'cinema', 'movie', 'theater']], ['Coffee shop', 20, ['coffee', 'cafe', 'starbucks']], ['Park', 12, ['walk']], ['Bar', 10, ['drinks', 'club']], ['Bowling', 6, ['bowling alley']], ['Beach', 5], ['Mini golf', 4, ['putt putt']]]),
  S('Name something you find in a wallet', [['Money', 60, ['cash', 'bills', 'dollars']], ['Credit card', 48, ['card', 'cards', 'debit card', 'bank card']], ['Driver’s license', 40, ['license', 'id', 'id card', 'drivers license']], ['Pictures', 12, ['photo', 'photos', 'picture']], ['Receipts', 10, ['receipt']], ['Gift card', 5, ['gift cards']], ['Coins', 4, ['change']]]),
  S('Name a popular pizza topping', [['Pepperoni', 85], ['Sausage', 25], ['Mushrooms', 22], ['Cheese', 14, ['extra cheese']], ['Pineapple', 12], ['Onions', 8, ['onion']], ['Olives', 6, ['black olives']], ['Peppers', 5, ['green peppers', 'bell peppers', 'jalapenos']]]),
  S('Name a sport played with a ball', [['Basketball', 55], ['Football', 50], ['Baseball', 35], ['Soccer', 25], ['Tennis', 8], ['Volleyball', 5], ['Golf', 4]]),
  S('Name something people lose all the time', [['Keys', 82, ['car keys', 'key']], ['Phone', 36, ['cell phone']], ['Glasses', 15, ['sunglasses']], ['Wallet', 14, ['purse']], ['Remote', 12, ['tv remote', 'remote control']], ['Socks', 8], ['Pen', 5, ['pens']], ['Their mind', 3, ['mind', 'sanity']]]),
  S('Name a job that requires a uniform', [['Police officer', 55, ['police', 'cop', 'officer']], ['Nurse', 30], ['Firefighter', 25, ['fireman']], ['Military', 20, ['soldier', 'army', 'navy', 'marine']], ['Doctor', 12, ['surgeon']], ['Chef', 8, ['cook']], ['Pilot', 8, ['flight attendant']], ['Mail carrier', 6, ['mailman', 'postman', 'ups']]]),
  S('Name an animal at the zoo', [['Lion', 50], ['Elephant', 40], ['Monkey', 30, ['ape', 'gorilla', 'chimp', 'chimpanzee']], ['Giraffe', 25], ['Tiger', 15], ['Zebra', 10], ['Bear', 8, ['panda', 'polar bear']], ['Penguin', 4]]),
  S('Name something people do at a wedding', [['Dance', 70, ['dancing']], ['Cry', 30], ['Eat', 25, ['food', 'dinner', 'cake', 'eat cake']], ['Drink', 22, ['get drunk', 'alcohol']], ['Kiss', 12, ['kiss the bride']], ['Say vows', 8, ['vows', 'i do', 'get married']], ['Throw the bouquet', 5, ['bouquet']], ['Take pictures', 4, ['photos', 'pictures']]]),
  S('Name a reason someone might not sleep', [['Stress', 45, ['worry', 'worried', 'anxiety']], ['Coffee', 30, ['caffeine', 'energy drink']], ['Baby', 25, ['kids', 'newborn', 'crying baby']], ['Noise', 20, ['snoring', 'loud', 'neighbors']], ['Insomnia', 15], ['Phone', 12, ['screen', 'scrolling', 'tiktok']], ['Sick', 10, ['pain', 'illness']], ['Work', 8, ['deadline']]]),
  S('Name something people put on a burger', [['Cheese', 50], ['Ketchup', 35], ['Lettuce', 25], ['Tomato', 20], ['Pickles', 18], ['Onion', 14, ['onions']], ['Bacon', 10], ['Mustard', 8]]),
  S('Name a famous city in Europe', [['Paris', 85], ['London', 45], ['Rome', 25], ['Barcelona', 8], ['Berlin', 7], ['Amsterdam', 6], ['Madrid', 4]]),
  S('Name something you do at the gym', [['Lift weights', 70, ['weights', 'lift', 'lifting', 'bench', 'bench press', 'squat']], ['Run', 40, ['treadmill', 'running', 'cardio', 'jog']], ['Stretch', 12], ['Sweat', 12], ['Swim', 8, ['pool']], ['Bike', 8, ['cycle', 'spin', 'bicycle']], ['Shower', 6], ['Yoga', 5]]),
  S('Name something you’d find in a kitchen', [['Refrigerator', 45, ['fridge']], ['Stove', 35, ['oven']], ['Knife', 20, ['knives']], ['Sink', 18], ['Microwave', 16], ['Pots and pans', 14, ['pot', 'pan', 'pots', 'pans']], ['Plates', 10, ['dishes']], ['Silverware', 6, ['spoon', 'fork', 'utensils']]]),
  S('Name something people do on a plane', [['Sleep', 85, ['nap']], ['Read', 25, ['book']], ['Watch a movie', 25, ['movie', 'movies', 'tv', 'shows']], ['Eat', 15, ['snacks', 'food']], ['Listen to music', 10, ['music', 'headphones']], ['Drink', 10], ['Use the bathroom', 8, ['bathroom', 'pee']], ['Talk', 5]]),
  S('Name a breakfast food', [['Eggs', 60, ['egg', 'omelette', 'scrambled eggs']], ['Pancakes', 40], ['Bacon', 25], ['Cereal', 22], ['Waffles', 12], ['Toast', 10], ['Oatmeal', 6], ['Bagel', 5]]),
  S('Name something you need for a road trip', [['Snacks', 45, ['food']], ['Gas', 40, ['fuel']], ['Music', 25, ['playlist', 'radio']], ['Map', 20, ['gps', 'phone', 'directions', 'google maps']], ['Car', 15], ['Water', 10, ['drinks']], ['Money', 8, ['cash']], ['Friends', 5, ['company', 'people']]]),
  S('Name something associated with Halloween', [['Candy', 65, ['chocolate']], ['Costume', 45, ['dress up']], ['Pumpkin', 35, ['jack o lantern']], ['Trick or treat', 15, ['trick or treating']], ['Ghost', 10], ['Witch', 8], ['Skeleton', 5]]),
  S('Name a word that rhymes with “cat”', [['Hat', 60], ['Bat', 50], ['Rat', 30], ['Mat', 15], ['Sat', 8], ['Fat', 8], ['Pat', 5]]),
  S('Name something people do when they’re nervous', [['Bite nails', 60, ['nails', 'nail biting', 'bite fingernails']], ['Sweat', 40], ['Shake', 20, ['tremble', 'fidget', 'shake leg']], ['Pace', 15, ['walk around']], ['Talk a lot', 12, ['ramble', 'talk']], ['Eat', 10], ['Pee', 6, ['bathroom']], ['Laugh', 5]]),
  S('Name something that has wheels', [['Car', 90], ['Bike', 35, ['bicycle']], ['Truck', 20], ['Bus', 12], ['Skateboard', 10], ['Wheelchair', 6], ['Shopping cart', 5, ['cart']], ['Stroller', 4]]),
  S('Name a reason to call in sick', [['Sick', 50, ['flu', 'cold', 'fever', 'covid', 'ill']], ['Hangover', 30, ['hungover']], ['Sick kid', 25, ['kids', 'child sick']], ['Tired', 18, ['exhausted']], ['Doctor’s appointment', 15, ['appointment', 'dentist', 'doctor']], ['Mental health day', 12, ['mental health']], ['Family emergency', 10, ['emergency']], ['Food poisoning', 8, ['stomach', 'stomach ache']]]),
  S('Name something you’d see at a birthday party', [['Cake', 90], ['Balloons', 35], ['Presents', 25, ['gifts', 'gift']], ['Candles', 12], ['Party hats', 8, ['hat', 'hats']], ['Pizza', 5], ['Clown', 5]]),
  S('Name a popular social media app', [['Instagram', 60, ['ig', 'insta']], ['TikTok', 50, ['tik tok']], ['Facebook', 30, ['fb']], ['Snapchat', 15, ['snap']], ['X', 10, ['twitter']], ['YouTube', 10], ['Reddit', 5]]),
  S('Name something people do on vacation', [['Relax', 50, ['rest', 'chill']], ['Sleep', 30], ['Swim', 25, ['beach', 'pool']], ['Sightsee', 25, ['tour', 'explore', 'sightseeing']], ['Eat', 20, ['food']], ['Drink', 10], ['Shop', 10, ['shopping']], ['Take pictures', 6, ['photos', 'pictures']]]),
];

/** Re-roll a question's counts around its estimates so every game is a fresh "poll" of 200 people. */
export function simulateSurvey(s: Survey, rand = Math.random): Survey {
  const other = 6 + Math.floor(rand() * 20); // people whose answers didn't make the board
  const w = s.answers.map((x) => x.n * (0.75 + rand() * 0.5));
  const sum = w.reduce((a, b) => a + b, 0);
  const answers = s.answers.map((x, i) => ({ ...x, n: Math.max(1, Math.round((w[i] / sum) * (SURVEY_SIZE - other))) }));
  return { q: s.q, answers: answers.sort((a, b) => b.n - a.n) };
}

export function newFastMoneyRound(count = 5, rand = Math.random): Survey[] {
  const pool = [...SURVEYS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count).map((s) => simulateSurvey(s, rand));
}

const STOP = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'some']);
const sing = (w: string) => {
  if (w.length <= 3 || /(ss|us|is)$/.test(w)) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(sh|ch|x|z|s)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
};
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map(sing).join(' ');

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

/** Index of the survey answer a guess matches, or -1. Exact > contains > close spelling. */
export function matchAnswer(guess: string | undefined | null, s: Survey): number {
  const g = norm(guess ?? ''); if (!g) return -1;
  const keys = s.answers.map((x) => [x.a, ...(x.alt ?? [])].map(norm));
  const gt = g.split(' ');
  const tests: ((k: string) => boolean)[] = [
    (k) => k === g || k.replace(/ /g, '') === g.replace(/ /g, ''),
    (k) => { const kt = k.split(' '); return kt.every((w) => gt.includes(w)); }, // "brush my teeth" ⊇ "brush teeth"
    (k) => { const kt = k.split(' '); return g.length >= 4 && gt.every((w) => kt.includes(w)); }, // "teeth" ⊆ "brush teeth"
    (k) => { const tol = k.length >= 8 ? 2 : k.length >= 4 ? 1 : 0; return tol > 0 && lev(g, k) <= tol; },
  ];
  for (const t of tests) { const i = keys.findIndex((ks) => ks.some(t)); if (i >= 0) return i; }
  return -1;
}

export const autoPoints = (guess: string | undefined | null, s: Survey) => { const i = matchAnswer(guess, s); return i >= 0 ? s.answers[i].n : 0; };
