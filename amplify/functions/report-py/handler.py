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


ANONYMITY_FLOOR = 5  # same floor as the weather Lambda, same reasoning


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

    # Anonymity floor, mirrored from the weather path: below 5 pings an
    # "aggregate" is close to being someone's individual answer, so it never
    # reaches Bedrock or the lead.
    if len(pings) < ANONYMITY_FLOOR:
        write_report(
            team_id,
            period_start,
            now,
            body=f"Only {len(pings)} ping{'s' if len(pings) != 1 else ''} came in this "
            f"week — below the {ANONYMITY_FLOOR}-ping floor, a summary would be too "
            "close to individual answers, so none is generated.",
            suggested_action="Encourage a few more daily pings; the report unlocks at "
            f"{ANONYMITY_FLOOR}.",
        )
        return

    aggregates = build_aggregates(pings, now)
    try:
        body, action = ask_claude(aggregates)
    except Exception as err:  # noqa: BLE001 — a report row must always land
        print(f"report[{team_id}] bedrock call failed: {err}")
        body = (
            f"The writing assistant is unavailable right now, so here are the plain "
            f"numbers: {aggregates['total_pings']} pings this week, overall average "
            f"{aggregates['overall_average']} out of 5."
        )
        action = "Try generating again in a few minutes."
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
        # Clamp mirrors the schema validation — a crafted score can't skew this.
        by_day.setdefault(day, []).append(min(5, max(1, int(ping["score"]))))
        note = str(ping.get("note") or "").strip()
        if note:
            notes.add(note)

    # Days with fewer than 3 pings keep their count but hide the average —
    # a one-ping day's "average" is one person's exact answer with a date on it.
    daily = [
        {
            "day": day,
            "count": len(scores),
            "average": round(sum(scores) / len(scores), 2) if len(scores) >= 3 else None,
        }
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
below is up to a week of anonymous 1-5 mood pings from their team (5 = great,
1 = struggling), plus anonymous free-text notes in random order. Days with a
null average had too few pings to summarize without risking anonymity — do not
guess at them. Only describe change over time if the data actually spans
multiple days.

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
        # rpartition + residue stripping: models sometimes bold the label
        # ("**ACTION:**"), which would leave dangling asterisks in the UI.
        body, _, action = text.rpartition("ACTION:")
    return body.strip().rstrip("*#").strip(), action.strip().lstrip("*# ").strip()


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