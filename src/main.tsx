import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import './index.css'
import App from './App.tsx'

// The browser never needs identity-pool (IAM) credentials: every data call
// uses user-pool auth. Leaving the identity pool configured makes Amplify
// exchange tokens for credentials on each session — a call Cognito throttles
// for group members, retrying into a wall of console 400s. So we drop it.
const { identity_pool_id: _unusedIdentityPool, ...auth } = outputs.auth
void _unusedIdentityPool
Amplify.configure({ ...outputs, auth })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
