import { defineAuth } from '@aws-amplify/backend';

/**
 * Email/password sign-in. Two groups per the spec: `lead` sees reports,
 * `member` is everyone else. Group assignment is manual for the demo
 * (Cognito console or CLI) — no self-service role escalation.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['lead', 'member'],
});
