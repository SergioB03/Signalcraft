import { defineFunction } from '@aws-amplify/backend';

/**
 * Test-environment reset, exposed as the `resetDemoDay` custom mutation
 * (dev group only). Lives in the data stack: it is both a resolver for the
 * data API and a client of it, which would otherwise be a circular stack
 * dependency.
 */
export const resetDemo = defineFunction({
  name: 'reset-demo',
  entry: './handler.ts',
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});
