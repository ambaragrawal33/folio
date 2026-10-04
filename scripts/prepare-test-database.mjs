import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const server = await MongoMemoryReplSet.create({
  binary: { version: '8.2.12' },
  replSet: { count: 1 },
});
await server.stop();
console.log(
  'Isolated MongoDB 8.2.12 test binary downloaded, started as a replica set and stopped PASS',
);
