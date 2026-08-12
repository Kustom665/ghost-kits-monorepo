import { getDb, DB_PATH } from '../src/db/client.ts';
import { seedDatabase } from '../src/db/seed.ts';

const now = process.env.CENTRALFLOW_NOW ?? new Date().toISOString();
const data = seedDatabase(getDb(), now);

console.log(`Seeded ${DB_PATH}`);
console.log(`  team:          ${data.team}`);
console.log(`  accounts:      ${data.accounts}`);
console.log(`  contacts:      ${data.contacts}`);
console.log(`  conversations: ${data.conversations}`);
console.log(`  messages:      ${data.messages}`);
console.log(`  deals:         ${data.deals}`);
console.log(`  deal events:   ${data.dealEvents}`);
