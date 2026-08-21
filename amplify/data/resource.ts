import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { computeWeather } from '../functions/compute-weather/resource';

/**
 * The anonymity split is the most important design decision in this app:
 *
 *   Ping        carries a score but NO userId.
 *   PingReceipt carries a userId but NO score.
 *
 * A schema physically cannot leak what it never stored. One-ping-per-day is
 * enforced by giving PingReceipt a deterministic id (`${userId}#${dayKey}`) —
 * Amplify's create mutation has a built-in attribute_not_exists(id) condition,
 * so the second receipt of the day is rejected by DynamoDB itself.
 */
const schema = a
  .schema({
    Team: a
      .model({
        name: a.string().required(),
        memberships: a.hasMany('Membership', 'teamId'),
      })
      .authorization((allow) => [allow.authenticated()]),

    Membership: a
      .model({
        teamId: a.id().required(),
        team: a.belongsTo('Team', 'teamId'),
        userId: a.string().required(),
        role: a.enum(['lead', 'member']),
        displayName: a.string().required(),
        // Self-selected, never derived from mood data.
        avatarPose: a.enum(['floating', 'raft', 'underwater', 'struck', 'coconut', 'waving']),
      })
      .authorization((allow) => [allow.authenticated().to(['read']), allow.owner()]),

    Ping: a
      .model({
        teamId: a.id().required(),
        score: a.integer().required(),
        note: a.string(),
        // Epoch seconds; DynamoDB TTL deletes the row ~24h later (lazy —
        // the weather window is enforced by createdAt in the Lambda).
        expiresAt: a.timestamp(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),

    PingReceipt: a
      .model({
        teamId: a.id().required(),
        userId: a.string().required(),
        dayKey: a.string().required(),
      })
      .authorization((allow) => [allow.owner().to(['create', 'read'])]),

    // One row per team (id === teamId): a materialized view of recent pings.
    // Written only by the compute-weather Lambda; clients subscribe, never write.
    WeatherState: a
      .model({
        teamId: a.id().required(),
        scene: a.enum(['gathering', 'clear', 'breezy', 'overcast', 'rough', 'storm']),
        score: a.float(),
        pingCount: a.integer(),
      })
      .authorization((allow) => [allow.authenticated().to(['read'])]),

    Report: a
      .model({
        teamId: a.id().required(),
        periodStart: a.date(),
        periodEnd: a.date(),
        body: a.string(),
        suggestedAction: a.string(),
      })
      .authorization((allow) => [allow.group('lead')]),
  })
  // The weather Lambda talks to this API with IAM auth so its WeatherState
  // writes are AppSync mutations — which is what makes subscriptions fire.
  .authorization((allow) => [allow.resource(computeWeather)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
