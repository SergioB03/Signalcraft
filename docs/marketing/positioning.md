# Positioning

**One-liner:** Signalcraft: a salvaged robot who runs on your group's honesty and writes you a note overnight.

**GitHub repo description (≤300 chars):**
A group adopts Scrap, a salvaged robot powered by honest check-ins, not happy ones. Nightly EventBridge agent writes his log via Bedrock (Haiku 4.5). Amplify Gen 2, AppSync, DynamoDB, SVG character. Concept build, seven-day life. AWS Weekend Creative Agent Challenge, Aug 2026.

## Thesis

Scrap is powered by honesty, not by happiness. A terrible day powers him exactly as much as a great one; he only runs low when nobody says anything at all. That rule is enforced in the data model, not in a comment: his power is computed from the `PingReceipt` table, which has no mood column. The agent part is the nightly tick: an EventBridge Scheduler wakes a Lambda that asks Claude Haiku 4.5 on Bedrock for a few sentences in Scrap's voice and stores them date-keyed, with no user in the loop. It is a concept build with a seven-day life, the demo history is seeded and says so, and Scrap himself is drawn in code because image models drift. Built solo in one weekend by a junior frontend dev on top of a working codebase, with the craft showing in the decisions, not the scope.

## Hooks (pick per channel)

1. Scrap is powered by honesty, not by happiness. Worst day of your life powers him exactly as much as your best.
2. The rule "mood never affects power" is true because the Lambda that powers him reads a table with no score column. Check it in thirty seconds.
3. Scrap is not a chatbot you poke. He acts at night, alone, on an EventBridge schedule, and you find what he wrote in the morning.
4. I could have generated Scrap with an image model. By night four he would have been a different robot. So he is SVG with named parts, and Bedrock only writes what is around him.
5. A hackathon agent with a nightly cron and no teardown date is a bill waiting to happen. The footer says the day it stops.
6. One weekend, one working codebase, four new things: a clock, a power meter, a character, a date-keyed log. Everything else was already there.
7. The demo archive is seeded and the article says so in the second paragraph. The app is about honesty; the write-up should be too.

## Audiences, in order of urgency

1. **The AWS Builder Center form.** No judging, so the article's job is to qualify unambiguously (exact title, `#agents` tag, 500+ words, the five named sections, public repo URL, live URL) and be submitted Sunday night. Do not trade any of those for polish.
2. **Hiring managers and senior engineers** who find this later as a portfolio piece. Lead with decisions and trade-offs (anonymity split, table-level enforcement, code-drawn character, cost guards, planned teardown), not feature count. Position as "junior frontend dev who ships on AWS and reasons about data models." Never say "AI-powered pet."
3. **SHPE at GSU peers and the AWS community** on LinkedIn/X. The rule is the hook, the honesty disclosures are the differentiator, Scrap's voice does the rest.

**Tone everywhere:** craft, not hype. Lowercase house style in the UI, plain sentences in prose, no exclamation points, no "game-changing." Be explicit that it is a concept build with a seven-day life; that reads as discipline, not weakness.
