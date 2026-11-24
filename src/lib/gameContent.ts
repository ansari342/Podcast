/** Content packs for the games (G10). Edit freely — every list is plain data. */

export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const shuffle = <T,>(a: readonly T[]): T[] => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };

export const IMPOSTER: Record<string, string[]> = {
  'Fast food': ['McDonald’s', 'Chipotle', 'Chick-fil-A', 'In-N-Out', 'Taco Bell', 'Five Guys', 'Popeyes', 'Wingstop'],
  'Sports': ['Basketball', 'Golf', 'Tennis', 'Boxing', 'Soccer', 'Cricket', 'Surfing', 'Bowling'],
  'Places': ['Airport', 'Gym', 'Hospital', 'Casino', 'Library', 'Wedding', 'Beach', 'Mosque'],
  'Jobs': ['Dentist', 'Pilot', 'Barber', 'Lawyer', 'Chef', 'Uber driver', 'Teacher', 'Plumber'],
  'Movies': ['Titanic', 'The Dark Knight', 'Inception', 'Toy Story', 'Jaws', 'Rocky', 'Frozen', 'Home Alone'],
  'Things at home': ['Microwave', 'Toothbrush', 'Couch', 'Ceiling fan', 'Remote', 'Mirror', 'Pillow', 'Fridge'],
  'Animals': ['Penguin', 'Giraffe', 'Octopus', 'Kangaroo', 'Owl', 'Shark', 'Raccoon', 'Camel'],
  'Apps': ['Instagram', 'Uber', 'Spotify', 'Venmo', 'Google Maps', 'WhatsApp', 'Duolingo', 'TikTok'],
};

/** [everyone's question, imposter's question] — answers should overlap enough to bluff. */
/**
 * Imposter question pairs: [real question, imposter's question]. Both take the same kind of answer, so the imposter's
 * answer can pass for one to the real question — the fun is when it almost does. Mixed types, few numbers.
 */
export const IMPOSTER_QUESTIONS: [string, string][] = [
  // people
  ['Who in this room would survive longest in a zombie apocalypse?', 'Who in this room would be the worst roommate?'],
  ['Which celebrity would you want as your dad?', 'Which celebrity would you want to fight?'],
  ['Who’s the funniest person you know personally?', 'Who would you call to help you hide a body?'],
  ['Which celebrity do you think smells the best?', 'Which celebrity would be the worst at a group project?'],
  ['Who’s the GOAT of any sport?', 'Which athlete would you trust to babysit?'],
  ['Which famous person would you want to get stuck in an elevator with?', 'Which famous person do you think is secretly really mean?'],
  ['Who in this room would make the best president?', 'Who in this room would go viral for the wrong reason?'],
  ['Which cartoon character would you date?', 'Which cartoon character would you trust with your bank account?'],
  ['Who’s the most overrated musician right now?', 'Which musician would you want playing at your funeral?'],
  ['Which historical figure would you want to have dinner with?', 'Which historical figure would be terrible on social media?'],
  // places
  ['Where would you go on a honeymoon?', 'Where would you hide if you robbed a bank?'],
  ['What’s the most overrated vacation spot?', 'Where would you never want to live?'],
  ['Where’s the best place to propose?', 'Where’s the worst place to get dumped?'],
  ['If you could live anywhere for a year, where?', 'Where would you send your worst enemy?'],
  ['What’s the best place for a first date?', 'Where would you go to cry in public?'],
  // food & drink
  ['What’s your go-to late-night snack?', 'What food would you bring to a funeral?'],
  ['What’s the most overrated food?', 'What food would you eat for your last meal?'],
  ['What’s the best pizza topping?', 'What would you put on a burger to ruin it?'],
  ['What’s the worst thing to order on a first date?', 'What’s the best hangover food?'],
  ['What food could you eat every day for a month?', 'What food would you ban from the planet?'],
  ['What’s the best fast-food chain?', 'Where would you take a date to save money?'],
  ['What drink do you order to look cool?', 'What drink do you secretly love but are embarrassed by?'],
  // things & habits
  ['What’s the first thing you’d buy if you won the lottery?', 'What’s something you’d buy to impress someone?'],
  ['What’s the most useless thing in your house?', 'What would you grab first in a fire?'],
  ['What’s the most annoying thing a coworker can do?', 'What’s the most annoying thing a roommate can do?'],
  ['What’s your biggest pet peeve?', 'What’s the biggest red flag on a first date?'],
  ['What’s your hidden talent?', 'What skill would you put on a fake résumé?'],
  ['What would you do with an extra hour every day?', 'What would you do if you were invisible for a day?'],
  ['What’s the worst gift you’ve ever received?', 'What’s the worst thing to bring to a potluck?'],
  ['What app do you open first in the morning?', 'What app would you delete forever if you had to?'],
  ['What’s a smell you secretly love?', 'What’s a smell that reminds you of childhood?'],
  ['What’s something you’re weirdly good at?', 'What would your superpower be?'],
  ['What’s the best way to spend a Sunday?', 'What would you do on your last day on Earth?'],
  ['What’s a word you can’t stand hearing?', 'What would you name your boat?'],
  ['What’s the best movie of all time?', 'What movie would you show an alien to explain humans?'],
  ['What’s the most overrated TV show?', 'What show would you binge if you were stuck in a hospital bed?'],
  ['What song would you walk out to in a boxing match?', 'What song would you play to clear out a party?'],
  ['What animal would you be?', 'What animal would you want to fight?'],
  ['What would your wrestling name be?', 'What would you name your first kid?'],
  ['What’s the worst job you can imagine?', 'What job would you be secretly great at?'],
  ['What’s a dealbreaker in a relationship?', 'What would get you fired on day one?'],
  ['What’s the most embarrassing thing to get caught doing?', 'What would you do if no one was watching?'],
  ['What’s the best decade for music?', 'What decade would you time-travel to?'],
  ['What’s the best car brand?', 'What car would you buy to have a midlife crisis?'],
  ['What would you rather have: money, fame, or power?', 'What matters most in a friend: loyalty, humor, or honesty?'],
  // a few numbers
  ['How many hours of sleep do you need?', 'How many hours could you play video games straight?'],
  ['What’s a good age to get married?', 'What’s a good age to retire?'],
  ['How much would you spend on a first date?', 'How much would you spend on sneakers?'],
  ['How many push-ups can you do?', 'How many tacos could you eat in one sitting?'],
  ['How many kids do you want?', 'How many pets do you want?'],
  ['Rate your cooking out of 10.', 'Rate your dance moves out of 10.'],
  ['How many times do you check your phone per hour?', 'How many times a week do you eat out?'],
];

export const TIER_LISTS: { topic: string; items: string[] }[] = [
  { topic: 'Fast food chains', items: ['McDonald’s', 'Chick-fil-A', 'In-N-Out', 'Taco Bell', 'Wendy’s', 'Popeyes', 'Chipotle', 'Five Guys', 'Burger King', 'Subway'] },
  { topic: 'Breakfast foods', items: ['Pancakes', 'Waffles', 'Bagel', 'Omelette', 'Cereal', 'Avocado toast', 'French toast', 'Breakfast burrito', 'Oatmeal', 'Croissant'] },
  { topic: 'Airlines', items: ['Delta', 'United', 'American', 'Southwest', 'JetBlue', 'Alaska', 'Spirit', 'Emirates', 'Qatar', 'Frontier'] },
  { topic: 'Ice cream flavors', items: ['Vanilla', 'Chocolate', 'Mint chip', 'Cookie dough', 'Pistachio', 'Strawberry', 'Rocky road', 'Butter pecan', 'Cookies & cream', 'Mango'] },
  { topic: 'Social apps', items: ['Instagram', 'TikTok', 'YouTube', 'X', 'Snapchat', 'Reddit', 'LinkedIn', 'Facebook', 'Threads', 'BeReal'] },
  { topic: 'Pizza toppings', items: ['Pepperoni', 'Pineapple', 'Mushroom', 'Olives', 'Sausage', 'Jalapeño', 'Onion', 'Chicken', 'Anchovies', 'Bell pepper'] },
  { topic: 'Holidays', items: ['Thanksgiving', 'Christmas', 'Eid', 'New Year’s Eve', 'Halloween', 'July 4th', 'Valentine’s Day', 'Birthday', 'Super Bowl Sunday', 'Labor Day'] },
  { topic: 'Chores', items: ['Dishes', 'Laundry', 'Vacuuming', 'Cleaning the bathroom', 'Taking out trash', 'Grocery shopping', 'Making the bed', 'Cooking', 'Mowing the lawn', 'Folding clothes'] },
];

export const BLIND_RANKING: { topic: string; items: string[] }[] = [
  { topic: 'Superpowers', items: ['Flight', 'Invisibility', 'Teleportation', 'Mind reading', 'Super strength', 'Time travel', 'Healing', 'Shape-shifting'] },
  { topic: 'Desserts', items: ['Cheesecake', 'Brownie', 'Ice cream', 'Tiramisu', 'Apple pie', 'Baklava', 'Donut', 'Churros'] },
  { topic: 'Cities to live in', items: ['New York', 'London', 'Tokyo', 'Dubai', 'Miami', 'Paris', 'San Francisco', 'Toronto'] },
  { topic: 'Cars', items: ['Tesla Model 3', 'Toyota Camry', 'Porsche 911', 'Jeep Wrangler', 'Honda Civic', 'Range Rover', 'Ford F-150', 'BMW M3'] },
  { topic: 'Pets', items: ['Dog', 'Cat', 'Parrot', 'Hamster', 'Fish', 'Rabbit', 'Snake', 'Turtle'] },
  { topic: 'Movie genres', items: ['Comedy', 'Horror', 'Action', 'Romance', 'Sci-fi', 'Documentary', 'Thriller', 'Animated'] },
  { topic: 'Drinks', items: ['Coffee', 'Boba', 'Orange juice', 'Lemonade', 'Coke', 'Matcha', 'Chai', 'Sparkling water'] },
];

export const DRAFT_POOLS: { cat: string; items: string[] }[] = [
  { cat: 'Fast food restaurants', items: ['McDonald’s', 'Chick-fil-A', 'In-N-Out', 'Taco Bell', 'Wendy’s', 'Popeyes', 'Chipotle', 'Five Guys', 'Raising Cane’s', 'Shake Shack', 'Panda Express', 'Wingstop', 'Jersey Mike’s', 'Sweetgreen', 'KFC'] },
  { cat: 'NBA players (all time)', items: ['Michael Jordan', 'LeBron James', 'Kobe Bryant', 'Magic Johnson', 'Larry Bird', 'Shaquille O’Neal', 'Tim Duncan', 'Stephen Curry', 'Kevin Durant', 'Kareem Abdul-Jabbar', 'Hakeem Olajuwon', 'Nikola Jokić', 'Giannis Antetokounmpo', 'Wilt Chamberlain', 'Bill Russell'] },
  { cat: 'Snacks', items: ['Takis', 'Hot Cheetos', 'Doritos', 'Oreos', 'Goldfish', 'Pringles', 'Lay’s', 'Sour Patch Kids', 'Popcorn', 'Kit Kat', 'Reese’s', 'Funyuns', 'Skittles', 'Pretzels', 'Trail mix'] },
  { cat: 'Movies', items: ['The Dark Knight', 'Inception', 'The Godfather', 'Titanic', 'Interstellar', 'Avengers: Endgame', 'Toy Story', 'Spirited Away', 'Pulp Fiction', 'The Matrix', 'Gladiator', 'Forrest Gump', 'Top Gun: Maverick', 'Jurassic Park', 'The Lion King'] },
  { cat: 'Vacation spots', items: ['Bali', 'Tokyo', 'Paris', 'Maldives', 'Cancún', 'Iceland', 'Hawaii', 'Dubai', 'Amalfi Coast', 'Santorini', 'Cape Town', 'Istanbul', 'Banff', 'Marrakech', 'New York'] },
  { cat: 'Breakfast items', items: ['Pancakes', 'Waffles', 'Bacon', 'Eggs Benedict', 'Hash browns', 'Bagel & lox', 'French toast', 'Breakfast burrito', 'Croissant', 'Shakshuka', 'Chicken & waffles', 'Avocado toast', 'Cinnamon roll', 'Biscuits & gravy', 'Acai bowl'] },
];

export const SNAKE_CATEGORIES: string[] = [
  'Best fast food items', 'Greatest rappers', 'Best TV shows ever', 'Best NBA players right now', 'Best desserts', 'Best road-trip snacks',
  'Best movie franchises', 'Best cities in the US', 'Most useful apps', 'Best Pixar movies', 'Best cereals', 'Best athletes of all time',
];

export const MOST_LIKELY: string[] = [
  'Most likely to become famous', 'Most likely to forget a birthday', 'Most likely to survive a zombie apocalypse', 'Most likely to cry at a movie',
  'Most likely to become a millionaire', 'Most likely to get lost in their own city', 'Most likely to start a business', 'Most likely to be late to their own wedding',
  'Most likely to win a reality show', 'Most likely to adopt five dogs', 'Most likely to move abroad', 'Most likely to go viral',
  'Most likely to eat something off the floor', 'Most likely to run a marathon', 'Most likely to text back in 3 days', 'Most likely to become a politician',
  'Most likely to fall asleep at a party', 'Most likely to argue with a referee', 'Most likely to have a secret talent', 'Most likely to quit their job tomorrow',
];

export const FLAGS: string[] = [
  'They clap when the plane lands', 'They don’t like dogs', 'They text in full sentences with punctuation', 'They still use a flip phone',
  'They split the bill to the cent', 'They’re best friends with their ex', 'They’ve never seen Star Wars', 'They wake up at 5 a.m. every day',
  'They put ketchup on everything', 'They don’t tip at coffee shops', 'They have 40,000 unread emails', 'They call instead of texting',
  'They plan dates weeks in advance', 'They watch shows on 2x speed', 'They post every meal on Instagram', 'They’ve never left their home state',
  'They keep their phone on loud', 'They do their taxes on January 1st', 'They don’t drink water, only soda', 'They narrate their gym sets',
];

/** Higher or Lower: approximate height in meters (tip or roof as commonly quoted). */
export const HEIGHTS: { name: string; value: number }[] = [
  { name: 'Burj Khalifa', value: 828 }, { name: 'Tokyo Skytree', value: 634 }, { name: 'Shanghai Tower', value: 632 }, { name: 'CN Tower', value: 553 },
  { name: 'One World Trade Center', value: 541 }, { name: 'Taipei 101', value: 508 }, { name: 'Petronas Towers', value: 452 }, { name: 'Empire State Building (tip)', value: 443 },
  { name: 'Willis Tower', value: 442 }, { name: 'Eiffel Tower', value: 330 }, { name: 'Golden Gate Bridge tower', value: 227 }, { name: 'Gateway Arch', value: 192 },
  { name: 'Space Needle', value: 184 }, { name: 'Washington Monument', value: 169 }, { name: 'Great Pyramid of Giza (today)', value: 139 }, { name: 'Big Ben (Elizabeth Tower)', value: 96 },
  { name: 'Statue of Liberty (with pedestal)', value: 93 }, { name: 'Sydney Opera House', value: 65 }, { name: 'Leaning Tower of Pisa', value: 56 }, { name: 'Christ the Redeemer', value: 30 },
];

export const TRIVIA: { q: string; a: string; n?: number }[] = [
  { q: 'How many words are in the English language?', a: 'The Oxford English Dictionary has about 600,000 word forms', n: 600000 },
  { q: 'How many bones are in the adult human body?', a: '206', n: 206 },
  { q: 'How many keys does a standard piano have?', a: '88', n: 88 },
  { q: 'How many countries are members of the United Nations?', a: '193', n: 193 },
  { q: 'How many countries are in Africa?', a: '54', n: 54 },
  { q: 'How tall is Mount Everest, in meters?', a: '8,849 m', n: 8849 },
  { q: 'How many days does it take Mars to orbit the Sun?', a: 'About 687 Earth days', n: 687 },
  { q: 'How many episodes of Friends are there?', a: '236', n: 236 },
  { q: 'How far is the Moon from Earth, on average, in km?', a: 'About 384,400 km', n: 384400 },
  { q: 'How many hearts does an octopus have?', a: '3', n: 3 },
  { q: 'How many teeth does an adult usually have?', a: '32 (including wisdom teeth)', n: 32 },
  { q: 'Roughly how many languages are spoken in the world?', a: 'About 7,000', n: 7000 },
  { q: 'What year was Google founded?', a: '1998', n: 1998 },
  { q: 'What year was YouTube founded?', a: '2005', n: 2005 },
  { q: 'How many squares are on a chessboard?', a: '64', n: 64 },
  { q: 'How fast does light travel, in km per second?', a: 'About 299,792 km/s', n: 299792 },
  { q: 'How many bones does a shark have?', a: 'Zero — shark skeletons are cartilage', n: 0 },
  { q: 'How many time zones does Russia span?', a: '11', n: 11 },
  { q: 'How many Harry Potter books are there?', a: '7', n: 7 },
  { q: 'How many minutes is a standard NBA game (regulation)?', a: '48', n: 48 },
];

export const THERMO_PROMPTS: string[] = [
  'Give me a baseball player', 'Give me a fast food chain', 'Give me a city', 'Give me a car', 'Give me a movie', 'Give me a celebrity',
  'Give me a breakfast food', 'Give me an animal', 'Give me a vacation spot', 'Give me a song', 'Give me a phone app', 'Give me a dessert',
];

export const NAME3: string[] = [
  'Types of pasta', 'NBA teams', 'Things in a kitchen', 'Car brands', 'Countries in Asia', 'Pixar movies', 'Fruits that are red', 'Dog breeds',
  'Rappers', 'Pizza toppings', 'Things you take camping', 'Board games', 'Social media apps', 'Breakfast cereals', 'Planets', 'Disney princesses',
  'Things in a gym', 'Ice cream flavors', 'Famous scientists', 'Beatles songs', 'US presidents', 'Sports with a net', 'Fast food chains', 'Ocean animals',
  'Things that are yellow', 'Cheeses', 'Musical instruments', 'Airlines', 'Things at a wedding', 'Video game consoles', 'Spices', 'Superheroes',
];

export const SOUNDS_TO_MAKE: string[] = [
  'A dolphin', 'A dial-up modem', 'A chainsaw', 'A crying baby', 'A rooster', 'A car that won’t start', 'A microwave finishing', 'A horse',
  'A sneeze', 'A motorcycle', 'A seagull', 'Popcorn popping', 'A creaky door', 'A phone vibrating on a table', 'An elephant', 'A helicopter',
  'A kettle', 'A cat fight', 'A golf swing', 'Rain on a roof', 'A camera shutter', 'A turkey', 'A train horn', 'A zipper',
];

export const TELL_WORDS: string[] = [
  'Pizza', 'Airport', 'Snowman', 'Wedding', 'Basketball', 'Netflix', 'Dentist', 'Volcano', 'Pirate', 'Selfie', 'Hamburger', 'Rollercoaster',
  'Thanksgiving', 'Gym', 'Taxi', 'Superman', 'Camping', 'Birthday', 'Elevator', 'Sushi', 'Penguin', 'Graduation', 'Treadmill', 'Fireworks',
];
export const TELL_TWISTS: string[] = [
  'No words that start with S', 'Only one-syllable words', 'Speak like a sports commentator', 'You can only ask questions', 'No hand gestures',
  'Use exactly three words per clue', 'Whisper only', 'Every clue must rhyme', 'Talk like a pirate', 'You can’t say “it”',
];

/** Launch prices in USD (base model, at release). */
/** Guess the Price: US launch prices. `wiki` is the Wikipedia article whose photo is shown (via /api/image). */
export const PRICES: { item: string; price: number; wiki: string }[] = [
  { item: 'Original Apple Macintosh (1984)', price: 2495, wiki: 'Macintosh 128K' },
  { item: 'First iPhone, 4 GB (2007)', price: 499, wiki: 'iPhone (1st generation)' },
  { item: 'PlayStation 5 with disc drive (2020)', price: 499, wiki: 'PlayStation 5' },
  { item: 'Nintendo Switch (2017)', price: 299.99, wiki: 'Nintendo Switch' },
  { item: 'Xbox 360 (2005)', price: 399, wiki: 'Xbox 360' },
  { item: 'PlayStation 2 (2000)', price: 299, wiki: 'PlayStation 2' },
  { item: 'Nintendo 64 (1996)', price: 199, wiki: 'Nintendo 64' },
  { item: 'Original Game Boy (1989)', price: 89.99, wiki: 'Game Boy' },
  { item: 'Original iPod (2001)', price: 399, wiki: 'iPod Classic' },
  { item: 'Apple Vision Pro (2024)', price: 3499, wiki: 'Apple Vision Pro' },
  { item: 'Apple Watch Sport (2015)', price: 349, wiki: 'Apple Watch (1st generation)' },
  { item: 'Original AirPods (2016)', price: 159, wiki: 'AirPods' },
  { item: 'Ford Model T (1908)', price: 850, wiki: 'Ford Model T' },
  { item: 'Original iPad, Wi-Fi 16 GB (2010)', price: 499, wiki: 'iPad (1st generation)' },
  { item: 'Nintendo Wii (2006)', price: 249.99, wiki: 'Wii' },
  { item: 'Motorola DynaTAC 8000X, the first cell phone (1983)', price: 3995, wiki: 'Motorola DynaTAC' },
  { item: 'DeLorean DMC-12 (1981)', price: 25000, wiki: 'DeLorean DMC-12' },
  { item: 'Segway PT (2001)', price: 4950, wiki: 'Segway' },
  { item: 'Apple Watch Edition in 18k gold (2015)', price: 10000, wiki: 'Apple Watch (1st generation)' },
  { item: 'Mac Pro, base model (2019)', price: 5999, wiki: 'Mac Pro' },
  { item: 'Tesla Roadster (2008)', price: 109000, wiki: 'Tesla Roadster (first generation)' },
  { item: 'Tesla Cybertruck Cyberbeast (2023)', price: 99990, wiki: 'Tesla Cybertruck' },
];

export const TOPICS_EVERGREEN: string[] = [
  'Is it ever okay to recline your seat on a plane?', 'Would you rather be famous or rich?', 'Is a hot dog a sandwich?',
  'Should tipping be replaced with higher wages?', 'Is working from home better than the office?', 'What’s the most overrated city?',
  'Would you take a one-way trip to Mars?', 'Is college still worth it?', 'Is AI going to take our jobs?', 'Best decade for music?',
  'Should you split the bill on a first date?', 'Is it rude to keep your phone on the table at dinner?',
];
