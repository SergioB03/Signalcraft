import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Code,
  EventSourceMapping,
  Function as LambdaFunction,
  Runtime,
  StartingPosition,
} from 'aws-cdk-lib/aws-lambda';
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

// --- The Python report Lambda (deliberate learning slice, CLAUDE.md §2) --
// ReportRequest stream → Python 3.12 → aggregates pings → Bedrock (Converse)
// → writes the Report row via boto3. Direct DynamoDB writes are fine here
// because nothing subscribes to Report — the lead's browser polls.
const reportRequestTable = backend.data.resources.tables['ReportRequest'];
const pingTableRef = backend.data.resources.tables['Ping'];
const reportTable = backend.data.resources.tables['Report'];

const reportStack = backend.createStack('report');
const reportFn = new LambdaFunction(reportStack, 'ReportPyFn', {
  runtime: Runtime.PYTHON_3_12,
  handler: 'handler.handler',
  code: Code.fromAsset(
    join(dirname(fileURLToPath(import.meta.url)), 'functions', 'report-py'),
  ),
  timeout: Duration.seconds(60),
  environment: {
    PING_TABLE_NAME: pingTableRef.tableName,
    REPORT_TABLE_NAME: reportTable.tableName,
    // Haiku 4.5 via inference profile: the most capable Anthropic model this
    // account can invoke (Opus/Sonnet 5 tiers are sales-gated on new accounts;
    // confirmed empirically 2026-08-20). Right-sized for a 4-sentence report.
    BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  },
});

pingTableRef.grantReadData(reportFn);
reportTable.grantWriteData(reportFn);
reportFn.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      'arn:aws:bedrock:*::foundation-model/anthropic.*',
      `arn:aws:bedrock:*:${reportStack.account}:inference-profile/us.anthropic.*`,
    ],
  }),
);
reportFn.addToRolePolicy(
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
);
new EventSourceMapping(reportStack, 'ReportRequestStreamMapping', {
  target: reportFn,
  eventSourceArn: reportRequestTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
  batchSize: 5,
});
