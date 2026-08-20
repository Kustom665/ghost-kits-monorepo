/**
 * Demo data for CentralFlow.
 *
 * The generator simulates correspondence rather than stamping rows with the
 * numbers we want the dashboard to show. Every message lands on a real working
 * hour, threads are built backwards from a chosen amount of *working* wait, and
 * the conversation cache is rebuilt from the messages afterwards — so the
 * inbox, the SLA figures and the account health scores all agree because they
 * are all reading the same correspondence a real inbox would have produced.
 *
 * It is deterministic: the same seed produces the same agency every time.
 */

import type { DatabaseSync } from 'node:sqlite';
import {
  addBusinessHours,
  nextBusinessInstant,
  subtractBusinessHours,
  type AccountTier,
  type Channel,
  type DealStage,
  type TeamRole,
} from '#core';

const DAY = 86_400_000;

/** Small, fast, deterministic PRNG — enough for demo data, no dependency. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  (): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

function makeRng(seed: number): Rng {
  const next = mulberry32(seed) as Rng;
  next.int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.chance = (p) => next() < p;
  return next;
}

interface TeamSpec {
  id: string;
  name: string;
  role: TeamRole;
  capacity: number;
}

const TEAM: TeamSpec[] = [
  { id: 'tm_rowan', name: 'Rowan Ellis', role: 'principal', capacity: 18 },
  { id: 'tm_priya', name: 'Priya Raman', role: 'account_manager', capacity: 34 },
  { id: 'tm_marcus', name: 'Marcus Bell', role: 'account_manager', capacity: 34 },
  { id: 'tm_lena', name: 'Lena Okafor', role: 'strategist', capacity: 30 },
  { id: 'tm_dev', name: 'Devon Chase', role: 'designer', capacity: 28 },
  { id: 'tm_sam', name: 'Sam Iyer', role: 'developer', capacity: 30 },
];

interface AccountSpec {
  id: string;
  name: string;
  tier: AccountTier;
  retainer: number;
  industry: string;
  ownerId: string;
  /** Months the relationship has been running. */
  ageMonths: number;
  /** Days from now until renewal; null for prospects. */
  renewalInDays: number | null;
  contacts: Array<{ name: string; title: string }>;
}

const ACCOUNTS: AccountSpec[] = [
  {
    id: 'acc_northwind', name: 'Northwind Outfitters', tier: 'flagship', retainer: 18_500,
    industry: 'Outdoor retail', ownerId: 'tm_priya', ageMonths: 26, renewalInDays: 41,
    contacts: [
      { name: 'Dana Reyes', title: 'VP Marketing' },
      { name: 'Theo Nakamura', title: 'Ecommerce Lead' },
      { name: 'Bree Salas', title: 'Brand Manager' },
    ],
  },
  {
    id: 'acc_meridian', name: 'Meridian Health', tier: 'flagship', retainer: 22_000,
    industry: 'Healthcare', ownerId: 'tm_marcus', ageMonths: 18, renewalInDays: 96,
    contacts: [
      { name: 'Alicia Fenn', title: 'Chief Marketing Officer' },
      { name: 'Grant Whitley', title: 'Digital Director' },
    ],
  },
  {
    id: 'acc_lumen', name: 'Lumen Financial', tier: 'flagship', retainer: 16_000,
    industry: 'Fintech', ownerId: 'tm_priya', ageMonths: 11, renewalInDays: 24,
    contacts: [
      { name: 'Nadia Brooks', title: 'Head of Growth' },
      { name: 'Owen Park', title: 'Product Marketing' },
    ],
  },
  {
    id: 'acc_carraway', name: 'Carraway Foods', tier: 'growth', retainer: 8500,
    industry: 'CPG', ownerId: 'tm_marcus', ageMonths: 14, renewalInDays: 152,
    contacts: [
      { name: 'Jonah Pike', title: 'Marketing Director' },
      { name: 'Imani Cole', title: 'Social Lead' },
    ],
  },
  {
    id: 'acc_atlas', name: 'Atlas Logistics', tier: 'growth', retainer: 9200,
    industry: 'Freight', ownerId: 'tm_priya', ageMonths: 9, renewalInDays: 58,
    contacts: [
      { name: 'Rachel Voss', title: 'VP Demand Gen' },
      { name: 'Miles Duarte', title: 'Operations' },
    ],
  },
  {
    id: 'acc_juniper', name: 'Juniper Interiors', tier: 'growth', retainer: 6800,
    industry: 'Home design', ownerId: 'tm_marcus', ageMonths: 21, renewalInDays: 210,
    contacts: [
      { name: 'Sofia Klein', title: 'Founder' },
      { name: 'Peter Adeyemi', title: 'Studio Manager' },
    ],
  },
  {
    id: 'acc_beacon', name: 'Beacon Legal', tier: 'growth', retainer: 7400,
    industry: 'Professional services', ownerId: 'tm_priya', ageMonths: 7, renewalInDays: 87,
    contacts: [
      { name: 'Harriet Doyle', title: 'Managing Partner' },
      { name: 'Curtis Nwosu', title: 'Business Development' },
    ],
  },
  {
    id: 'acc_verdant', name: 'Verdant Labs', tier: 'starter', retainer: 3200,
    industry: 'Biotech', ownerId: 'tm_lena', ageMonths: 5, renewalInDays: 33,
    contacts: [{ name: 'Elena Marsh', title: 'Communications' }],
  },
  {
    id: 'acc_tinderbox', name: 'Tinderbox Coffee', tier: 'starter', retainer: 2400,
    industry: 'Hospitality', ownerId: 'tm_lena', ageMonths: 12, renewalInDays: 121,
    contacts: [{ name: 'Ray Okonkwo', title: 'Owner' }],
  },
  {
    id: 'acc_pinepoint', name: 'Pinepoint Realty', tier: 'starter', retainer: 1800,
    industry: 'Real estate', ownerId: 'tm_marcus', ageMonths: 16, renewalInDays: 65,
    contacts: [{ name: 'Tanya Sloan', title: 'Principal Broker' }],
  },
  {
    id: 'acc_halcyon', name: 'Halcyon Fitness', tier: 'starter', retainer: 2900,
    industry: 'Fitness', ownerId: 'tm_lena', ageMonths: 4, renewalInDays: 18,
    contacts: [{ name: 'Dev Anand', title: 'Head of Studio' }],
  },
  {
    id: 'acc_westgate', name: 'Westgate Cider', tier: 'prospect', retainer: 0,
    industry: 'Beverage', ownerId: 'tm_rowan', ageMonths: 1, renewalInDays: null,
    contacts: [{ name: 'Colin Frey', title: 'Founder' }],
  },
  {
    id: 'acc_orbit', name: 'Orbit Robotics', tier: 'prospect', retainer: 0,
    industry: 'Hardware', ownerId: 'tm_rowan', ageMonths: 1, renewalInDays: null,
    contacts: [{ name: 'Mika Sorenson', title: 'VP Marketing' }],
  },
  {
    id: 'acc_ferrow', name: 'Ferrow & Sons', tier: 'prospect', retainer: 0,
    industry: 'Manufacturing', ownerId: 'tm_rowan', ageMonths: 1, renewalInDays: null,
    contacts: [{ name: 'Angela Ferrow', title: 'Managing Director' }],
  },
  {
    id: 'acc_solstice', name: 'Solstice Travel', tier: 'prospect', retainer: 0,
    industry: 'Travel', ownerId: 'tm_rowan', ageMonths: 2, renewalInDays: null,
    contacts: [{ name: 'Bo Lindqvist', title: 'Growth Lead' }],
  },
];

type ThreadKind = 'feedback' | 'scope' | 'invoice' | 'launch' | 'reporting' | 'inbound' | 'escalation';

interface ThreadTemplate {
  channel: Channel;
  tags: string[];
  /**
   * Subject, opening message and first reply travel together. Drawing them from
   * separate pools is what makes generated data read as generated — a thread
   * titled "DNS cutover timing" whose body is about invoice approvals.
   */
  threads: Array<{ subject: string; inbound: string; reply: string }>;
  /** Later turns, where the specific topic matters less than the cadence. */
  followUpsIn: string[];
  followUpsOut: string[];
}

const GENERIC_IN = [
  'That works. One more thing while I have you — can you confirm who is doing the final proof?',
  'Perfect, thanks. I will get this in front of the team this afternoon.',
  'Slight complication: our legal review needs another two days. Does that break anything downstream?',
  'Sorry, one correction to what I sent — the second figure should be 18%, not 8%.',
  'Approved on our side. Go ahead.',
];

const GENERIC_OUT = [
  'Noted — I have updated the plan and flagged the dependency so nothing starts before it is signed off.',
  'That works. Nothing downstream breaks; the only thing it moves is the QA window, which had slack in it.',
  'Thanks for catching it — corrected and re-sent.',
  'Great. Kicking it off now and I will confirm once it is live.',
];

const TEMPLATES: Record<ThreadKind, ThreadTemplate> = {
  feedback: {
    channel: 'email',
    tags: ['creative'],
    threads: [
      {
        subject: 'Feedback on the homepage direction',
        inbound:
          'Team had a look this morning. Broadly we love it — two things: the hero headline reads long on mobile, and can we see a version with the product shot on the right?',
        reply:
          'Thanks — all clear. We will take the mobile headline down to six words and send a right-aligned variant by tomorrow afternoon.',
      },
      {
        subject: 'Round 2 comments — campaign visuals',
        inbound:
          'Comments are in the doc. Nothing structural, mostly tightening. One open question on the pricing panel — legal wants a footnote.',
        reply:
          'Got them. The footnote is easy; I will send legal the exact wording so they can approve it in place rather than in another round.',
      },
      {
        subject: 'Copy edits for the spring landing page',
        inbound:
          'This is close. Can you send the version without the gradient so I can put both in front of the exec team Thursday?',
        reply:
          'Both versions are attached, flat and gradient, sized for the deck. Devon can join Thursday if it helps to have someone answer design questions live.',
      },
      {
        subject: 'Notes on the brand deck',
        inbound:
          'Sorry for the slow turn on our side — notes attached. The photography direction is the piece we are least sure about.',
        reply:
          'Understood on the photography. Sending three alternate directions with costs so you can compare before we commit to a shoot.',
      },
      {
        subject: 'A few tweaks to the email template',
        inbound:
          'The template renders oddly in Outlook — the CTA drops below the fold. Everywhere else it looks great.',
        reply:
          'That is Outlook ignoring the flex fallback. Rebuilding that block as a table and re-testing across the top ten clients before it goes back to you.',
      },
      {
        subject: 'Homepage hero — one more pass',
        inbound:
          'Our CEO saw it and wants the customer logos higher. I know we moved them down for a reason — remind me what it was?',
        reply:
          'We moved them so the value proposition landed before the proof. Happy to move them up; sending both so you can see the trade-off rather than take my word for it.',
      },
    ],
    followUpsIn: GENERIC_IN,
    followUpsOut: GENERIC_OUT,
  },

  scope: {
    channel: 'email',
    tags: ['expansion'],
    threads: [
      {
        subject: 'Adding a second landing page to this sprint',
        inbound:
          'Quick one — is there room in this sprint for a second landing page, or does that push the launch?',
        reply:
          'Adding it moves the launch by about four working days unless we bring Sam in for a week. Costs for both options attached so you can pick.',
      },
      {
        subject: 'Can you quote the analytics build?',
        inbound:
          'Leadership approved the extra spend. What would it take to add the analytics work on top of the current retainer?',
        reply:
          'Sketching two options now — one inside the current retainer with a trade-off, one as an add-on. You will have both by Friday.',
      },
      {
        subject: 'Q3 scope — expanding paid social',
        inbound:
          'We have budget freed up this quarter and want to talk about expanding what you handle. Can you put together a scope and a number?',
        reply:
          'Yes. Sending a scope in phases so you can approve the first one without committing the whole programme.',
      },
      {
        subject: 'New microsite for the product launch',
        inbound:
          'We are opening two new markets in the fall and will need localised versions of everything. Worth a call?',
        reply:
          'Definitely worth a call. Before it, I will send a one-pager on what localisation actually costs at this scale — it is usually not the translation.',
      },
      {
        subject: 'Extra design support for the trade show',
        inbound:
          'Trade show is six weeks out and our internal designer just went on leave. Can you cover booth graphics and the handout?',
        reply:
          'We can cover both. Devon has the capacity if we start next week; anything later than that and the print deadline gets tight.',
      },
    ],
    followUpsIn: GENERIC_IN,
    followUpsOut: GENERIC_OUT,
  },

  invoice: {
    channel: 'email',
    tags: ['invoice'],
    threads: [
      {
        subject: 'Question on invoice #4417',
        inbound:
          'Finance flagged the last invoice — they have it as two line items but the PO covers one. Can you re-issue with the PO reference?',
        reply: 'No problem — re-issuing today with the PO on the header and a single consolidated line.',
      },
      {
        subject: 'PO number for this quarter',
        inbound:
          'Our AP system needs a new PO before the next invoice goes out. I will send the number once procurement generates it.',
        reply:
          'Understood. I will hold the invoice rather than send one that bounces, and nothing will chase you in the meantime.',
      },
      {
        subject: 'Invoice approval delayed on our side',
        inbound:
          'Heads up that approvals are slow this month with our controller out. Payment will land about a week late.',
        reply: 'Thanks for the warning — noted on our side so nothing chases you automatically.',
      },
      {
        subject: 'Billing address change',
        inbound:
          'We have moved our registered office. New details below — can you update them before the next run?',
        reply: 'Updated. The next invoice will carry the new address; nothing else changes.',
      },
    ],
    followUpsIn: GENERIC_IN,
    followUpsOut: GENERIC_OUT,
  },

  launch: {
    channel: 'email',
    tags: ['launch'],
    threads: [
      {
        subject: 'Go-live is moving up a week',
        inbound:
          'Our CEO wants this live before the board meeting, which moves us up a week. Is that survivable?',
        reply:
          'Survivable if we cut the blog migration to phase two. Sending a revised plan with what moves and what holds.',
      },
      {
        subject: 'DNS cutover timing',
        inbound:
          'IT can do the DNS change Tuesday morning but needs the records by end of day Monday.',
        reply:
          'Records are in the shared doc now. Sam will be online during the cutover window in case anything needs a hand.',
      },
      {
        subject: 'Final QA before we ship',
        inbound:
          'Found two issues in staging — the contact form is not sending, and the favicon is still the old mark.',
        reply:
          'Both fixed and redeployed to staging. Form submissions are landing in the test inbox — worth a check on your side.',
      },
      {
        subject: 'Launch checklist — Tuesday',
        inbound:
          'Can you send the runbook for Tuesday? I want to know who is doing what and who to call if something breaks.',
        reply:
          'Runbook attached, with owners per step and a rollback path. My mobile is at the top of it.',
      },
      {
        subject: 'Redirects from the old site',
        inbound:
          'Our SEO consultant is asking whether the old URLs are being redirected. Can you confirm?',
        reply:
          'Every indexed URL has a one-to-one redirect; the handful with no equivalent point at the closest section rather than the homepage. Full map attached.',
      },
    ],
    followUpsIn: GENERIC_IN,
    followUpsOut: GENERIC_OUT,
  },

  reporting: {
    channel: 'email',
    tags: ['reporting'],
    threads: [
      {
        subject: 'Numbers for the board deck',
        inbound:
          'Can you pull the month early this time? The board pack is due Friday and I need the paid numbers by Wednesday.',
        reply:
          'Wednesday works — Lena is pulling it now. You will get the summary plus the two charts you used last quarter.',
      },
      {
        subject: 'Attribution question from finance',
        inbound:
          'Finance is asking why the platform numbers do not match our CRM. Can you explain the gap in plain language?',
        reply:
          'The gap is attribution windows: the platform counts a conversion up to 28 days after a click, the CRM counts on close date. Written explanation attached.',
      },
      {
        subject: 'Monthly performance readout',
        inbound:
          'Great month. Can we get a one-pager version of this that I can forward without context?',
        reply:
          'One-pager attached — headline numbers, what drove them, and what we are changing next month. No jargon.',
      },
      {
        subject: 'Q2 results summary',
        inbound:
          'Before we plan Q3, can you send a straight read on what worked and what did not in Q2?',
        reply:
          'Sent. I have been blunt about the two channels that underperformed and what I would stop rather than optimise.',
      },
    ],
    followUpsIn: GENERIC_IN,
    followUpsOut: GENERIC_OUT,
  },

  inbound: {
    channel: 'form',
    tags: ['new-business'],
    threads: [
      {
        subject: 'Website redesign — request for proposal',
        inbound:
          'We have an RFP going out to three agencies and would like you on the list. Responses are due in two weeks — can you make that?',
        reply:
          'We can make that timeline. Sending a short questionnaire first so the response is about your situation rather than boilerplate.',
      },
      {
        subject: 'Referred by Northwind — looking for help',
        inbound:
          'Found you through Northwind. We are a 40-person company about to relaunch and our current site is five years old. Do you take on projects this size?',
        reply:
          'Yes, this is squarely the kind of work we take. Sending a few times for a call this week — happy to give a rough range on the call rather than making you wait for a document.',
      },
      {
        subject: 'Interested in your retainer model',
        inbound:
          'Our head of marketing left and we need an outside team to hold strategy for a couple of quarters. What does that look like with you?',
        reply:
          'That is a common shape for us. Sending two examples of how it has worked, including what we needed from the client side to make it work.',
      },
      {
        subject: 'Rebrand support for a Q4 launch',
        inbound:
          'Saw the Meridian work. We have budget approved for a rebrand and want to move before Q4. Are you taking new clients?',
        reply:
          'We have room for one more this quarter. The honest constraint is timing — a rebrand before Q4 is tight but possible if naming is already settled.',
      },
    ],
    followUpsIn: GENERIC_IN,
    followUpsOut: GENERIC_OUT,
  },

  escalation: {
    channel: 'email',
    tags: ['churn-risk', 'escalation'],
    threads: [
      {
        subject: 'Concerned about the pace this month',
        inbound:
          'Being direct: this month has felt slow. Two deadlines moved and I had to explain both to my CEO. I want to understand what changed.',
        reply:
          'That is a fair read and I am not going to defend it. Here is what happened, what I have changed, and what you should expect this month.',
      },
      {
        subject: 'We need to talk about the last deliverable',
        inbound:
          'What came back Friday was not what we briefed. I do not want to relitigate it over email — can we get on a call?',
        reply:
          'Booking a call for tomorrow. Before it, I will send the brief alongside what we delivered so we are looking at the same thing.',
      },
      {
        subject: 'Internal pressure on the contract',
        inbound:
          'Procurement is asking me to justify the retainer at renewal. I want to be able to point at outcomes, not activity.',
        reply:
          'Understood, and that is a reasonable ask. Putting together an outcomes read for the last two quarters — the numbers, not the task list.',
      },
    ],
    followUpsIn: [
      'Appreciate the straight answer. Let us see how this month goes.',
      'That helps. I still want the call, but I am less worried than I was on Friday.',
    ],
    followUpsOut: [
      'Understood. I will send a short written update every Friday until you tell me you no longer need it.',
      'Thank you for saying it directly rather than letting it sit — that is easier to fix.',
    ],
  },
};

interface DealSpec {
  accountId: string;
  name: string;
  value: number;
  retainer: number;
  source: string;
}

const OPEN_DEALS: Array<DealSpec & { stage: DealStage; stageAgeDays: number; closeInDays: number }> = [
  { accountId: 'acc_orbit', name: 'Orbit — brand + site', value: 96_000, retainer: 7500, source: 'Referral', stage: 'negotiation', stageAgeDays: 22, closeInDays: -4 },
  { accountId: 'acc_westgate', name: 'Westgate — packaging refresh', value: 41_000, retainer: 0, source: 'Inbound', stage: 'proposal', stageAgeDays: 6, closeInDays: 21 },
  { accountId: 'acc_ferrow', name: 'Ferrow — demand gen retainer', value: 132_000, retainer: 11_000, source: 'Outbound', stage: 'proposal', stageAgeDays: 17, closeInDays: 30 },
  { accountId: 'acc_solstice', name: 'Solstice — campaign sprint', value: 28_000, retainer: 0, source: 'Inbound', stage: 'qualified', stageAgeDays: 4, closeInDays: 45 },
  { accountId: 'acc_northwind', name: 'Northwind — analytics build', value: 54_000, retainer: 3500, source: 'Expansion', stage: 'proposal', stageAgeDays: 11, closeInDays: 16 },
  { accountId: 'acc_atlas', name: 'Atlas — Q3 paid social expansion', value: 66_000, retainer: 5500, source: 'Expansion', stage: 'negotiation', stageAgeDays: 5, closeInDays: 12 },
  { accountId: 'acc_meridian', name: 'Meridian — patient portal content', value: 72_000, retainer: 6000, source: 'Expansion', stage: 'qualified', stageAgeDays: 13, closeInDays: 52 },
  { accountId: 'acc_beacon', name: 'Beacon — practice microsites', value: 24_000, retainer: 0, source: 'Referral', stage: 'lead', stageAgeDays: 9, closeInDays: 60 },
  { accountId: 'acc_juniper', name: 'Juniper — showroom launch', value: 19_500, retainer: 0, source: 'Expansion', stage: 'lead', stageAgeDays: 3, closeInDays: 38 },
];

const CLOSED_DEALS: Array<DealSpec & { won: boolean; openedDaysAgo: number; cycleDays: number; lostReason: string }> = [
  { accountId: 'acc_lumen', name: 'Lumen — growth retainer', value: 192_000, retainer: 16_000, source: 'Referral', won: true, openedDaysAgo: 340, cycleDays: 44, lostReason: '' },
  { accountId: 'acc_beacon', name: 'Beacon — brand refresh', value: 58_000, retainer: 0, source: 'Inbound', won: true, openedDaysAgo: 232, cycleDays: 31, lostReason: '' },
  { accountId: 'acc_halcyon', name: 'Halcyon — launch campaign', value: 34_000, retainer: 2900, source: 'Inbound', won: true, openedDaysAgo: 141, cycleDays: 26, lostReason: '' },
  { accountId: 'acc_verdant', name: 'Verdant — comms retainer', value: 38_000, retainer: 3200, source: 'Referral', won: true, openedDaysAgo: 168, cycleDays: 35, lostReason: '' },
  { accountId: 'acc_atlas', name: 'Atlas — site rebuild', value: 88_000, retainer: 0, source: 'Outbound', won: true, openedDaysAgo: 276, cycleDays: 52, lostReason: '' },
  { accountId: 'acc_carraway', name: 'Carraway — packaging system', value: 46_000, retainer: 0, source: 'Expansion', won: true, openedDaysAgo: 119, cycleDays: 22, lostReason: '' },
  { accountId: 'acc_juniper', name: 'Juniper — ecommerce phase 2', value: 31_000, retainer: 0, source: 'Expansion', won: true, openedDaysAgo: 96, cycleDays: 18, lostReason: '' },
  { accountId: 'acc_northwind', name: 'Northwind — loyalty programme', value: 78_000, retainer: 0, source: 'Expansion', won: true, openedDaysAgo: 203, cycleDays: 41, lostReason: '' },
  { accountId: 'acc_pinepoint', name: 'Pinepoint — listing microsites', value: 16_000, retainer: 0, source: 'Inbound', won: true, openedDaysAgo: 74, cycleDays: 15, lostReason: '' },
  { accountId: 'acc_meridian', name: 'Meridian — brand system', value: 145_000, retainer: 0, source: 'Referral', won: true, openedDaysAgo: 312, cycleDays: 58, lostReason: '' },
  { accountId: 'acc_westgate', name: 'Westgate — full rebrand', value: 120_000, retainer: 0, source: 'Inbound', won: false, openedDaysAgo: 158, cycleDays: 39, lostReason: 'Went with a cheaper studio' },
  { accountId: 'acc_orbit', name: 'Orbit — content programme', value: 64_000, retainer: 5000, source: 'Outbound', won: false, openedDaysAgo: 187, cycleDays: 47, lostReason: 'Budget pulled after a hiring freeze' },
  { accountId: 'acc_ferrow', name: 'Ferrow — trade campaign', value: 52_000, retainer: 0, source: 'Outbound', won: false, openedDaysAgo: 129, cycleDays: 28, lostReason: 'No decision — went quiet at proposal' },
  { accountId: 'acc_solstice', name: 'Solstice — booking funnel', value: 44_000, retainer: 0, source: 'Inbound', won: false, openedDaysAgo: 102, cycleDays: 33, lostReason: 'Timeline slipped past their season' },
  { accountId: 'acc_tinderbox', name: 'Tinderbox — store expansion', value: 22_000, retainer: 0, source: 'Referral', won: false, openedDaysAgo: 88, cycleDays: 19, lostReason: 'Chose to hire in-house' },
  { accountId: 'acc_pinepoint', name: 'Pinepoint — agent recruiting', value: 27_000, retainer: 0, source: 'Outbound', won: false, openedDaysAgo: 221, cycleDays: 36, lostReason: 'Lost to incumbent agency' },
  { accountId: 'acc_carraway', name: 'Carraway — retail media', value: 61_000, retainer: 4500, source: 'Expansion', won: false, openedDaysAgo: 194, cycleDays: 43, lostReason: 'Deferred to next fiscal year' },
  { accountId: 'acc_halcyon', name: 'Halcyon — app content', value: 18_000, retainer: 0, source: 'Inbound', won: false, openedDaysAgo: 63, cycleDays: 24, lostReason: 'Scope was smaller than our minimum' },
];

/**
 * The rest of the losing tail. A shop that wins half of everything it quotes is
 * a shop that is not quoting enough, and a demo built on one would show a
 * weighted pipeline barely below its gross — which is exactly the number a
 * forecast exists to correct.
 */
const LOST_TAIL_NAMES = [
  'brand sprint', 'campaign concepting', 'site refresh', 'content retainer',
  'paid media pilot', 'naming project', 'design system', 'annual report',
  'product launch film', 'partner microsite', 'SEO programme', 'photography day',
];

const LOST_REASONS = [
  'No decision — went quiet after the proposal',
  'Budget cut before sign-off',
  'Chose a cheaper studio',
  'Timeline did not line up with our capacity',
  'Went in-house',
  'Lost to the incumbent',
];

const LOST_ACCOUNT_POOL = [
  'acc_westgate', 'acc_orbit', 'acc_ferrow', 'acc_solstice', 'acc_tinderbox',
  'acc_pinepoint', 'acc_verdant', 'acc_halcyon', 'acc_juniper', 'acc_beacon',
];

const STAGE_PATH: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation'];

export interface SeedResult {
  team: number;
  accounts: number;
  contacts: number;
  conversations: number;
  messages: number;
  deals: number;
  dealEvents: number;
}

export function seedDatabase(db: DatabaseSync, nowIso: string, seed = 20_260_812): SeedResult {
  const rng = makeRng(seed);
  const now = new Date(nowIso).getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  db.exec(`
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM deal_events;
    DELETE FROM deals;
    DELETE FROM contacts;
    DELETE FROM accounts;
    DELETE FROM team_members;
    DELETE FROM agency_settings;
  `);

  const insertMember = db.prepare(
    `INSERT INTO team_members (id, name, role, email, weekly_capacity_hours, active)
     VALUES (?, ?, ?, ?, ?, 1)`,
  );
  for (const m of TEAM) {
    const handle = m.name.split(' ')[0].toLowerCase();
    insertMember.run(m.id, m.name, m.role, `${handle}@halcyonstudio.test`, m.capacity);
  }

  const insertAccount = db.prepare(
    `INSERT INTO accounts (id, name, tier, retainer_monthly, industry, owner_id, started_at, renews_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertContact = db.prepare(
    `INSERT INTO contacts (id, account_id, name, email, title, is_primary) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const contactsByAccount = new Map<string, Array<{ id: string; name: string }>>();

  for (const spec of ACCOUNTS) {
    insertAccount.run(
      spec.id,
      spec.name,
      spec.tier,
      spec.retainer,
      spec.industry,
      spec.ownerId,
      iso(now - spec.ageMonths * 30 * DAY),
      spec.renewalInDays === null ? null : iso(now + spec.renewalInDays * DAY),
    );

    const domain = `${spec.name.toLowerCase().replace(/[^a-z]+/g, '')}.test`;
    const list: Array<{ id: string; name: string }> = [];
    spec.contacts.forEach((c, index) => {
      const id = `ct_${spec.id.slice(4)}_${index}`;
      const email = `${c.name.split(' ')[0].toLowerCase()}@${domain}`;
      insertContact.run(id, spec.id, c.name, email, c.title, index === 0 ? 1 : 0);
      list.push({ id, name: c.name });
    });
    contactsByAccount.set(spec.id, list);
  }

  // ---- Deals and their stage history -------------------------------------

  const insertDeal = db.prepare(
    `INSERT INTO deals (id, account_id, name, stage, value, retainer_monthly, owner_id,
                        opened_at, stage_entered_at, expected_close_at, closed_at, lost_reason, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDealEvent = db.prepare(
    `INSERT INTO deal_events (id, deal_id, from_stage, to_stage, at, actor_id) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  let dealCount = 0;
  let eventCount = 0;
  const ownerFor = (accountId: string) =>
    ACCOUNTS.find((a) => a.id === accountId)?.ownerId ?? 'tm_rowan';

  const logEvent = (dealId: string, from: DealStage | null, to: DealStage, at: string, actor: string) => {
    insertDealEvent.run(`de_${eventCount++}`, dealId, from, to, at, actor);
  };

  OPEN_DEALS.forEach((spec, index) => {
    const id = `dl_open_${index}`;
    const owner = ownerFor(spec.accountId);
    const stageIndex = STAGE_PATH.indexOf(spec.stage);
    const stageEnteredAt = nextBusinessInstant(iso(now - spec.stageAgeDays * DAY));

    // Walk the stages backwards from the current one so the history that
    // produced this deal is consistent with where it sits today.
    const entries: Array<{ stage: DealStage; at: string }> = [{ stage: spec.stage, at: stageEnteredAt }];
    for (let i = stageIndex - 1; i >= 0; i -= 1) {
      const previous = entries[0];
      const gapDays = rng.int(4, 16);
      entries.unshift({
        stage: STAGE_PATH[i],
        at: nextBusinessInstant(iso(new Date(previous.at).getTime() - gapDays * DAY)),
      });
    }

    insertDeal.run(
      id, spec.accountId, spec.name, spec.stage, spec.value, spec.retainer, owner,
      entries[0].at, stageEnteredAt, iso(now + spec.closeInDays * DAY), null, '', spec.source,
    );
    entries.forEach((entry, i) => {
      logEvent(id, i === 0 ? null : entries[i - 1].stage, entry.stage, entry.at, owner);
    });
    dealCount += 1;
  });

  const lostTail = LOST_TAIL_NAMES.map((label, i) => {
    const accountId = LOST_ACCOUNT_POOL[i % LOST_ACCOUNT_POOL.length];
    const accountName = ACCOUNTS.find((a) => a.id === accountId)?.name.split(' ')[0] ?? 'Client';
    return {
      accountId,
      name: `${accountName} — ${label}`,
      value: rng.int(3, 18) * 5000,
      retainer: 0,
      source: rng.pick(['Inbound', 'Outbound', 'Referral']),
      won: false,
      openedDaysAgo: rng.int(70, 330),
      cycleDays: rng.int(12, 50),
      lostReason: rng.pick(LOST_REASONS),
    };
  });

  [...CLOSED_DEALS, ...lostTail].forEach((spec, index) => {
    const id = `dl_closed_${index}`;
    const owner = ownerFor(spec.accountId);
    const openedAt = nextBusinessInstant(iso(now - spec.openedDaysAgo * DAY));
    const closedAt = nextBusinessInstant(iso(now - (spec.openedDaysAgo - spec.cycleDays) * DAY));
    const finalStage: DealStage = spec.won ? 'won' : 'lost';

    // A won deal walks the whole path. A lost one dies wherever it died, and
    // most die early — which is what makes a late-stage deal worth more in the
    // forecast than an early one. Both leave the trail the win-rate maths reads.
    const roll = rng();
    const reachedIndex = spec.won ? 3 : roll < 0.25 ? 0 : roll < 0.55 ? 1 : roll < 0.85 ? 2 : 3;
    const span = new Date(closedAt).getTime() - new Date(openedAt).getTime();
    const entries: Array<{ stage: DealStage; at: string }> = [];
    for (let i = 0; i <= reachedIndex; i += 1) {
      const fraction = i / (reachedIndex + 1);
      entries.push({
        stage: STAGE_PATH[i],
        at: nextBusinessInstant(iso(new Date(openedAt).getTime() + span * fraction)),
      });
    }

    insertDeal.run(
      id, spec.accountId, spec.name, finalStage, spec.value, spec.retainer, owner,
      openedAt, closedAt, closedAt, closedAt, spec.lostReason, spec.source,
    );
    entries.forEach((entry, i) => {
      logEvent(id, i === 0 ? null : entries[i - 1].stage, entry.stage, entry.at, owner);
    });
    logEvent(id, entries[entries.length - 1].stage, finalStage, closedAt, owner);
    dealCount += 1;
  });

  const openDealByAccount = new Map<string, string>();
  OPEN_DEALS.forEach((spec, index) => {
    if (!openDealByAccount.has(spec.accountId)) openDealByAccount.set(spec.accountId, `dl_open_${index}`);
  });

  // ---- Conversations ------------------------------------------------------

  const insertConversation = db.prepare(
    `INSERT INTO conversations (id, account_id, contact_id, subject, channel, state, assignee_id,
                                opened_at, last_message_at, last_inbound_at, last_outbound_at,
                                waiting_on, snoozed_until, closed_at, deal_id, tags, message_count, has_draft)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (id, conversation_id, direction, author_name, author_id, sent_at, body, is_draft)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let conversationCount = 0;
  let messageCount = 0;

  /**
   * Build one thread backwards from the moment of its last message. Working
   * backwards is what lets the seed place a thread at an exact amount of
   * *working* wait — the quantity the SLA maths cares about — instead of
   * guessing forwards and hoping it lands somewhere interesting.
   */
  function buildThread(options: {
    account: AccountSpec;
    kind: ThreadKind;
    /** 'us' leaves the client waiting on a reply; 'them' means the ball is theirs. */
    waitingOn: 'us' | 'them' | 'nobody';
    /** Working hours since the last message. */
    waitedHours: number;
    assigneeId: string | null;
    state: 'open' | 'snoozed' | 'closed';
    snoozeDays?: number;
    withDraft?: boolean;
    dealId?: string | null;
  }) {
    const { account, kind, waitingOn, waitedHours, assigneeId, state } = options;
    const template = TEMPLATES[kind];
    const contacts = contactsByAccount.get(account.id) ?? [];
    const contact = rng.pick(contacts);
    const id = `cv_${conversationCount++}`;

    const endsWithInbound = waitingOn === 'us';
    // Threads always open with the client writing in, so the parity of the
    // message count is decided by who spoke last.
    const total = endsWithInbound ? rng.pick([1, 3, 5]) : rng.pick([2, 4, 6]);

    const anchor = subtractBusinessHours(nowIso, waitedHours);
    const times: string[] = [anchor];
    for (let i = 1; i < total; i += 1) {
      // The last gap computed is the one between the client's opening message
      // and our first reply — the number the whole app is about. A working shop
      // answers most of those quickly and a few of them badly, so it is drawn
      // from a fast distribution with a real tail rather than a flat range.
      const isFirstReplyGap = i === total - 1;
      const gap = isFirstReplyGap
        ? rng.chance(0.78)
          ? rng() * 3 + 0.3
          : rng() * 20 + 5
        : rng.int(2, 26);
      times.unshift(subtractBusinessHours(times[0], gap));
    }

    const script = rng.pick(template.threads);
    const rows: Array<{ direction: 'inbound' | 'outbound'; at: string; body: string; authorId: string | null; authorName: string }> = [];
    const assigneeName = TEAM.find((m) => m.id === (assigneeId ?? account.ownerId))?.name ?? 'Rowan Ellis';
    for (let i = 0; i < total; i += 1) {
      const direction: 'inbound' | 'outbound' = i % 2 === 0 ? 'inbound' : 'outbound';
      // The opening exchange follows the script so the subject, the question
      // and the answer are about the same thing; later turns are small talk.
      const body =
        i === 0
          ? script.inbound
          : i === 1
            ? script.reply
            : direction === 'inbound'
              ? rng.pick(template.followUpsIn)
              : rng.pick(template.followUpsOut);
      rows.push({
        direction,
        at: times[i],
        body,
        authorId: direction === 'inbound' ? null : (assigneeId ?? account.ownerId),
        authorName: direction === 'inbound' ? contact.name : assigneeName,
      });
    }

    const openedAt = times[0];
    const lastAt = times[times.length - 1];
    const snoozedUntil =
      state === 'snoozed' && options.snoozeDays !== undefined
        ? iso(now + options.snoozeDays * DAY)
        : null;
    const closedAt = state === 'closed' ? addBusinessHours(lastAt, rng.int(1, 6)) : null;

    insertConversation.run(
      id,
      account.id,
      contact.id,
      script.subject,
      template.channel,
      state,
      assigneeId,
      openedAt,
      lastAt,
      null,
      null,
      state === 'closed' ? 'nobody' : waitingOn,
      snoozedUntil,
      closedAt,
      options.dealId ?? null,
      template.tags.join(','),
      0,
      0,
    );

    // Messages come after the conversation row they hang off, then the cached
    // columns above get rebuilt from them.
    for (const row of rows) {
      insertMessage.run(
        `msg_${messageCount++}`, id, row.direction, row.authorName, row.authorId, row.at, row.body, 0,
      );
    }

    if (options.withDraft) {
      insertMessage.run(
        `msg_${messageCount++}`,
        id,
        'outbound',
        assigneeName,
        assigneeId ?? account.ownerId,
        subtractBusinessHours(nowIso, Math.max(0.5, waitedHours / 2)),
        'Thanks for the detail here — writing up the options now and will send them over with costs.\n\n[unsent draft]',
        1,
      );
    }

    refreshConversation(db, id);
  }

  const RETAINED = ACCOUNTS.filter((a) => a.tier !== 'prospect');
  const PROSPECTS = ACCOUNTS.filter((a) => a.tier === 'prospect');
  const AM_IDS = TEAM.filter((m) => m.role !== 'principal').map((m) => m.id);

  // Closed history — the bulk of the corpus, and what the on-time-rate and
  // account-health trends are measured from.
  for (const account of RETAINED) {
    const volume = account.tier === 'flagship' ? rng.int(7, 9) : account.tier === 'growth' ? rng.int(5, 7) : rng.int(3, 4);
    for (let i = 0; i < volume; i += 1) {
      buildThread({
        account,
        kind: rng.pick(['feedback', 'launch', 'reporting', 'invoice', 'scope'] as ThreadKind[]),
        waitingOn: 'nobody',
        // Spread the archive across the trailing quarter of working hours.
        waitedHours: rng.int(20, 480),
        assigneeId: rng.chance(0.75) ? account.ownerId : rng.pick(AM_IDS),
        state: 'closed',
      });
    }
  }

  // Live threads where the ball is with the client — real work in flight, and
  // deliberately *not* counted against response time.
  for (const account of RETAINED) {
    for (let i = 0; i < rng.int(1, 3); i += 1) {
      buildThread({
        account,
        kind: rng.pick(['feedback', 'launch', 'reporting', 'scope'] as ThreadKind[]),
        waitingOn: 'them',
        waitedHours: rng.int(3, 90),
        assigneeId: account.ownerId,
        state: 'open',
      });
    }
  }

  // The queue: threads waiting on us, spread deliberately across the SLA
  // spectrum so the demo shows clear, due-soon and breached side by side.
  const queue: Array<{ account: AccountSpec; kind: ThreadKind; hours: number; assignee: string | null; draft?: boolean }> = [
    { account: ACCOUNTS[0], kind: 'escalation', hours: 26, assignee: 'tm_priya' },
    { account: ACCOUNTS[0], kind: 'feedback', hours: 1.5, assignee: 'tm_dev' },
    { account: ACCOUNTS[1], kind: 'launch', hours: 9, assignee: null },
    { account: ACCOUNTS[1], kind: 'reporting', hours: 1.75, assignee: 'tm_marcus', draft: true },
    { account: ACCOUNTS[2], kind: 'escalation', hours: 14, assignee: 'tm_priya' },
    { account: ACCOUNTS[2], kind: 'scope', hours: 3, assignee: null },
    { account: ACCOUNTS[3], kind: 'invoice', hours: 11, assignee: 'tm_marcus' },
    { account: ACCOUNTS[4], kind: 'scope', hours: 5, assignee: 'tm_priya', draft: true },
    { account: ACCOUNTS[4], kind: 'feedback', hours: 2, assignee: 'tm_dev' },
    { account: ACCOUNTS[5], kind: 'feedback', hours: 7, assignee: null },
    { account: ACCOUNTS[6], kind: 'reporting', hours: 19, assignee: 'tm_lena' },
    { account: ACCOUNTS[7], kind: 'feedback', hours: 6, assignee: 'tm_lena' },
    { account: ACCOUNTS[8], kind: 'invoice', hours: 22, assignee: null },
    { account: ACCOUNTS[9], kind: 'launch', hours: 4, assignee: 'tm_sam' },
    { account: ACCOUNTS[10], kind: 'scope', hours: 31, assignee: 'tm_lena', draft: true },
  ];

  for (const item of queue) {
    buildThread({
      account: item.account,
      kind: item.kind,
      waitingOn: 'us',
      waitedHours: item.hours,
      assigneeId: item.assignee,
      state: 'open',
      withDraft: item.draft,
      dealId: openDealByAccount.get(item.account.id) ?? null,
    });
  }

  // Prospects. Speed-to-lead is the tightest budget in the shop, so a couple of
  // these are deliberately sitting unowned — the single most expensive thing an
  // agency inbox does.
  const prospectQueue: Array<{ hours: number; assignee: string | null }> = [
    { hours: 3.5, assignee: null },
    { hours: 0.5, assignee: 'tm_rowan' },
    { hours: 7, assignee: null },
    { hours: 1.25, assignee: 'tm_rowan' },
  ];
  PROSPECTS.forEach((account, index) => {
    const item = prospectQueue[index % prospectQueue.length];
    buildThread({
      account,
      kind: 'inbound',
      waitingOn: 'us',
      waitedHours: item.hours,
      assigneeId: item.assignee,
      state: 'open',
      dealId: openDealByAccount.get(account.id) ?? null,
    });
    // Plus an older thread that is already a live conversation.
    buildThread({
      account,
      kind: 'scope',
      waitingOn: rng.chance(0.5) ? 'them' : 'us',
      waitedHours: rng.int(6, 40),
      assigneeId: 'tm_rowan',
      state: 'open',
      dealId: openDealByAccount.get(account.id) ?? null,
    });
  });

  // Parked threads, including one whose snooze has already lapsed — the inbox
  // is supposed to hand that one back rather than keep hiding it.
  buildThread({
    account: ACCOUNTS[3], kind: 'invoice', waitingOn: 'us', waitedHours: 40,
    assigneeId: 'tm_marcus', state: 'snoozed', snoozeDays: 4,
  });
  buildThread({
    account: ACCOUNTS[6], kind: 'scope', waitingOn: 'us', waitedHours: 52,
    assigneeId: 'tm_priya', state: 'snoozed', snoozeDays: 9,
  });
  buildThread({
    account: ACCOUNTS[5], kind: 'launch', waitingOn: 'us', waitedHours: 64,
    assigneeId: 'tm_marcus', state: 'snoozed', snoozeDays: -1,
  });

  const setSetting = db.prepare('INSERT OR REPLACE INTO agency_settings (key, value) VALUES (?, ?)');
  setSetting.run('agency_name', 'Halcyon Studio');
  setSetting.run('viewer_id', 'tm_priya');
  setSetting.run('seeded_at', nowIso);

  return {
    team: TEAM.length,
    accounts: ACCOUNTS.length,
    contacts: [...contactsByAccount.values()].reduce((n, list) => n + list.length, 0),
    conversations: conversationCount,
    messages: messageCount,
    deals: dealCount,
    dealEvents: eventCount,
  };
}

/**
 * Rebuild a conversation's cached columns from its messages.
 *
 * Every write path calls this instead of updating the columns inline. The
 * messages are the record; these columns exist only so the inbox can be sorted
 * and filtered in SQL without joining the whole corpus on every request.
 */
export function refreshConversation(db: DatabaseSync, conversationId: string): void {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE is_draft = 0)                                        AS sent,
         COUNT(*) FILTER (WHERE is_draft = 1)                                        AS drafts,
         MIN(sent_at) FILTER (WHERE is_draft = 0)                                    AS opened_at,
         MAX(sent_at) FILTER (WHERE is_draft = 0)                                    AS last_at,
         MAX(CASE WHEN direction = 'inbound'  AND is_draft = 0 THEN sent_at END)     AS last_inbound,
         MAX(CASE WHEN direction = 'outbound' AND is_draft = 0 THEN sent_at END)     AS last_outbound,
         -- When the client first wrote in. On an outreach thread this is not
         -- the first message, and the client's wait does not start before it.
         MIN(CASE WHEN direction = 'inbound'  AND is_draft = 0 THEN sent_at END)     AS first_inbound,
         -- The first reply that came after that. An outbound that predates it
         -- is us starting the conversation, which is outreach, not a response.
         MIN(CASE WHEN direction = 'outbound' AND is_draft = 0
                   AND sent_at > (SELECT MIN(sent_at) FROM messages
                                   WHERE conversation_id = ? AND direction = 'inbound' AND is_draft = 0)
                  THEN sent_at END)                                                  AS first_response
       FROM messages WHERE conversation_id = ?`,
    )
    .get(conversationId, conversationId) as {
    sent: number;
    drafts: number;
    opened_at: string | null;
    last_at: string | null;
    last_inbound: string | null;
    last_outbound: string | null;
    first_inbound: string | null;
    first_response: string | null;
  };

  if (!row || row.sent === 0) return;

  const state = (
    db.prepare('SELECT state FROM conversations WHERE id = ?').get(conversationId) as
      | { state: string }
      | undefined
  )?.state;

  // Who is blocked follows from who spoke last — it is never set by hand.
  let waitingOn: 'us' | 'them' | 'nobody';
  if (state === 'closed') waitingOn = 'nobody';
  else if (!row.last_inbound) waitingOn = 'them';
  else if (!row.last_outbound) waitingOn = 'us';
  else waitingOn = row.last_inbound > row.last_outbound ? 'us' : 'them';

  db.prepare(
    `UPDATE conversations
        SET opened_at = ?, last_message_at = ?, last_inbound_at = ?, last_outbound_at = ?,
            first_inbound_at = ?, first_response_at = ?, waiting_on = ?, message_count = ?, has_draft = ?
      WHERE id = ?`,
  ).run(
    row.opened_at,
    row.last_at,
    row.last_inbound,
    row.last_outbound,
    row.first_inbound,
    row.first_response,
    waitingOn,
    row.sent,
    row.drafts > 0 ? 1 : 0,
    conversationId,
  );
}
