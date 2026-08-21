import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { computeWeather } from '../functions/compute-weather/resource';
import { resetDemo } from '../functions/reset-demo/resource';

/**
 * The anonymity split is the most important design decision in this app:
 *
 *   Ping        carries a score but NO userId.
 *   PingReceipt carries a userId but NO score.
 *
 * A schema physically cannot leak what it never stored. One-ping-per-day is
 * enforced on the honest client path by giving PingReceipt a deterministic id
 * (`${userId}#${dayKey}`) — Amplify's create mutation carries a built-in
 * attribute_not_exists(id) condition, so the second receipt of the day loses.
 * Known limitation (documented in NOTES.md): the receipt→ping pair is
 * client-orchestrated, so a hand-crafted API call can still create pings
 * without a receipt; score bounds below cap the damage.
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
        // Where on the river you sit — discrete named spots, never free movement.
        spot: a.enum(['drift', 'headwater', 'rapids', 'rock', 'shade', 'shallows', 'eddy']),
      })
      // Everyone sees the roster; you edit only yourself; leads can remove.
      .authorization((allow) => [
        allow.authenticated().to(['read']),
        allow.owner(),
        allow.group('lead').to(['delete']),
      ]),

    Ping: a
      .model({
        teamId: a.id().required(),
        // Server-side bounds: without these, one crafted score of 9999 pins
        // the average (and therefore the weather) regardless of everyone else.
        score: a
          .integer()
          .required()
          .validate((v) => v.gte(1).lte(5)),
        note: a.string().validate((v) => v.maxLength(140)),
        // Epoch seconds; DynamoDB TTL deletes the row ~24h later (lazy —
        // the weather window is enforced by createdAt in the Lambda).
        expiresAt: a.timestamp(),
      })
      // create-only for humans: no client reads raw pings (the UI reads
      // WeatherState; only the weather Lambda lists pings). Least privilege —
      // unnecessary read access is the kind that bites later.
      .authorization((allow) => [allow.authenticated().to(['create'])]),

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

    // A lead pressing "generate report", as a record: its table stream
    // triggers the Python report Lambda (wired in backend.ts). The Lambda
    // writes the Report row directly, and the lead's browser polls for it —
    // no subscription needed on this path.
    ReportRequest: a
      .model({
        teamId: a.id().required(),
      })
      .authorization((allow) => [allow.group('lead')]),

    // Test-environment control for the dev group: forget today's receipts so
    // demo accounts can ping again, or wipe / reseed the whole river.
    // `lead` is here for the showcase: the demo lead needs to put the river
    // back between walkthroughs without a second account. Group assignment is
    // manual, so a visitor who signs up gets neither group and cannot reach
    // this — the demo cast is the only audience it widens to.
    resetDemoDay: a
      .mutation()
      .arguments({ teamId: a.id().required(), scope: a.string() })
      .returns(a.json())
      .authorization((allow) => [allow.groups(['dev', 'lead'])])
      .handler(a.handler.function(resetDemo)),
  })
  // Lambdas talk to this API with IAM auth so their writes are AppSync
  // mutations — which is what makes subscriptions fire.
  .authorization((allow) => [allow.resource(computeWeather), allow.resource(resetDemo)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
