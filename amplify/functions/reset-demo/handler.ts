import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/reset-demo';
import type { Schema } from '../../data/resource';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type Scope = 'receipts' | 'all' | 'reseed';

const SEEDS: Array<{ score: number; note?: string }> = [
  { score: 4, note: 'shipped the migration, feeling good' },
  { score: 3 },
  { score: 4, note: 'nice quiet focus day' },
  { score: 2, note: 'meetings ate the whole morning again' },
  { score: 5, note: 'pairing session actually fixed it!' },
  { score: 3, note: 'fine. tired. friday-shaped.' },
  { score: 4 },
];

/**
 * receipts — forget who has pinged today, so demo accounts can ping again.
 *            The river itself is untouched.
 * all      — receipts + every ping, report, and report request. Ping deletes
 *            flow through the table stream, so the weather recomputes itself
 *            back to "gathering".
 * reseed   — `all`, then a fresh day of demo pings past the anonymity floor.
 */
export const handler: Schema['resetDemoDay']['functionHandler'] = async (event) => {
  const { teamId } = event.arguments;
  const scope = (event.arguments.scope ?? 'receipts') as Scope;
  const counts = { receipts: 0, pings: 0, reports: 0, requests: 0, seeded: 0 };
  const byTeam = { filter: { teamId: { eq: teamId } }, limit: 1000 };

  counts.receipts = await deleteAll(
    (nextToken) => client.models.PingReceipt.list({ ...byTeam, nextToken }),
    (id) => client.models.PingReceipt.delete({ id }),
  );

  if (scope === 'all' || scope === 'reseed') {
    counts.pings = await deleteAll(
      (nextToken) => client.models.Ping.list({ ...byTeam, nextToken }),
      (id) => client.models.Ping.delete({ id }),
    );
    counts.reports = await deleteAll(
      (nextToken) => client.models.Report.list({ ...byTeam, nextToken }),
      (id) => client.models.Report.delete({ id }),
    );
    counts.requests = await deleteAll(
      (nextToken) => client.models.ReportRequest.list({ ...byTeam, nextToken }),
      (id) => client.models.ReportRequest.delete({ id }),
    );
  }

  if (scope === 'reseed') {
    for (const seed of SEEDS) {
      const { errors } = await client.models.Ping.create({
        teamId,
        score: seed.score,
        note: seed.note,
        expiresAt: Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60,
      });
      if (!errors) counts.seeded += 1;
    }
  }

  console.log(`resetDemoDay[${teamId}] scope=${scope}`, counts);
  return counts;
};

async function deleteAll(
  list: (nextToken?: string | null) => Promise<{
    data: Array<{ id: string }>;
    nextToken?: string | null;
    errors?: unknown;
  }>,
  remove: (id: string) => Promise<unknown>,
): Promise<number> {
  let deleted = 0;
  let nextToken: string | null | undefined;
  do {
    const page = await list(nextToken);
    if (page.errors) throw new Error(`list failed: ${JSON.stringify(page.errors)}`);
    for (const item of page.data) {
      await remove(item.id);
      deleted += 1;
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return deleted;
}
