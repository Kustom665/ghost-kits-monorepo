import { getDb, DB_PATH } from '../src/db/client.ts';
import { seedDatabase } from '../src/db/seed.ts';

const now = process.env.TAXFLOW_NOW ?? new Date().toISOString();
const data = seedDatabase(getDb(), now);

console.log(`Seeded ${DB_PATH}`);
console.log(`  staff:     ${data.staff.length}`);
console.log(`  clients:   ${data.clients.length}`);
console.log(`  returns:   ${data.returns.length}`);
console.log(`  events:    ${data.events.length}`);
console.log(`  docs:      ${data.docRequests.length}`);
console.log(`  reminders: ${data.reminders.length}`);
