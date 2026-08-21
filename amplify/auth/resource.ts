import { defineAuth } from '@aws-amplify/backend';

/**
 * Email/password sign-in. Groups:
 *   lead   — sees reports and the team roster's remove action
 *   member — everyone else
 *   dev    — test-environment controls (reset / reseed the demo river)
 * Group assignment is manual (Cognito console or CLI) — no self-service
 * role escalation.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['lead', 'member', 'dev'],
});
