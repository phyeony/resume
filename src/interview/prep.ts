// Behavioural and system design prep shown on /admin/interview, built from the resume library and
// the Star Goshiwon and Resume Studio code. "[fill: …]" marks a fact only you know; the page
// highlights it. Your own notes and practice checkmarks are stored at owner/interview, not here,
// because this file ships in the JS bundle.

/** Stored at owner/interview. */
export interface InterviewProgress {
  /** Story and design keys you've practised out loud. */
  practiced: string[];
  /** Your own notes per story or design key: filled-in gaps, numbers, wording that works for you. */
  notes: Record<string, string>;
  updatedAt: number;
}

export interface FollowUp {
  q: string;
  a: string;
}

export interface Story {
  key: string;
  title: string;
  /** Where and when, as it reads on the resume. */
  where: string;
  /** What this story proves, in interviewer terms. */
  shows: string[];
  situation: string;
  task: string;
  action: string[];
  result: string;
  followUps: FollowUp[];
}

export interface BehaviouralQuestion {
  q: string;
  /** Story keys that answer it best, best first. */
  stories: string[];
  tip: string;
}

export interface DesignQuestion {
  key: string;
  title: string;
  /** Your own system, or a classic you can tie back to one. */
  kind: 'yours' | 'classic';
  prompt: string;
  clarify: string[];
  design: string[];
  deepDives: FollowUp[];
  /** How to bring your own experience in. */
  tieIn?: string;
}

/** Text splits into plain runs and "[fill: …]" gaps. */
export function splitGaps(text: string): { text: string; gap: boolean }[] {
  const out: { text: string; gap: boolean }[] = [];
  const re = /\[fill: ([^\]]+)\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), gap: false });
    out.push({ text: m[1], gap: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), gap: false });
  return out;
}

const storyText = (s: Story) => [s.situation, s.task, ...s.action, s.result, ...s.followUps.flatMap((f) => [f.q, f.a])];

/** Number of "[fill: …]" gaps left in a story. */
export const gapCount = (s: Story) => storyText(s).reduce((n, t) => n + splitGaps(t).filter((r) => r.gap).length, 0);

export const PITCH = {
  title: 'Tell me about yourself',
  lines: [
    "I'm a Computer Science student at SFU, finishing in December 2027, and I've already spent about four years building software professionally.",
    'Most recently I did my mandatory military service as a software developer in the Korean Air Force. I worked on a closed-network mission-planning web app in Spring Boot and Vue, where I cut schedule update latency from 10 seconds to 1 and made 10,000-row imports run without freezing the UI.',
    'Before that I spent almost two years at Cambian, where I went from intern to part-time to full-time, building serverless APIs on AWS and moving a React app to Next.js. Before that I was a DevOps intern at Scotiabank, rebuilding CI/CD on Argo Workflows.',
    'On my own I built and run Star Goshiwon, a booking site for a hostel in Seoul with real guests and PayPal payments, and Resume Studio, the tool I use for my job search.',
    "I'm looking for [fill: the kind of team or problem this company has, one sentence per company], which is why I applied here.",
  ],
  tips: [
    'Aim for 60 to 90 seconds. Stop after the last line and let them pick what to ask about.',
    'Swap the last line for each company. It is the only part that changes.',
    "If they ask why you're applying for internships with this much experience: the military service paused your degree, and you're finishing it now. Say it in one sentence, without apologising.",
  ],
};

export const STORIES: Story[] = [
  {
    key: 'exists',
    title: 'Schedule updates: 10s to 1s',
    where: 'Republic of Korea Air Force · 2024–2026',
    shows: ['Debugging', 'Performance', 'Databases', 'Ownership'],
    situation:
      'Operators updated mission schedules in our closed-network planning app, and each update took about 10 seconds. [fill: who complained or how you noticed, e.g. operators waiting, a ticket, your own testing]',
    task: '[fill: was this assigned to you, or did you pick it up yourself?] I needed to find where the time went without changing what the update did.',
    action: [
      '[fill: how you found it: SQL logs, a profiler, timing each step?]',
      'The update was loading full entities from the database just to check whether related records existed, so every update pulled far more rows and columns than it needed.',
      'I replaced those loads with EXISTS checks, which let the database answer yes or no and stop at the first matching row instead of returning data.',
      '[fill: how you checked nothing broke: tests, comparing results before and after, a staging run]',
    ],
    result: 'Schedule updates went from about 10 seconds to about 1 second, a 90% cut. [fill: what that changed for operators, e.g. they stopped double-submitting]',
    followUps: [
      {
        q: 'Why is EXISTS faster than loading the rows?',
        a: 'EXISTS stops at the first match and returns one boolean, and with a good index it can often be answered from the index alone. Loading entities returns every matching row and column over the network, then the ORM builds objects for them (and may lazy-load relations: the N+1 problem).',
      },
      {
        q: 'Why not add an index or a cache instead?',
        a: "An index helps find rows, but the app would still transfer and build every row. A cache adds invalidation problems for data that changes on every update. Fixing the query removed the work itself. [fill: did you also check indexes?]",
      },
      {
        q: 'How would you find a slow query like this next time?',
        a: 'Turn on SQL logging or use the ORM statistics to count queries per request, then run EXPLAIN ANALYZE on the slow ones. A request that runs dozens of queries or returns thousands of rows for a yes/no answer is the usual sign.',
      },
    ],
  },
  {
    key: 'csv',
    title: '10K-row imports without freezing',
    where: 'Republic of Korea Air Force · 2024–2026',
    shows: ['Front-end performance', 'Problem solving', 'Users first'],
    situation:
      'Users bulk-uploaded records from CSV files of 10,000+ rows. Each import took about 10 seconds and froze the page while it ran. [fill: who used it and how often]',
    task: 'Make large imports fast and keep the page responsive while they run.',
    action: [
      'Moved CSV parsing into a Web Worker, so the heavy work ran off the main thread and the page kept responding.',
      "Kept the parsed rows out of Vue's reactivity system. Vue wraps every object it tracks, which is costly for 10,000 rows that are only shown, not edited one field at a time.",
      'Built this into a reusable Vue data grid with server-side pagination, full-text search, filtering and inline editing, so the page never held more rows than it showed.',
    ],
    result: 'Imports dropped from about 10 seconds to about 3 (70%) and the page no longer froze. [fill: was the grid reused on other screens?]',
    followUps: [
      {
        q: 'Why does a Web Worker stop the freeze?',
        a: 'JavaScript runs the UI on one thread. A long parse blocks it, so clicks and paints wait. A worker runs on another thread and posts the result back, so the UI thread stays free.',
      },
      {
        q: 'Why not just parse on the server?',
        a: '[fill: your real reason, e.g. validation feedback before upload, or the server API took rows as JSON] Server parsing is also a fine answer, as long as the upload is streamed and the user sees progress.',
      },
      {
        q: 'Offset or cursor pagination for the grid?',
        a: 'Offset is simple and lets you jump to page N, but gets slower deep into a big table and can skip rows when data changes. A cursor (keyset) is fast at any depth and stable, but only goes next/previous. [fill: which one you used]',
      },
    ],
  },
  {
    key: 'pi-agent',
    title: 'Bringing a coding agent to a 50-person team',
    where: 'Republic of Korea Air Force · 2024–2026',
    shows: ['Influence without authority', 'Initiative', 'Learning fast', 'AI tooling'],
    situation:
      'Our team of 50+ developers worked on an air-gapped network with no access to cloud AI tools. [fill: what the team was doing without it, and what made you want to change that]',
    task: '[fill: whose idea was it, and what were you responsible for?]',
    action: [
      'Set up the open-source Pi coding agent against an on-premise 30B+ parameter LLM, so it worked fully inside the closed network.',
      'Built GitLab and Outline integrations so the agent could help with code review and documentation, where the team already worked.',
      '[fill: how you got people to use it: a demo, a pilot with one team, docs, answering questions]',
      '[fill: any pushback, e.g. security review or trust in AI output, and how you handled it]',
    ],
    result: '[fill: how many people used it, and one concrete change, e.g. reviews got faster or docs got written]',
    followUps: [
      {
        q: 'How did you make sure it was safe to use on a defense network?',
        a: '[fill: the approval process you went through] Everything ran on-premise: the model, the agent and the integrations, so no code left the network.',
      },
      {
        q: 'What would you do differently?',
        a: '[fill: one honest thing, e.g. measure usage from day one, or start with a smaller pilot]',
      },
    ],
  },
  {
    key: 'goshiwon',
    title: 'Building and running Star Goshiwon',
    where: 'Star Goshiwon · Apr 2026 – present',
    shows: ['Ownership end to end', 'Customer focus', 'Shipping', 'Testing'],
    situation:
      'A goshiwon (a small-room hostel) in Seoul wanted foreign guests but had no website they could find or book through. [fill: your connection to the property]',
    task: 'Build a site foreigners could trust and book from, and the admin tools to run it, on my own.',
    action: [
      'Built it alone in Next.js, TypeScript and Supabase (Postgres), deployed on Cloudflare Workers. It started as a request-to-book flow with no payments, so the host could approve each stay by hand.',
      'Added PayPal checkout after approval, with a payment-orders ledger so stale or duplicate PayPal events could never mark a booking paid twice, plus deposit refunds.',
      'Built Korean admin tools for the host: room availability by room unit, assigning rooms, email templates, guest review invites and moderation, and printable residence documents that immigration accepts.',
      'Wrote Vitest unit tests and Playwright end-to-end tests for the payment, review and document flows, and made the deploy script run them first, so a failing test blocks the release.',
    ],
    result: 'In six months: 3,400+ visitors, 33 booking requests and $2,350 in revenue. [fill: anything the host or guests said, or a feature that came from guest feedback]',
    followUps: [
      {
        q: "What's the hardest bug you hit?",
        a: '[fill: a real one] A strong candidate: PayPal events arriving late or twice after a new payment link replaced an old one. The ledger, with one active order per booking and duplicate captures flagged for refund, came from that problem.',
      },
      {
        q: 'Why request-to-book instead of instant booking?',
        a: 'One property with a few rooms and a host who wants to vet guests. Manual approval avoided building real-time inventory and payments up front, and let me launch in weeks. Payment came later, once requests were coming in.',
      },
      {
        q: 'How did you decide what to build next?',
        a: '[fill: e.g. host requests, PostHog/GA4 analytics, guest questions]',
      },
    ],
  },
  {
    key: 'memorize',
    title: 'Memorize: Excellence Award in a 3-person team',
    where: 'ROKAF Startup Competition · 2026',
    shows: ['Teamwork', 'Building under a deadline', 'AI and search'],
    situation:
      'In the 2026 ROKAF Startup Competition, our 3-person team built Memorize, a shared memory layer that carries project context across AI coding agent sessions and teammates.',
    task: '[fill: your part: search, the sync hub, the agent hooks, memory consolidation?]',
    action: [
      '[fill: what you designed and decided yourself]',
      'The search combined SQLite FTS5 keyword search (BM25) with bge-m3 embeddings, merged with reciprocal rank fusion. [fill: keep this line only if you built or ran it]',
      '[fill: how the three of you split work and agreed on decisions]',
      'The team used AI coding agents for parts of implementation, testing and review. [fill: what you wrote, reviewed and debugged yourself]',
    ],
    result:
      'Won the Excellence Award [fill: check the official name and whether "4th place" is the official ranking]. The search reached 0.978 recall@5 on the LongMemEval-S benchmark.',
    followUps: [
      {
        q: 'What does recall@5 = 0.978 mean?',
        a: 'For 97.8% of the 500 benchmark questions, the past session holding the answer was in the top 5 search results. It measures whether search finds the right memory, not whether the AI then answered correctly.',
      },
      {
        q: 'BM25 alone scored 0.966. Why add embeddings?',
        a: 'BM25 only matches shared words, so it already wins when questions reuse the names and phrases from the chat. Embeddings help when the question is worded differently. The small gain suggests most questions shared words with their answers.',
      },
      {
        q: 'How much of it did AI write?',
        a: '[fill: an honest split, and the parts you designed, decided and debugged]',
      },
    ],
  },
  {
    key: 'cambian',
    title: 'Intern to full-time at Cambian',
    where: 'Cambian Business Service · Nov 2022 – Jul 2024',
    shows: ['Growth', 'Trust', 'Cloud'],
    situation: 'I joined Cambian as an intern. [fill: what the product was and who used it]',
    task: '[fill: what you were trusted with first, and what you took on later]',
    action: [
      'Built serverless APIs with Node.js Lambda, DynamoDB and S3, deployed with AWS SAM templates.',
      'Built a shared sign-up and login flow on AWS Cognito. [fill: how many websites used it]',
      'Migrated a React app to the Next.js 13 App Router for security, SEO and caching. [fill: what was hard, e.g. moving data fetching to server components]',
    ],
    result: 'They kept me on as a part-time contractor, then hired me full-time with a raise. [fill: one measurable result, e.g. page load or SEO score after the migration]',
    followUps: [
      {
        q: 'Why did they promote you?',
        a: "[fill: what your manager said] Don't guess for them. Name one thing you did that went beyond the ticket.",
      },
      {
        q: 'Why DynamoDB for that API?',
        a: '[fill: the real access pattern] A good general answer: DynamoDB is fast and cheap when you know your access patterns up front and look up by key. It is a poor fit for ad-hoc queries and joins.',
      },
    ],
  },
  {
    key: 'scotia',
    title: 'Replacing Jenkins with Argo at Scotiabank',
    where: 'Scotiabank · Sep 2021 – Jun 2022',
    shows: ['DevOps', 'Improving a process', 'Working in a big company'],
    situation: 'Node.js services built on legacy Jenkins jobs, which were slow. [fill: how slow, and what that cost the teams]',
    task: '[fill: your scope as an intern]',
    action: [
      'Built CI/CD pipelines for Node.js services on Argo Workflows with Docker containers.',
      'Built a Docker image that validates, packages and publishes Helm charts, so the CD pipeline could deploy to Kubernetes.',
      'Wrote Python load tests for a service used by 800 internal projects, to check it met its 3-second response-time target.',
    ],
    result: 'Build and run times dropped 40% against the old Jenkins jobs. [fill: how many services moved over]',
    followUps: [
      {
        q: 'Where did the 40% come from?',
        a: "[fill: the real reason, e.g. parallel steps, cached Docker layers, no shared Jenkins agents queueing] Know this one cold: it's the first thing a DevOps interviewer asks.",
      },
      {
        q: 'What did you learn about working in a large company?',
        a: '[fill: e.g. change approvals, security reviews, writing things down]',
      },
    ],
  },
  {
    key: 'resume-studio',
    title: 'Resume Studio, my own job-search tool',
    where: 'Personal project · 2026',
    shows: ['Product sense', 'Self-directed', 'Privacy by design'],
    situation: 'Applying to many internships meant a tailored resume per company, the same form fields typed again and again, and status emails lost in two inboxes.',
    task: 'Build one tool for the whole search, used by one person: me.',
    action: [
      'Built a React, TypeScript and Firebase app: a library of every bullet, and versions that pick bullets per company and render to PDF and Word.',
      'Gave each company its own share link with view tracking that filters out email scanners and link previews, so a view means a person opened it.',
      'Wrote a Chrome extension that autofills application forms from my profile and saved answers.',
      'Wrote a daily Google Apps Script job that reads status emails and moves applications forward. It only saves status emails, as short excerpts; everything else stays in Gmail.',
    ],
    result: '[fill: how many applications you have tracked with it, or time saved per application]',
    followUps: [
      {
        q: 'Why build this instead of using a spreadsheet?',
        a: 'A spreadsheet tracks applications but does not tailor resumes, fill forms or read email. [fill: the moment you decided to build it]',
      },
      {
        q: 'How did you keep your data private on a public site?',
        a: 'Firestore security rules allow the owner account (verified email) to read and write everything. Visitors can only fetch a published resume by its exact link id and add a view record. The phone number is never in the shipped code.',
      },
    ],
  },
  {
    key: 'failure',
    title: 'A mistake or failure',
    where: 'Pick a real one',
    shows: ['Self-awareness', 'Learning'],
    situation: '[fill: a real mistake: a bug you shipped, a wrong estimate, a feature nobody used]',
    task: '[fill: what you owned]',
    action: ['[fill: how you noticed]', '[fill: what you did right away to fix it]', '[fill: what you changed so it would not happen again]'],
    result: '[fill: the outcome, and the habit you kept]',
    followUps: [
      {
        q: 'What would you do differently?',
        a: 'Interviewers want a real mistake with a real lesson, not a disguised strength like "I work too hard". Spend most of the answer on the fix and the lesson.',
      },
    ],
  },
];

export const BEHAVIOURAL: BehaviouralQuestion[] = [
  { q: 'Tell me about the hardest technical problem you solved.', stories: ['exists', 'csv', 'goshiwon'], tip: 'Pick one with a number. Spend half the answer on how you found the cause.' },
  { q: 'Tell me about a time you improved performance.', stories: ['exists', 'csv', 'scotia'], tip: 'Before, after, and why the fix worked. Expect "why not a cache?"' },
  { q: 'Tell me about a project you owned end to end.', stories: ['goshiwon', 'resume-studio'], tip: 'Real users and revenue beat features. Lead with the numbers.' },
  { q: 'Tell me about a time you influenced people without authority.', stories: ['pi-agent', 'scotia'], tip: 'Show how you got people to change habits, not just what you built.' },
  { q: 'Tell me about working in a team. How did you split work?', stories: ['memorize', 'pi-agent'], tip: 'Say "I" for your part and "we" for the team. Interviewers listen for the difference.' },
  { q: 'Tell me about a disagreement with a teammate or manager.', stories: ['memorize', 'pi-agent', 'cambian'], tip: 'You need a real one. End with how you decided, not who won.' },
  { q: 'Tell me about a time you failed or made a mistake.', stories: ['failure', 'goshiwon'], tip: 'Own it in one sentence, then spend the time on the fix and what you changed.' },
  { q: 'Tell me about learning something new quickly.', stories: ['pi-agent', 'memorize', 'cambian'], tip: 'Name what you did not know, how you learned it, and how fast it was useful.' },
  { q: 'Tell me about a time requirements were unclear.', stories: ['goshiwon', 'resume-studio'], tip: 'Show you shipped a small version first and learned from real use.' },
  { q: 'Tell me about a time you went above and beyond for a user.', stories: ['csv', 'goshiwon'], tip: 'Start from the user\'s pain, not the tech.' },
  { q: 'Tell me about a tight deadline.', stories: ['memorize', 'goshiwon'], tip: 'Say what you cut to make it, and why that was the right cut.' },
  { q: 'Why did you get promoted at Cambian? What feedback have you had?', stories: ['cambian'], tip: 'Quote real feedback if you have it. Add one thing you are still working on.' },
  { q: 'Why an internship, after this much work experience?', stories: [], tip: "Mandatory military service paused your degree, and you're finishing it by December 2027. One sentence, then turn to what you want to learn here." },
  { q: 'Why this company?', stories: [], tip: 'One thing about their product, one about the team or tech, one link to something you built. Write it fresh for each company.' },
];

export const QUESTIONS_TO_ASK = [
  'What does a successful intern on this team have done by the end of the term?',
  'What would I work on in my first two weeks?',
  'How does code get from a pull request to production here?',
  'What is the hardest technical problem the team is working on right now?',
  'How do interns get feedback, and how often?',
];

export const STAR_TIPS = [
  'Situation and task: two sentences, together. Most of the answer is Action.',
  'Say "I", not "we", for what you did. Be ready to say who did the rest.',
  'End the result with a number, then one sentence on what you learned.',
  'Two minutes is about right. Stop and let them ask follow-ups.',
  'One story can answer several questions. Learn eight well instead of twenty badly.',
];

export const DESIGN_STEPS = [
  { step: 'Clarify (5 min)', text: 'Who uses it, the 2 or 3 core features, and rough scale: users, requests per second, data size. Write them down.' },
  { step: 'API and data (5–10 min)', text: 'The few endpoints or calls, and the main tables or collections with their keys.' },
  { step: 'High-level design (10 min)', text: 'Client, API servers, database, plus a cache, queue or blob store only when a requirement needs it. Walk one request through it.' },
  { step: 'Deep dive (15 min)', text: 'Pick the hardest part, or let them pick: consistency, the hot path, failure handling. Say the trade-off out loud.' },
  { step: 'Wrap up (5 min)', text: 'Bottlenecks, what you would monitor, and what changes at 10× scale.' },
];

export const NUMBERS = [
  { n: '1 day', v: '≈ 86,400 s ≈ 10⁵ s, so 1M requests a day ≈ 12 per second' },
  { n: 'Peak traffic', v: 'about 2–3× the average' },
  { n: 'Memory read', v: '≈ 100 ns; SSD read ≈ 100 µs; same-region network round trip ≈ 0.5–1 ms' },
  { n: 'One Postgres box', v: 'thousands of simple queries per second; millions to low billions of rows with good indexes' },
  { n: 'Redis', v: '≈ 100K operations per second per node' },
];

export const DESIGNS: DesignQuestion[] = [
  {
    key: 'd-goshiwon',
    title: 'Your booking system (Star Goshiwon)',
    kind: 'yours',
    prompt: 'Walk me through how a booking works on Star Goshiwon, from the guest\'s request to a confirmed, paid stay.',
    clarify: ['One property, a few room types, each with several room units.', 'Guests request; the host approves by hand; payment happens after approval.', 'Traffic is small (thousands of visitors), so correctness matters far more than scale.'],
    design: [
      'Next.js on Cloudflare Workers serves pages and API routes; Supabase Postgres holds the data.',
      'Tables: rooms (types and nightly rates), room_units (actual rooms), room_unit_blocks (dates a unit is taken: tentative, confirmed or cancelled; direct or external bookings), booking_requests, payment_orders.',
      'Request: validate with Zod, recalculate the price on the server (never trust the client\'s price), store the request, email the host and the guest.',
      'Approve: the host assigns a room unit, which checks for overlapping blocks, then emails the guest a private payment link with a deadline.',
      'Pay: the link creates a PayPal order recorded in payment_orders. A verified PayPal webhook or the return page captures it and marks the booking paid and confirmed.',
    ],
    deepDives: [
      {
        q: 'Two admins assign the same room for overlapping dates at the same moment. What happens?',
        a: 'Today the overlap check runs in app code, then the write happens, so two requests could both pass the check. Fix it in the database: a Postgres exclusion constraint on (room_unit_id, daterange(check_in, check_out)) for non-cancelled blocks, or a transaction that locks the unit\'s rows with SELECT … FOR UPDATE. Saying this unprompted shows you know check-then-act races.',
      },
      {
        q: 'PayPal sends the same webhook twice, or a stale one for an old link. How do you avoid double-charging or double-confirming?',
        a: 'Every order is a row in payment_orders with a unique provider_order_id, and a partial unique index allows only one active order per booking. Webhooks are signature-verified. If a capture arrives for a booking that is already paid, it is stored as duplicate_paid with requires_refund set instead of confirming twice. Creating orders and refunds use idempotency keys so a retry is safe.',
      },
      {
        q: 'Why price on the server?',
        a: 'The client can send any number. The server recomputes from stored nightly rates and long-stay discounts and stores that amount.',
      },
      {
        q: 'How would this change for 1,000 properties?',
        a: 'Add a property_id to everything and index by it. Availability search becomes the hot path: precompute free nights per unit, or cache search results briefly. Move emails and document generation onto a queue. Payments stay the same pattern.',
      },
    ],
    tieIn: 'This is your strongest design story: real money, real guests, and real edge cases you handled.',
  },
  {
    key: 'd-studio',
    title: 'Your Resume Studio',
    kind: 'yours',
    prompt: 'Design a tool that lets someone publish tailored resumes as share links, see when each link is opened, and track applications from email.',
    clarify: ['One owner writes; anyone with a link reads.', 'A link must keep showing exactly what was sent, even after the owner edits their resume.', 'Views should count people, not email scanners.'],
    design: [
      'React single-page app on Firebase Hosting; Firestore for data; owner signs in with Google.',
      'A library holds every entry and bullet. A version stores a frozen snapshot of its content, so edits to the library never change a resume already sent.',
      'Publishing copies the snapshot to public/{slug}. Security rules let visitors get that one document by id and create view records, nothing else.',
      'Views store a random per-browser id (to count distinct visitors) and drop user agents of known scanners and link unfurlers.',
      'A daily Apps Script job reads recent Gmail, classifies status emails with tested rules and moves applications forward. Stages only move forward.',
    ],
    deepDives: [
      {
        q: 'Why snapshot instead of referencing the library?',
        a: 'A recruiter must see what you sent. References would change old links whenever you edit. The cost is storage and a "re-save to update" step, which is cheap.',
      },
      {
        q: 'Scanners that run JavaScript still count as views. How would you do better?',
        a: 'Look at timing (a scanner opens within seconds of the email), require a scroll or a second event before counting, or show "likely bot" instead of hiding it.',
      },
      {
        q: 'Turn it into a product for 100,000 users.',
        a: 'Key every document by user id and write rules per user. Move the mail job from a personal script to Gmail push notifications (Pub/Sub) per user, with OAuth consent. Render PDFs server-side or keep them client-side to save cost. Rate-limit the public view endpoint.',
      },
    ],
  },
  {
    key: 'd-c2',
    title: 'Your mission scheduling app (Air Force)',
    kind: 'yours',
    prompt: 'Explain the architecture of the mission-planning system you worked on, at the level you can share.',
    clarify: ['Only share what is public. "Closed network, defense compliance" is a fine answer to anything sensitive.', 'Users: [fill: rough number of operators]', 'Stack: Spring Boot and Vue. [fill: confirm, and the database]'],
    design: [
      'Spring Boot API with a relational database, Vue front end, all on a closed network.',
      'A data grid backed by server-side pagination, search and filtering, so the browser only holds one page of rows.',
      'LLM-assisted target matching ran on-premise and streamed its progress to the browser with server-sent events (EventSource).',
      'Data was encrypted with ARIA, the Korean standard block cipher, under defense compliance rules.',
    ],
    deepDives: [
      {
        q: 'Why EventSource and not WebSockets for the LLM output?',
        a: 'The data only flows server to client, over plain HTTP, with automatic reconnect built in. WebSockets are for two-way traffic and need more setup through proxies.',
      },
      {
        q: 'What is different about building for an air-gapped network?',
        a: 'No package registries or cloud services: dependencies are mirrored internally, models run on local GPUs, and updates move by an approved process. You design for no internet from day one.',
      },
      {
        q: 'How did search work on the grid?',
        a: '[fill: e.g. database full-text index, LIKE queries, or a search engine]',
      },
    ],
  },
  {
    key: 'd-shortener',
    title: 'URL shortener',
    kind: 'classic',
    prompt: 'Design a service like bit.ly: shorten a long URL, and redirect the short one.',
    clarify: ['Custom aliases? Expiry? Click analytics?', 'Scale: say 100M new links a month and 10× more redirects than creations.'],
    design: [
      'POST /links {url} returns a short code; GET /{code} returns a 301 or 302 redirect.',
      'Code: base62 of a unique id from a counter or ID service (7 characters ≈ 3.5 trillion codes), or a random code with a uniqueness check.',
      'Store code → url in a key-value store or Postgres with the code as primary key.',
      'Redirects are read-heavy: put a cache (Redis or a CDN) in front, since hot links get most of the traffic.',
      'Analytics: write click events to a queue and count them asynchronously, never in the redirect path.',
    ],
    deepDives: [
      { q: '301 or 302?', a: '301 is cached by browsers, so it is cheaper but you lose click counts. 302 hits you every time, so analytics work.' },
      { q: 'Counter or random codes?', a: 'A counter never collides but is guessable and needs coordination (hand out ranges to each server). Random codes are unguessable but need a collision check.' },
    ],
    tieIn: 'Resume Studio\'s share links are a small version of this: a slug per company, a public document per slug, and a view log. Mention how you filtered bot clicks.',
  },
  {
    key: 'd-rate',
    title: 'Rate limiter',
    kind: 'classic',
    prompt: 'Design a rate limiter for an API: each user gets at most N requests per minute.',
    clarify: ['Per user, per IP or per API key?', 'Hard limit or a little leeway? What do blocked callers get back (429 with Retry-After)?', 'One server or many?'],
    design: [
      'Token bucket: each user has a bucket that refills at a steady rate; a request takes one token or is rejected. Allows short bursts.',
      'Sliding-window counter: count requests in the current and previous minute and weight them. Smoother than a fixed window.',
      'For many servers, keep counters in Redis and update them atomically (INCR with expiry, or a Lua script).',
      'Put it in an API gateway or middleware, before the expensive work.',
    ],
    deepDives: [
      { q: 'Why not a fixed window?', a: 'A user can send N at 0:59 and N more at 1:00: double the limit in two seconds.' },
      { q: 'Redis goes down. Fail open or closed?', a: 'Usually fail open for normal APIs (do not take the site down with the limiter), and closed for login or payments, where abuse costs more.' },
    ],
  },
  {
    key: 'd-booking',
    title: 'Ticket or hotel booking at scale',
    kind: 'classic',
    prompt: 'Design a booking system like Ticketmaster or Booking.com, where many people try to book the same seat or room.',
    clarify: ['Seats (one per person) or rooms (inventory per night)?', 'How long can someone hold an item while paying?', 'Is overselling ever acceptable?'],
    design: [
      'Search reads from a cache or search index; booking writes go to the source of truth (Postgres).',
      'Hold: reserve the item with a status and an expiry (10 minutes) while the user pays; a background job releases expired holds.',
      'Prevent double booking with a unique or exclusion constraint, or a conditional update (UPDATE … WHERE status = \'free\') that only one request can win.',
      'Payment: create the order with an idempotency key, confirm on the provider\'s verified webhook, and treat webhooks as possibly late or duplicated.',
      'For a huge on-sale, put users in a virtual waiting room so the booking service sees a steady rate.',
    ],
    deepDives: [
      { q: 'Optimistic or pessimistic locking?', a: 'Optimistic (version column, retry on conflict) when conflicts are rare. Pessimistic (SELECT FOR UPDATE) or a queue per event when everyone wants the same seats.' },
      { q: 'The payment succeeds but your server crashes before saving it.', a: 'The webhook retries, and the handler is idempotent by order id, so the booking is confirmed on the retry. A reconciliation job compares provider records with yours daily.' },
    ],
    tieIn: 'You have built exactly this at small scale. Use Star Goshiwon\'s payment ledger and duplicate-capture handling as your examples, and be honest that the overlap check would need a database constraint at scale.',
  },
  {
    key: 'd-notify',
    title: 'Notification service',
    kind: 'classic',
    prompt: 'Design a service that sends email, push and SMS notifications for other teams\' events.',
    clarify: ['Which channels? Do users have preferences and quiet hours?', 'Must every notification arrive, and only once?', 'Volume, and are some urgent (password reset) while others are bulk?'],
    design: [
      'Other services publish events to a queue; a notification service reads them, checks user preferences, renders a template and hands off to a per-channel worker.',
      'Separate queues for urgent and bulk messages, so a marketing blast does not delay password resets.',
      'Workers call providers (SES, FCM, Twilio) with retries and backoff; failures after N tries go to a dead-letter queue.',
      'Store each send with a dedupe key so a retried event does not send twice.',
    ],
    deepDives: [
      { q: 'Exactly-once delivery?', a: 'Queues give at-least-once. You get "effectively once" with a dedupe key stored before sending.' },
      { q: 'A provider is down.', a: 'Retry with backoff, open a circuit breaker, and fail over to a second provider for critical messages.' },
    ],
    tieIn: 'Star Goshiwon stores email templates and every send in the database. The Resume Studio mail job is the receiving side: classify incoming email and update state.',
  },
  {
    key: 'd-search',
    title: 'Search and autocomplete',
    kind: 'classic',
    prompt: 'Design search with autocomplete for a site with millions of items.',
    clarify: ['Prefix matches only, or typos and synonyms too?', 'How fresh must results be after an item changes?', 'Latency budget per keystroke (under 100 ms)?'],
    design: [
      'An inverted index (Elasticsearch, or Postgres full-text for smaller data) maps words to items and scores them with BM25.',
      'Autocomplete: a prefix structure (trie or edge n-grams) over popular queries, cached in memory, ranked by popularity.',
      'Index updates flow from the database through a queue, so search is eventually consistent.',
      'Debounce on the client and cache responses for common prefixes.',
    ],
    deepDives: [
      { q: 'Keyword or semantic search?', a: 'Keyword (BM25) is exact and cheap; embeddings catch different wording. Hybrid search runs both and merges rankings, for example with reciprocal rank fusion.' },
      { q: 'How do you know search got better?', a: 'Offline: a labelled set and recall@k or NDCG. Online: click-through and "no results" rates.' },
    ],
    tieIn: 'Memorize\'s hybrid search (FTS5 BM25 + bge-m3 embeddings + RRF, 0.978 recall@5) is your example, as long as you can explain your part. The Air Force data grid\'s full-text search is a second one.',
  },
  {
    key: 'd-cicd',
    title: 'CI/CD pipeline',
    kind: 'classic',
    prompt: 'Design a CI/CD system for a company with hundreds of services.',
    clarify: ['Monorepo or many repos?', 'Where do services run (Kubernetes)?', 'How do changes get approved for production?'],
    design: [
      'On each push: build in a clean container, run unit tests, build and scan an image, push it to a registry tagged with the commit.',
      'Shared pipeline templates (Argo WorkflowTemplates or reusable GitHub Actions) so each service writes little config.',
      'Deploy by updating a Helm chart or manifest; roll out to staging, then production with a canary or rolling update.',
      'Speed: cache dependencies and Docker layers, run steps in parallel, only rebuild what changed.',
    ],
    deepDives: [
      { q: 'A bad deploy reaches production.', a: 'Health checks and canary metrics stop the rollout automatically; rollback is redeploying the previous image tag.' },
      { q: 'How do you keep secrets out of logs and images?', a: 'Inject them at runtime from a secret store, never bake them into images, and mask them in pipeline output.' },
    ],
    tieIn: 'This is your Scotiabank work (Argo Workflows, Docker, Helm charts, 40% faster than Jenkins). Star Goshiwon also runs every test before each deploy.',
  },
];

export const ALL_KEYS = [...STORIES.map((s) => s.key), ...DESIGNS.map((d) => d.key)];
