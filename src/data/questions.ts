import type { QuizQuestion, QuizTopic } from '../types';

// Seed content for the quiz. Each entry is one of the "oddly specific"
// questions shown in the design prototype. `kind` drives which extra
// UI shows up in <QuizScreen>: image | clues | connect | choice | blank | text.

export const QUESTION_BANK: QuizQuestion[] = [
  {
    label: 'VISUAL QUESTION',
    kind: 'image',
    imgAlt: 'archival plate — the Inland Customs Line hedge',
    setup:
      'This barrier once ran for thousands of kilometres across India, patrolled by thousands of men. It was not a military frontier, and it was not built to keep animals out.',
    ask: 'Give funda: what was the government trying to stop people carrying across it?',
    note: 'what moved?',
    answer: 'Salt',
    explain:
      'The Inland Customs Line existed to stop untaxed salt crossing between regions with different salt duties. The scale of the hedge only makes sense once you see it as protecting a major source of colonial revenue.',
    sources: [
      { title: 'Report on the administration of the inland customs department', meta: 'Government record · 1869–70' },
      { title: 'The Great Hedge of India', meta: 'Monograph · 2001' },
    ],
  },
  {
    label: 'VISUAL QUESTION · 1 OF 2',
    kind: 'image',
    imgAlt: 'archival photo — 1928 Olympic hockey team portrait',
    setup: 'At which Olympic Games did India win its first field hockey gold medal?',
    note: 'Where and when?',
    answer: 'Amsterdam, 1928',
    explain:
      'India went unbeaten and did not concede a goal in the tournament, beginning a run of six consecutive Olympic hockey titles.',
    sources: [
      { title: 'Official Report of the IX Olympiad, Amsterdam 1928', meta: 'Netherlands Olympic Committee · pp. 402–414' },
      { title: 'Hockey at the Olympic Games: a record of results', meta: 'International federation archive · accessed 2026' },
    ],
  },
  {
    label: 'ORIGINAL PURPOSE',
    kind: 'image',
    imgAlt: 'close-up — early sheet of air-pocket plastic',
    setup:
      'In 1957 two engineers sealed two plastic shower curtains together and trapped pockets of air between them. They had made something that became wildly successful — but not for the reason they intended.',
    ask: 'What were they originally trying to make?',
    note: 'first use?',
    answer: 'Textured wallpaper',
    explain:
      'The material only found its market as protective packaging years later; the first pitch was decorative wall covering for the modern home.',
    sources: [
      { title: 'Patent: method for making laminated cushioning material', meta: 'Patent office record · 1960' },
      { title: 'Accidental products of the American plastics industry', meta: 'Design history journal · 2016' },
    ],
  },
  {
    label: 'WORK IT OUT',
    kind: 'text',
    setup:
      'Before the 1950s, ports handled cargo in sacks, barrels, crates and boxes of every shape. Then one deceptively simple design choice transformed global trade.',
    ask: 'What had to be standardised?',
    answer: 'The shipping container',
    explain:
      'Fixed outer dimensions and corner fittings let the same box move between ship, crane, rail and truck without ever being unpacked.',
    sources: [
      { title: 'ISO 668: series 1 freight containers — classification and dimensions', meta: 'Standards record · first published 1968' },
      { title: 'Containerisation and the cost of moving goods', meta: 'Economic history review · 2013' },
    ],
  },
  {
    label: '3 CLUES',
    kind: 'clues',
    setup: 'Three clues, one object. Pull them one at a time.',
    ask: 'What is it?',
    clues: [
      { tag: 'CLUE ONE', text: 'It became commercially important before refrigeration was widespread.' },
      { tag: 'CLUE TWO', text: 'Its production involved removing much of the water from a dairy product.' },
      { tag: 'CLUE THREE', text: 'Sugar was added in large quantities, partly to preserve it.' },
    ],
    answer: 'Condensed milk',
    explain:
      'Taking out the water and loading in sugar made milk shelf-stable for months, which is why it travelled with armies, ships and railways long before cold chains existed.',
    sources: [
      { title: 'Patent for concentrated milk, filed 1856', meta: 'Patent office record · no. 15,553' },
      { title: 'Preservation by sugar: dairy in the nineteenth century', meta: 'Food history quarterly · 2009' },
    ],
  },
  {
    label: 'PICK ONE',
    kind: 'choice',
    setup: 'A 19th-century building in Madras was put up to store a commodity shipped thousands of kilometres from New England.',
    ask: 'What was kept inside?',
    choices: [
      { key: 'A', text: 'Salt' },
      { key: 'B', text: 'Ice' },
      { key: 'C', text: 'Tea' },
      { key: 'D', text: 'Opium' },
    ],
    answer: 'Ice',
    explain:
      'Natural ice was cut from New England ponds, packed in sawdust and sailed to Indian ports for decades before mechanical refrigeration arrived.',
    sources: [
      { title: 'The Frozen-Water Trade: a true story', meta: 'Monograph · 2003' },
      { title: 'Madras ice house: conservation notes', meta: 'State archaeology department · 1998' },
    ],
  },
  {
    label: 'FILL THE BLANK',
    kind: 'blank',
    setup: 'Before decimalisation, one rupee was divided into sixteen annas.',
    ask: 'So what does “solah anna” mean?',
    answer: 'Completely, the whole thing',
    explain:
      'Sixteen annas made one full rupee, so the phrase became shorthand for something absolute — the full measure, nothing missing.',
    sources: [
      { title: 'Coinage of British India: denominations and usage', meta: 'Numismatic society bulletin' },
      { title: 'Hobson-Jobson: a glossary of Anglo-Indian terms', meta: 'Entry: anna · 1886' },
    ],
  },
  {
    label: 'CONNECT',
    kind: 'connect',
    setup: 'Four fragments, one object.',
    ask: 'What modern household appliance connects them?',
    clues: [
      { tag: 'ONE', text: 'Friday evening.' },
      { tag: 'TWO', text: 'A communal bakery.' },
      { tag: 'THREE', text: 'Residual oven heat.' },
      { tag: 'FOUR', text: 'An American inventor.' },
    ],
    answer: 'The slow cooker',
    explain:
      'Irving Naxon built it after hearing how Jewish families left cholent in the falling heat of a bakery oven overnight for the Sabbath.',
    sources: [
      { title: 'Patent: electric cooking vessel with controlled heat', meta: 'Patent office record · 1940' },
      { title: 'Sabbath cooking and the domestic appliance', meta: 'Culinary history essays · 2018' },
    ],
  },
  {
    label: 'WORDS TRAVEL',
    kind: 'text',
    setup:
      'Long before it belonged to cowboys and American pop culture, this item reached Europe as Indian patterned cloth. Its English name still carries the technique used to make it.',
    ask: 'What item is it?',
    answer: 'The bandana',
    explain:
      'The word comes from bandhani — the tie-dyeing tradition in which cloth is bound in tiny knots before dyeing, leaving a field of resist-dyed dots.',
    sources: [
      { title: 'Indian textiles and the European trade, 1600–1800', meta: 'Museum catalogue · 2015' },
      { title: 'Etymology: bandana', meta: 'Historical dictionary entry' },
    ],
  },
  {
    label: 'LOOK CLOSER',
    kind: 'image',
    imgAlt: 'close-up — bronze winged figure atop a domed memorial',
    setup: 'This figure stands at the very top of a memorial in Kolkata. Most visitors assume it is purely decorative.',
    ask: 'What does it actually do?',
    note: 'look at the base',
    answer: 'It turns in the wind',
    explain: 'The bronze figure is mounted on bearings, so the whole thing behaves like an enormous weather vane above the dome.',
    sources: [
      { title: 'Victoria Memorial Hall: architectural record', meta: 'Conservation survey · 2011' },
      { title: 'Bronze figures and mechanical mountings', meta: 'Restoration notes · 1997' },
    ],
  },
];

// Short, self-contained teaser lines for the landing page's rotating strip.
// Each one paraphrases a real, sourced question from QUESTION_BANK down to a
// single standalone sentence (no setup context needed, no answer given away)
// — nothing here is invented; keep these in sync if the bank above changes.
export const LANDING_TEASERS: string[] = [
  "What was Britain's thousands-of-kilometre hedge across colonial India actually built to stop people carrying?",
  'At which Olympic Games did India win its first field hockey gold medal?',
  'In 1957, two engineers accidentally invented something huge, for a completely different reason. What were they trying to make?',
  'Before the 1950s, cargo moved in sacks, barrels and crates of every shape. What one invention changed global trade?',
  'A 19th-century warehouse in Madras stored a commodity shipped 12,000km from New England. What was inside?',
  "Before decimal currency, one rupee was sixteen annas. So what does 'solah anna' mean?",
  'What common kitchen appliance was invented after someone heard how Jewish families cooked Sabbath dinners overnight?',
  "Long before cowboys, this patterned cloth reached Europe from India. What's it called today?",
];

export const TOPICS: QuizTopic[] = [
  { name: 'Indian sport', count: 'NEW', tab: '#E4D9B8' },
  { name: 'Cinema', count: '10', tab: '#CADCD2' },
  { name: 'World history', count: '10', tab: '#E9D3B2' },
  { name: 'Science & strange things', count: '10', tab: '#DCD2E0' },
  { name: 'Video games', count: '10', tab: '#D9DCC6' },
];
