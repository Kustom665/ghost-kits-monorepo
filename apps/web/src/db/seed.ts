import type { DatabaseSync } from 'node:sqlite';
import {
  DOC_CATALOG,
  MS_PER_DAY,
  type Client,
  type DocRequest,
  type EntityType,
  type Reminder,
  type Stage,
  type StageEvent,
  type Staff,
  type TaxReturn,
} from '@taxflow/core';

/**
 * Seed data for TaxFlow Radar.
 *
 * Rather than hand-placing returns into stages, we simulate each return's
 * actual walk through the pipeline — drawing a dwell time per stage, applying
 * review kickbacks, and stopping wherever the clock runs out. The current
 * pipeline, the event log, and every derived rate therefore agree with each
 * other, which is what makes the analytics worth looking at.
 */

/** Deterministic PRNG so the demo firm is identical on every seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Right-skewed draw between min and max. Tax cycle times have a long tail —
 * most returns clear a stage quickly and a few sit for weeks — so a uniform
 * draw would produce a pipeline that looks nothing like a real practice.
 */
function skewed(rng: () => number, min: number, max: number, k: number): number {
  return min + (max - min) * rng() ** k;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function weightedPick<T>(rng: () => number, items: Array<[T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

const FIRST_NAMES = [
  'James', 'Maria', 'Robert', 'Aisha', 'David', 'Elena', 'Marcus', 'Priya',
  'Thomas', 'Grace', 'Daniel', 'Nina', 'Samuel', 'Rosa', 'Andrew', 'Leah',
  'Christopher', 'Yuki', 'Patrick', 'Amara', 'Jonathan', 'Sofia', 'Nathan',
  'Claire', 'Victor', 'Hannah', 'Eric', 'Tanya', 'Paul', 'Miriam', 'Dean',
  'Olivia', 'Curtis', 'Farah', 'Wesley', 'Deborah', 'Alan', 'Rachel', 'Gregory',
  'Imani', 'Douglas', 'Beatriz', 'Trevor', 'Naomi', 'Kevin', 'Stella',
];

const LAST_NAMES = [
  'Okonkwo', 'Reyes', 'Lindqvist', 'Barrett', 'Nakamura', 'Duffy', 'Castellanos',
  'Whitfield', 'Ahmadi', 'Brennan', 'Sorensen', 'Petrov', 'Kaminski', 'Ferreira',
  'Delgado', 'Kowalczyk', 'Mbeki', 'Toussaint', 'Vasquez', 'Hollingsworth',
  'Ibrahim', 'Fontaine', 'Zieliński', 'Ramaswamy', 'Blackwood', 'Novotny',
  'Achebe', 'Salvatore', 'Lindgren', 'Marchetti', 'Baptiste', 'Ng',
  'Oyelaran', 'Strand', 'Villanueva', 'Haddad', 'Mensah', 'Kirkpatrick',
];

const BUSINESS_PREFIX = [
  'Ironwood', 'Cedar Ridge', 'Northgate', 'Blue Harbor', 'Summit Line',
  'Kestrel', 'Foundry', 'Old Mill', 'Riverbend', 'Copperfield', 'Lantern',
  'Granite Bay', 'Westvale', 'Harlow', 'Thistle', 'Beacon Hill', 'Drayton',
  'Meridian', 'Sable Creek', 'Pinnacle', 'Auburn Way', 'Tidewater', 'Halcyon',
  'Stonebridge', 'Fairhaven', 'Larkspur', 'Redgate', 'Windrow', 'Quarry Lane',
];

const BUSINESS_SUFFIX = [
  'Construction', 'Dental Group', 'Logistics', 'Consulting', 'Properties',
  'Medical Associates', 'Brewing Co', 'Landscaping', 'Auto Group', 'Staffing',
  'Veterinary', 'Roofing', 'Design Studio', 'Fabrication', 'Physical Therapy',
  'Restaurant Group', 'Electrical', 'Trucking', 'Orthodontics', 'Machining',
  'Family Farms', 'Insurance Agency', 'Plumbing', 'Cabinetry', 'Chiropractic',
];

const STAFF_SEED: Array<Omit<Staff, 'id'>> = [
  { name: 'Dana Whitfield', role: 'reviewer', weeklyCapacityHours: 45, active: true },
  { name: 'Priya Ramaswamy', role: 'reviewer', weeklyCapacityHours: 42, active: true },
  { name: 'Curtis Blackwood', role: 'reviewer', weeklyCapacityHours: 38, active: true },
  { name: 'Naomi Fontaine', role: 'reviewer', weeklyCapacityHours: 30, active: true },
  { name: 'Marcus Delgado', role: 'partner', weeklyCapacityHours: 25, active: true },
  { name: 'Helen Sorensen', role: 'partner', weeklyCapacityHours: 22, active: true },
  { name: 'Trevor Ng', role: 'preparer', weeklyCapacityHours: 50, active: true },
  { name: 'Amara Mensah', role: 'preparer', weeklyCapacityHours: 48, active: true },
  { name: 'Jonah Kaminski', role: 'preparer', weeklyCapacityHours: 46, active: true },
  { name: 'Sofia Marchetti', role: 'preparer', weeklyCapacityHours: 44, active: true },
  { name: 'Wesley Strand', role: 'preparer', weeklyCapacityHours: 42, active: true },
  { name: 'Leah Haddad', role: 'preparer', weeklyCapacityHours: 40, active: true },
  { name: 'Imani Oyelaran', role: 'preparer', weeklyCapacityHours: 36, active: true },
  { name: 'Beatriz Villanueva', role: 'admin', weeklyCapacityHours: 40, active: true },
  { name: 'Owen Duffy', role: 'admin', weeklyCapacityHours: 35, active: true },
];

/** Statutory filing dates, original and extended, as [month, day] (1-indexed). */
const DEADLINES: Record<EntityType, { original: [number, number]; extended: [number, number] }> = {
  '1065': { original: [3, 15], extended: [9, 15] },
  '1120S': { original: [3, 15], extended: [9, 15] },
  '1040': { original: [4, 15], extended: [10, 15] },
  '1120': { original: [4, 15], extended: [10, 15] },
  '1041': { original: [4, 15], extended: [9, 30] },
  '990': { original: [5, 15], extended: [11, 15] },
};

/**
 * The next real filing date this return is being driven toward.
 *
 * We skip any deadline less than `minDays` out, because a firm working a
 * deadline that is already on top of them has a different problem than the one
 * this app is for.
 */
export function nextDeadline(entityType: EntityType, now: Date, minDays = 18): string {
  const { original, extended } = DEADLINES[entityType];
  const candidates: Date[] = [];
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const year = now.getUTCFullYear() + yearOffset;
    for (const [month, day] of [original, extended]) {
      candidates.push(new Date(Date.UTC(year, month - 1, day, 23, 59, 0)));
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const cutoff = now.getTime() + minDays * MS_PER_DAY;
  const chosen = candidates.find((d) => d.getTime() >= cutoff) ?? candidates[candidates.length - 1];
  return chosen.toISOString();
}

/** Dwell-time shape per stage: [minDays, maxDays, skew]. */
const DWELL: Record<string, [number, number, number]> = {
  intake: [0.3, 2.5, 1.5],
  docs_pending: [2, 66, 2.6],
  ready_for_prep: [0.5, 12, 2.2],
  in_prep: [1, 14, 2.0],
  review_queue: [1, 27, 1.7],
  in_review: [0.5, 8, 1.8],
  partner_signoff: [0.3, 9, 2.0],
  client_signature: [1, 21, 2.0],
  efile: [0.2, 3, 1.5],
};

const HAPPY_PATH: Stage[] = [
  'intake',
  'docs_pending',
  'ready_for_prep',
  'in_prep',
  'review_queue',
  'in_review',
  'partner_signoff',
  'client_signature',
  'efile',
  'accepted',
];

export interface SeedData {
  staff: Staff[];
  clients: Client[];
  returns: TaxReturn[];
  events: StageEvent[];
  docRequests: DocRequest[];
  reminders: Reminder[];
}

export function generateFirm(nowIso: string, seed = 20260415): SeedData {
  const rng = mulberry32(seed);
  const now = new Date(nowIso);
  const nowMs = now.getTime();

  const staff: Staff[] = STAFF_SEED.map((s, i) => ({ ...s, id: `stf_${String(i + 1).padStart(3, '0')}` }));
  const preparers = staff.filter((s) => s.role === 'preparer');
  const reviewers = staff.filter((s) => s.role === 'reviewer');
  const partners = staff.filter((s) => s.role === 'partner');
  const admins = staff.filter((s) => s.role === 'admin');

  // Dana carries far more review than anyone else. This is the single most
  // common shape in a real firm: everything routes to the trusted senior.
  const reviewerWeights: Array<[Staff, number]> = reviewers.map((r) => [
    r,
    r.name.startsWith('Dana') ? 46 : r.name.startsWith('Naomi') ? 12 : 21,
  ]);

  const clients: Client[] = [];
  const returns: TaxReturn[] = [];
  const events: StageEvent[] = [];
  const docRequests: DocRequest[] = [];
  const reminders: Reminder[] = [];

  const TOTAL = 245;
  const usedNames = new Set<string>();

  for (let i = 0; i < TOTAL; i++) {
    const entityType = weightedPick<EntityType>(rng, [
      ['1040', 52],
      ['1120S', 18],
      ['1065', 12],
      ['1120', 7],
      ['1041', 6],
      ['990', 5],
    ]);

    const isBusiness = entityType !== '1040' && entityType !== '1041';
    let name: string;
    let attempts = 0;
    do {
      name = isBusiness
        ? `${pick(rng, BUSINESS_PREFIX)} ${pick(rng, BUSINESS_SUFFIX)}`
        : entityType === '1041'
          ? `${pick(rng, LAST_NAMES)} Family Trust`
          : `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      attempts++;
    } while (usedNames.has(name) && attempts < 25);
    usedNames.add(name);

    const clientId = `cli_${String(i + 1).padStart(4, '0')}`;
    const responsiveness = Math.round(skewed(rng, 8, 100, 0.75));
    clients.push({
      id: clientId,
      name,
      entityType,
      responsivenessScore: responsiveness,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`,
      phone: `(${200 + Math.floor(rng() * 700)}) ${100 + Math.floor(rng() * 899)}-${String(Math.floor(rng() * 10000)).padStart(4, '0')}`,
    });

    const complexity = weightedPick<'simple' | 'moderate' | 'complex'>(rng, [
      ['simple', isBusiness ? 15 : 42],
      ['moderate', 45],
      ['complex', isBusiness ? 40 : 13],
    ]);
    const estimatedHours = round1(
      complexity === 'simple'
        ? skewed(rng, 1.5, 5, 1.4)
        : complexity === 'moderate'
          ? skewed(rng, 4, 14, 1.5)
          : skewed(rng, 10, 42, 1.7),
    );
    const priorYearFee = Math.round(estimatedHours * skewed(rng, 140, 320, 1.3));

    const returnId = `ret_${String(i + 1).padStart(4, '0')}`;
    const preparer = pick(rng, preparers);
    const reviewer = weightedPick(rng, reviewerWeights);
    const partner = pick(rng, partners);
    const admin = pick(rng, admins);

    // Engagements opened over the last ~14 weeks, weighted toward recent.
    const ageDays = skewed(rng, 1, 98, 1.35);
    let cursorMs = nowMs - ageDays * MS_PER_DAY;
    const createdAt = new Date(cursorMs).toISOString();

    // ---- Walk the pipeline until the clock catches up to "now" ------------
    const walk: Array<{ from: Stage | null; to: Stage; at: number; actor: string | null; rework: boolean }> = [];
    let stageIdx = 0;
    let current: Stage = 'intake';
    let previous: Stage | null = null;
    let reworkCount = 0;
    let finished = false;

    walk.push({ from: null, to: 'intake', at: cursorMs, actor: admin.id, rework: false });

    for (let guard = 0; guard < 40; guard++) {
      const [min, max, k] = DWELL[current];
      // Unresponsive clients drag out the stages they control.
      const clientDrag =
        (current === 'docs_pending' || current === 'client_signature') && responsiveness < 45
          ? 1.7
          : 1;
      // An over-subscribed reviewer's queue physically moves slower. Without
      // this the person-level view would be cosmetic — everyone would clear
      // work at the same rate no matter how much of it they were handed.
      const reviewerDrag = current === 'review_queue' ? reviewerBacklogDrag(reviewer) : 1;
      const dwellMs = skewed(rng, min, max, k) * clientDrag * reviewerDrag * MS_PER_DAY;
      const exitMs = cursorMs + dwellMs;

      if (exitMs > nowMs) break; // still sitting in `current` right now

      // A reviewer kicks work back to the preparer ~22% of the time. Each
      // kickback costs another full trip through the review queue.
      if (current === 'in_review' && reworkCount < 2 && rng() < 0.22) {
        walk.push({ from: 'in_review', to: 'in_prep', at: exitMs, actor: reviewer.id, rework: true });
        previous = current;
        current = 'in_prep';
        stageIdx = HAPPY_PATH.indexOf('in_prep');
        cursorMs = exitMs;
        reworkCount++;
        continue;
      }

      const next = HAPPY_PATH[stageIdx + 1];
      const actor =
        next === 'ready_for_prep' || next === 'docs_pending'
          ? admin.id
          : next === 'review_queue'
            ? preparer.id
            : next === 'in_review' || next === 'partner_signoff'
              ? reviewer.id
              : next === 'client_signature'
                ? partner.id
                : preparer.id;

      walk.push({ from: current, to: next, at: exitMs, actor, rework: false });
      previous = current;
      stageIdx++;
      current = next;
      cursorMs = exitMs;

      if (current === 'accepted') {
        finished = true;
        break;
      }
    }
    void previous;

    // A slice of the open population went on extension.
    let extended = false;
    if (!finished && rng() < 0.06 && current !== 'accepted') {
      const at = Math.min(nowMs - rng() * 9 * MS_PER_DAY, cursorMs + 2 * MS_PER_DAY);
      if (at > cursorMs) {
        walk.push({ from: current, to: 'extended', at, actor: partner.id, rework: false });
        current = 'extended';
        cursorMs = at;
        extended = true;
      }
    }

    const stageEnteredAt = new Date(walk[walk.length - 1].at).toISOString();

    for (let e = 0; e < walk.length; e++) {
      const w = walk[e];
      events.push({
        id: `evt_${returnId}_${e}`,
        returnId,
        fromStage: w.from,
        toStage: w.to,
        at: new Date(w.at).toISOString(),
        actorId: w.actor,
        isRework: w.rework,
        note: w.rework ? pick(rng, REWORK_NOTES) : '',
      });
    }

    returns.push({
      id: returnId,
      clientId,
      taxYear: now.getUTCFullYear() - 1,
      entityType,
      stage: current,
      stageEnteredAt,
      createdAt,
      dueDate: nextDeadline(entityType, now),
      preparerId: preparer.id,
      reviewerId: reviewer.id,
      partnerId: partner.id,
      estimatedHours,
      complexity,
      priorYearFee,
      extended,
      notes: '',
    });

    // ---- Document requests -------------------------------------------------
    const catalog = DOC_CATALOG[entityType];
    const optionalCount =
      complexity === 'simple' ? 2 : complexity === 'moderate' ? 5 : 9;
    const optional = catalog.filter((d) => !d.alwaysAsk);
    const chosen = [
      ...catalog.filter((d) => d.alwaysAsk),
      ...shuffle(rng, optional).slice(0, Math.min(optionalCount, optional.length)),
    ];

    const requestedAt = new Date(walk[0].at + 0.4 * MS_PER_DAY).toISOString();
    const docsClosedAt = walk.find((w) => w.to === 'ready_for_prep')?.at ?? null;
    const stillCollecting = current === 'docs_pending' || current === 'intake';

    // Which items are still outstanding, if any.
    const pendingCount = stillCollecting
      ? current === 'intake'
        ? chosen.length
        : Math.max(1, Math.round(skewed(rng, 1, Math.max(2, chosen.length * 0.8), 1.6)))
      : 0;
    const order = shuffle(rng, chosen.map((_, idx) => idx));
    const pendingIdx = new Set(order.slice(0, pendingCount));

    chosen.forEach((doc, idx) => {
      const isPending = pendingIdx.has(idx);
      // Clients front-load: a burst of documents arrives soon after the ask,
      // then they go quiet. Spreading receipts uniformly across the wait would
      // make a client who vanished in June look like they answered last week.
      const reqMs = new Date(requestedAt).getTime();
      const receivedMs = docsClosedAt
        ? walk[0].at + (docsClosedAt - walk[0].at) * (0.25 + rng() * 0.7)
        : reqMs + (nowMs - reqMs) * skewed(rng, 0.02, 0.95, 2.2);

      docRequests.push({
        id: `doc_${returnId}_${idx}`,
        returnId,
        docType: doc.docType,
        status: isPending ? 'pending' : 'received',
        rolledForward: !doc.alwaysAsk,
        requestedAt,
        receivedAt: isPending ? null : new Date(Math.min(receivedMs, nowMs)).toISOString(),
        remindersSent: 0,
        lastReminderAt: null,
      });
    });

    // ---- Reminders ---------------------------------------------------------
    // Deliberately sparse. Most firms nudge once and give up, which is exactly
    // the gap the chase worklist is built to expose.
    if (pendingCount > 0) {
      const waitingDays = (nowMs - new Date(requestedAt).getTime()) / MS_PER_DAY;
      const nudgeChance = Math.min(0.72, waitingDays / 40);
      const count = rng() < nudgeChance ? 1 + (rng() < 0.28 ? 1 : 0) : 0;
      for (let n = 0; n < count; n++) {
        const sentAt = new Date(
          nowMs - skewed(rng, 1, Math.max(2, waitingDays * 0.7), 1.2) * MS_PER_DAY,
        ).toISOString();
        reminders.push({
          id: `rem_${returnId}_${n}`,
          returnId,
          channel: weightedPick(rng, [
            ['email' as const, 70],
            ['portal' as const, 18],
            ['call' as const, 8],
            ['sms' as const, 4],
          ]),
          sentAt,
          sentById: admin.id,
          body: 'Automated organizer follow-up.',
        });
      }
      if (count > 0) {
        const last = reminders[reminders.length - 1];
        for (const dr of docRequests) {
          if (dr.returnId === returnId && dr.status === 'pending') {
            dr.remindersSent = count;
            dr.lastReminderAt = last.sentAt;
          }
        }
      }
    }
  }

  return { staff, clients, returns, events, docRequests, reminders };
}

/** How much slower a given reviewer's queue moves, relative to the team. */
function reviewerBacklogDrag(reviewer: Staff): number {
  if (reviewer.name.startsWith('Dana')) return 2.1;
  if (reviewer.name.startsWith('Naomi')) return 1.2;
  return 0.65;
}

const REWORK_NOTES = [
  'Depreciation schedule did not tie to the fixed asset roll-forward.',
  'State apportionment missing; return only reflects the home state.',
  'Basis limitation not applied to the passthrough loss.',
  'Missing supporting detail for the meals and entertainment add-back.',
  'Estimated payments posted to the wrong tax year.',
  'K-1 footnotes not carried to the individual return.',
  'Balance sheet out of balance by an immaterial but unexplained amount.',
];

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Wipe and repopulate every table. Destructive by design. */
export function seedDatabase(db: DatabaseSync, nowIso: string): SeedData {
  const data = generateFirm(nowIso);

  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of ['reminders', 'doc_requests', 'stage_events', 'returns', 'clients', 'staff', 'firm_settings']) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec('PRAGMA foreign_keys = ON');

  db.exec('BEGIN');
  try {
    const insertStaff = db.prepare(
      'INSERT INTO staff (id, name, role, weekly_capacity_hours, active) VALUES (?, ?, ?, ?, ?)',
    );
    for (const s of data.staff) {
      insertStaff.run(s.id, s.name, s.role, s.weeklyCapacityHours, s.active ? 1 : 0);
    }

    const insertClient = db.prepare(
      'INSERT INTO clients (id, name, entity_type, responsiveness_score, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const c of data.clients) {
      insertClient.run(c.id, c.name, c.entityType, c.responsivenessScore, c.email, c.phone);
    }

    const insertReturn = db.prepare(`
      INSERT INTO returns (id, client_id, tax_year, entity_type, stage, stage_entered_at, created_at,
                           due_date, preparer_id, reviewer_id, partner_id, estimated_hours, complexity,
                           prior_year_fee, extended, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of data.returns) {
      insertReturn.run(
        r.id, r.clientId, r.taxYear, r.entityType, r.stage, r.stageEnteredAt, r.createdAt,
        r.dueDate, r.preparerId, r.reviewerId, r.partnerId, r.estimatedHours, r.complexity,
        r.priorYearFee, r.extended ? 1 : 0, r.notes,
      );
    }

    const insertEvent = db.prepare(
      'INSERT INTO stage_events (id, return_id, from_stage, to_stage, at, actor_id, is_rework, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const e of data.events) {
      insertEvent.run(e.id, e.returnId, e.fromStage, e.toStage, e.at, e.actorId, e.isRework ? 1 : 0, e.note);
    }

    const insertDoc = db.prepare(`
      INSERT INTO doc_requests (id, return_id, doc_type, status, rolled_forward, requested_at,
                                received_at, reminders_sent, last_reminder_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of data.docRequests) {
      insertDoc.run(
        d.id, d.returnId, d.docType, d.status, d.rolledForward ? 1 : 0, d.requestedAt,
        d.receivedAt, d.remindersSent, d.lastReminderAt,
      );
    }

    const insertReminder = db.prepare(
      'INSERT INTO reminders (id, return_id, channel, sent_at, sent_by_id, body) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const r of data.reminders) {
      insertReminder.run(r.id, r.returnId, r.channel, r.sentAt, r.sentById, r.body);
    }

    db.prepare('INSERT INTO firm_settings (key, value) VALUES (?, ?)').run('firm_name', 'Delgado & Sorensen CPAs');
    db.prepare('INSERT INTO firm_settings (key, value) VALUES (?, ?)').run('seeded_at', nowIso);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return data;
}
