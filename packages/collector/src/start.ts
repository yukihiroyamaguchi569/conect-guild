import { setTimeout as delay } from 'node:timers/promises';
import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { createGhRunner } from './gh.ts';
import { runCollector } from './run.ts';
import { createCompanySessionsReader } from './sessionFiles.ts';
import { writeFileAtomic } from './write.ts';

const controller = new AbortController();
const readCompanySessions = createCompanySessionsReader(COLLECTOR_CONFIG.sessions);
process.once('SIGINT', () => {
  controller.abort();
});

async function sleepUnlessAborted(ms: number): Promise<void> {
  try {
    await delay(ms, undefined, { signal: controller.signal });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  }
}

process.exitCode = await runCollector(process.argv.slice(2), {
  now: () => new Date(),
  log: (line) => {
    console.log(line);
  },
  error: (line) => {
    console.error(line);
  },
  gh: createGhRunner(controller.signal),
  guestRepos: COLLECTOR_CONFIG.guests.repos,
  readSessions: () => readCompanySessions(controller.signal),
  writeSnapshot: (content) => writeFileAtomic(COLLECTOR_CONFIG.snapshotPath, content),
  writeStatus: (content) => writeFileAtomic(COLLECTOR_CONFIG.statusPath, content),
  sleep: sleepUnlessAborted,
  signal: controller.signal,
});
