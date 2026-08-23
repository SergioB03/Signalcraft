#!/usr/bin/env bash
#
# Provisions the demo cast in the Signalcraft Cognito pool: demo1..demo5 plus dev.
# Each account is created with the invite email suppressed, given a permanent
# password, and dropped into its group (demo1 leads, dev is dev, the rest are
# members). A new pool comes with every new Amplify app, so this is the script
# that repopulates it.
#
# Idempotent on purpose: an account that already exists is left in place and only
# has its password and group re-applied, so re-running is a clean no-op.
#
# Run:  USER_POOL_ID=us-east-1_xxxxxxxxx DEMO_PASSWORD='...' bash scripts/create-cast.sh
# Env:  USER_POOL_ID, DEMO_PASSWORD (both required)
#       AWS         (optional) path to the AWS CLI — it is not on PATH on Windows
#       AWS_REGION  (optional) defaults to us-east-1

set -uo pipefail

# No `set -e`: the "user already exists" path is an expected non-zero exit and
# must not abort the run. Anything genuinely unexpected still trips this trap.
trap 'echo "create-cast.sh: unexpected failure near line $LINENO" >&2; exit 1' ERR

AWS="${AWS:-C:/Program Files/Amazon/AWSCLIV2/aws.exe}"
REGION="${AWS_REGION:-us-east-1}"

usage() {
  cat >&2 <<'USAGE'
usage: USER_POOL_ID=<pool id> DEMO_PASSWORD=<password> bash scripts/create-cast.sh

  USER_POOL_ID   e.g. us-east-1_TkksbSfEQ  (npx ampx generate outputs ... prints it)
  DEMO_PASSWORD  shared by every demo account; must satisfy the pool's policy
  AWS            optional; defaults to C:/Program Files/Amazon/AWSCLIV2/aws.exe
  AWS_REGION     optional; defaults to us-east-1
USAGE
  exit 1
}

if [ -z "${USER_POOL_ID:-}" ]; then
  echo "create-cast.sh: USER_POOL_ID is not set." >&2
  usage
fi
if [ -z "${DEMO_PASSWORD:-}" ]; then
  echo "create-cast.sh: DEMO_PASSWORD is not set." >&2
  usage
fi
if [ ! -x "$AWS" ] && ! command -v "$AWS" >/dev/null 2>&1; then
  echo "create-cast.sh: cannot find the AWS CLI at '$AWS'. Set AWS=<path to aws.exe>." >&2
  exit 1
fi

# email:group. demo1 leads the group, dev gets the dev tools, everyone else is a member.
CAST=(
  "demo1@signalcraft.local:lead"
  "demo2@signalcraft.local:member"
  "demo3@signalcraft.local:member"
  "demo4@signalcraft.local:member"
  "demo5@signalcraft.local:member"
  "dev@signalcraft.local:dev"
)

# Runs an AWS call, swallowing its output unless it fails — then it prints
# everything and stops, because a half-provisioned cast is worse than none.
run_or_die() {
  local label="$1"
  shift
  local out
  if ! out=$("$@" 2>&1); then
    printf '%s\n' "$out" >&2
    echo "create-cast.sh: $label failed." >&2
    exit 1
  fi
}

echo "pool $USER_POOL_ID  region $REGION"

created=0
existed=0

for entry in "${CAST[@]}"; do
  email="${entry%%:*}"
  group="${entry##*:}"

  if out=$("$AWS" cognito-idp admin-create-user \
      --region "$REGION" \
      --user-pool-id "$USER_POOL_ID" \
      --username "$email" \
      --message-action SUPPRESS \
      --user-attributes "Name=email,Value=$email" "Name=email_verified,Value=true" \
      2>&1); then
    status="created"
    created=$((created + 1))
  elif printf '%s' "$out" | grep -q 'UsernameExistsException'; then
    # Expected on every re-run. Fall through and re-apply password + group.
    status="already existed"
    existed=$((existed + 1))
  else
    printf '%s\n' "$out" >&2
    echo "create-cast.sh: admin-create-user failed for $email." >&2
    exit 1
  fi

  # --permanent skips FORCE_CHANGE_PASSWORD so the scripts can sign in directly.
  run_or_die "admin-set-user-password for $email" \
    "$AWS" cognito-idp admin-set-user-password \
      --region "$REGION" \
      --user-pool-id "$USER_POOL_ID" \
      --username "$email" \
      --password "$DEMO_PASSWORD" \
      --permanent

  # Adding an account to a group it is already in is a no-op success in Cognito.
  run_or_die "admin-add-user-to-group for $email" \
    "$AWS" cognito-idp admin-add-user-to-group \
      --region "$REGION" \
      --user-pool-id "$USER_POOL_ID" \
      --username "$email" \
      --group-name "$group"

  printf '  %-26s %-14s -> group %s\n' "$email" "$status" "$group"
done

echo "cast ready: ${created} created, ${existed} already existed, password set on all ${#CAST[@]}."
exit 0
