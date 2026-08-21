import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import { Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { computeWeather } from './functions/compute-weather/resource';

const backend = defineBackend({
  auth,
  data,
  computeWeather,
});

// --- Weather trigger: Ping table stream → compute-weather Lambda ---------
// Amplify-managed tables have DynamoDB streams enabled; the mapping below
// delivers every Ping insert to the Lambda, which recomputes WeatherState
// through an AppSync mutation (never a direct table write — subscriptions
// only fire on mutations that go through AppSync).
const pingTable = backend.data.resources.tables['Ping'];

const streamPolicy = new Policy(Stack.of(pingTable), 'ComputeWeatherStreamPolicy', {
  statements: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:DescribeStream',
        'dynamodb:GetRecords',
        'dynamodb:GetShardIterator',
        'dynamodb:ListStreams',
      ],
      resources: ['*'],
    }),
  ],
});
backend.computeWeather.resources.lambda.role?.attachInlinePolicy(streamPolicy);

const mapping = new EventSourceMapping(Stack.of(pingTable), 'ComputeWeatherStreamMapping', {
  target: backend.computeWeather.resources.lambda,
  eventSourceArn: pingTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
  batchSize: 25,
});
mapping.node.addDependency(streamPolicy);

// --- Ping TTL: rows self-delete ~24h after creation ----------------------
// Lazy deletion (can lag hours), so the Lambda still filters by createdAt.
// TTL is cleanup, not correctness.
backend.data.resources.cfnResources.amplifyDynamoDbTables['Ping'].timeToLiveAttribute = {
  attributeName: 'expiresAt',
  enabled: true,
};
