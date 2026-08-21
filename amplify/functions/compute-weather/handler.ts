import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/compute-weather';
import type { Schema } from '../../data/resource';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type Scene = NonNullable<Schema['WeatherState']['type']['scene']>;

// Minimal shape of a DynamoDB stream record — typed by hand to avoid an
// @types/aws-lambda dependency for the two fields we actually read.
type StreamRecord = {
  eventName?: string;
  dynamodb?: { NewImage?: Record<string, { S?: string; N?: string }> };
};

export const handler = async (event: { Records?: StreamRecord[] }) => {
  const teamIds = new Set<string>();
  for (const record of event.Records ?? []) {
    if (record.eventName !== 'INSERT') continue;
    const teamId = record.dynamodb?.NewImage?.teamId?.S;
    if (teamId) teamIds.add(teamId);
  }
  for (const teamId of teamIds) {
    await recomputeWeather(teamId);
  }
  return { batchItemFailures: [] };
};

async function recomputeWeather(teamId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const scores: number[] = [];
  let nextToken: string | null | undefined;
  do {
    const { data, nextToken: nt, errors } = await client.models.Ping.list({
      filter: { teamId: { eq: teamId }, createdAt: { gt: cutoff } },
      limit: 1000,
      nextToken,
    });
    if (errors) throw new Error(`Ping.list failed: ${JSON.stringify(errors)}`);
    scores.push(...data.map((p) => p.score));
    nextToken = nt;
  } while (nextToken);

  const n = scores.length;
  const avg = n > 0 ? scores.reduce((sum, s) => sum + s, 0) / n : 0;
  const scene = pickScene(n, avg);

  // Anonymity floor: below 5 pings, publish the count but not the average —
  // a 2-ping average is close to an individual answer.
  const state = {
    id: teamId,
    teamId,
    scene,
    score: scene === 'gathering' ? null : Math.round(avg * 100) / 100,
    pingCount: n,
  };

  const updated = await client.models.WeatherState.update(state);
  if (updated.errors) {
    const created = await client.models.WeatherState.create(state);
    if (created.errors) {
      throw new Error(`WeatherState upsert failed: ${JSON.stringify(created.errors)}`);
    }
  }
  console.log(`weather[${teamId}]: ${scene} (n=${n}, avg=${avg.toFixed(2)})`);
}

function pickScene(n: number, avg: number): Scene {
  if (n < 5) return 'gathering';
  if (avg >= 4.2) return 'clear';
  if (avg >= 3.4) return 'breezy';
  if (avg >= 2.6) return 'overcast';
  if (avg >= 1.8) return 'rough';
  return 'storm';
}
