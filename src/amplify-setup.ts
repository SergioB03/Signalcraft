import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'

// Imported FIRST in main.tsx so Amplify is configured before any module that
// calls generateClient() at module scope evaluates — otherwise every page
// load logs "Amplify has not been configured".
//
// The browser never needs identity-pool (IAM) credentials: every data call
// uses user-pool auth. Leaving the identity pool configured makes Amplify
// exchange tokens for credentials on each session — a call Cognito throttles
// for group members, retrying into a wall of console 400s. So we drop it.
const { identity_pool_id: _unusedIdentityPool, ...auth } = outputs.auth
void _unusedIdentityPool
Amplify.configure({ ...outputs, auth })
