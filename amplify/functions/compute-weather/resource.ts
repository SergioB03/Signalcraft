import { defineFunction } from '@aws-amplify/backend';

/**
 * Recomputes a team's WeatherState whenever pings land.
 * Triggered by the Ping table's DynamoDB stream (wired in backend.ts).
 *
 * resourceGroupName: 'data' places this function in the data stack —
 * required because it both reads the data API and is triggered by the
 * data stack's table stream; splitting stacks would create a circular
 * dependency.
 */
export const computeWeather = defineFunction({
  name: 'compute-weather',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
