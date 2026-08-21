"""The "current report" Lambda — Undercurrent's Python slice.

Triggered by the ReportRequest table's DynamoDB stream (a lead pressed the
button). Reads the last 7 days of pings, aggregates them, asks Claude on
Bedrock for a short read of the week plus one suggested action, and writes a
Report row the lead's browser is polling for.

Privacy boundary (CLAUDE.md §8): Bedrock sees aggregates only — counts,
daily averages, scene-free note text that is deduped and shuffled. Pings
carry no author, so this code *couldn't* leak identities even if it tried.
That's the structural-anonymity design doing its job.

Zero third-party dependencies — boto3 ships in the Lambda runtime.
"""

import datetime as dt
import json
import os
import random
import uuid

import boto3
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource("dynamodb")
bedrock = boto3.client("bedrock-runtime")

PING_TABLE = os.environ["PING_TABLE_NAME"]
REPORT_TABLE = os.environ["REPORT_TABLE_NAME"]
MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
)
REPORT_DAYS = 7


def handler(event, _context):
    team_ids = set()
    for record in event.get("Records", []):
        if record.get("eventName") != "INSERT":
            continue
        image = record.get("dynamodb", {}).get("NewImage", {})
        team_id = image.get("teamId", {}).get("S")
        if team_id:
            team_ids.add(team_id)

    for team_id in team_ids:
        try:
            generate_report(team_id)
        except Exception as err:  # noqa: BLE001 — log and move on; the UI times out gracefully
            print(f"report[{team_id}] failed: {err}")

    return {"batchItemFailures": []}


def generate_report(team_id: str) -> None:
    now = dt.datetime.now(dt.timezone.utc)
    period_start = now - dt.timedelta(days=REPORT_DAYS)
    pings = fetch_pings(team_id, period_start)

    if not pings:
        write_report(
            team_id,
            period_start,
            now,
            body="No pings in the last week, so there is nothing to read yet. "
            "The river only speaks when the team does.",
            suggested_action="Remind the team the daily ping exists — one tap, anonymous.",
        )
        return

    aggregates = build_aggregates(pings, now)
    body, action = ask_claude(aggregates)
    write_report(team_id, period_start, now, body, action)
    print(f"report[{team_id}] written ({len(pings)} pings)")


def fetch_pings(team_id: str, since: dt.datetime) -> list[dict]:
    """Scan is fine at demo scale; a real deployment would use a GSI query."""
    table = dynamodb.Table(PING_TABLE)
    since_iso = since.isoformat().replace("+00:00", "Z")
    items: list[dict] = []
    kwargs = {
        "FilterExpression": Attr("teamId").eq(team_id) & Attr("createdAt").gt(since_iso)
    }
    while True:
        page = table.scan(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def build_aggregates(pings: list[dict], now: dt.datetime) -> dict:
    by_day: dict[str, list[int]] = {}
    notes: set[str] = set()
    for ping in pings:
        day = str(ping.get("createdAt", ""))[:10]
        by_day.setdefault(day, []).append(int(ping["score"]))
        note = str(ping.get("note") or "").strip()
        if note:
            notes.add(note)

    daily = [
        {"day": day, "count": len(scores), "average": round(sum(scores) / len(scores), 2)}
        for day, scores in sorted(by_day.items())
    ]
    # Dedup (via the set) and shuffle so note order can't hint at timing/identity.
    shuffled_notes = sorted(notes)
    random.shuffle(shuffled_notes)

    return {
        "period_days": REPORT_DAYS,
        "generated_at": now.isoformat(),
        "total_pings": len(pings),
        "overall_average": round(sum(int(p["score"]) for p in pings) / len(pings), 2),
        "daily": daily,
        "anonymous_notes": shuffled_notes[:30],
    }


PROMPT = """You are writing a short private briefing for a team lead. The data
below is a week of anonymous 1-5 mood pings from their team (5 = great,
1 = struggling), plus anonymous free-text notes in random order.

{data}

Write exactly 3-4 plain sentences on what shifted this week and what the data
suggests about how the team is doing. No greetings, no bullet points, no
restating raw numbers the lead can already see. Then, on a new line starting
with "ACTION: ", give one concrete, kind, low-drama action the lead could take
this week. Never speculate about who wrote a note."""


def ask_claude(aggregates: dict) -> tuple[str, str]:
    response = bedrock.converse(
        modelId=MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [{"text": PROMPT.format(data=json.dumps(aggregates, indent=2))}],
            }
        ],
        inferenceConfig={"maxTokens": 500},
    )
    text = "".join(
        block.get("text", "") for block in response["output"]["message"]["content"]
    ).strip()

    body, action = text, ""
    if "ACTION:" in text:
        body, _, action = text.partition("ACTION:")
    return body.strip(), action.strip()


def write_report(
    team_id: str,
    period_start: dt.datetime,
    period_end: dt.datetime,
    body: str,
    suggested_action: str,
) -> None:
    now_iso = period_end.isoformat().replace("+00:00", "Z")
    dynamodb.Table(REPORT_TABLE).put_item(
        Item={
            "id": str(uuid.uuid4()),
            "teamId": team_id,
            "periodStart": period_start.date().isoformat(),
            "periodEnd": period_end.date().isoformat(),
            "body": body,
            "suggestedAction": suggested_action,
            # Amplify-managed metadata so the row reads cleanly through AppSync.
            "__typename": "Report",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
    )