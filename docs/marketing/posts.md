# Posts

Fill the `[TODO]`s after step 7 (live URL) and step 4 (first real night).

## AWS Builder Center submission text

Signalcraft: a group adopts Scrap, a salvaged robot who is powered by honesty, not by happiness. Every check-in keeps him running, whatever the score; he only runs low when nobody says anything. Every night an EventBridge Scheduler wakes a Lambda that asks Claude Haiku 4.5 on Bedrock for a few sentences in Scrap's voice and stores them date-keyed, with no user in the loop. Amplify Gen 2, AppSync + DynamoDB subscriptions, Python Lambda, SVG character drawn in code. Solo, one weekend. Concept build running through Sun Aug 30, 2026; demo history before [TODO: first real date] is seeded and labeled. Live: [TODO: URL]. Repo: https://github.com/SergioB03/Signalcraft #agents

## LinkedIn

I shipped a second AWS Builder Center challenge entry this weekend. It is called Signalcraft, and it has one rule: Scrap is powered by honesty, not by happiness.

Scrap is a small salvaged robot a group adopts. Every check-in keeps him powered, whether the day was a 1 or a 5. He only runs low when nobody says anything at all. And every night, on an EventBridge schedule with no user in the loop, a Lambda asks Claude Haiku 4.5 on Amazon Bedrock for a few sentences in his voice about the day. You find it in the morning.

Three decisions I am glad I made:

1. The rule is enforced by the data model. A check-in is two rows: one with a score and no author, one with an author and no score. Scrap's power is computed from the second table only, so "mood never affects power" is not a comment, it is the absence of a column.

2. Scrap is drawn in code, not generated. Image models drift; by night four a generated Scrap would be a different robot. He is SVG with named parts, and Bedrock writes only what is around him.

3. It ends on purpose. This is a concept build with a seven-day life. The footer says when it stops. The demo archive is seeded and labeled as such. A nightly job nobody turns off is the real failure mode for a project like this.

Built solo in one weekend on top of Undercurrent, my Full Stack Challenge entry from two days earlier: Amplify Gen 2, Cognito, AppSync + DynamoDB, Lambda, Bedrock, EventBridge Scheduler.

Live (through Sun Aug 30, 2026): [TODO: URL]
Repo and full build log: https://github.com/SergioB03/Signalcraft

#AWS #Amplify #Bedrock #agents #GeorgiaState #SHPE

## X thread

1/6 Shipped Signalcraft this weekend for the AWS Builder Center agent challenge. One rule: Scrap is powered by honesty, not by happiness. A terrible day powers him exactly as much as a great one. He only runs low when nobody says anything. [TODO: URL]

2/6 Scrap is a salvaged robot a group adopts. You check in once a day, any score. Every night an EventBridge Scheduler wakes a Lambda that asks Claude Haiku 4.5 on Bedrock for a few sentences in his voice. Nobody triggers it. You find it in the morning.

3/6 The rule is enforced by the schema, not a comment. A check-in is two rows: one has a score and no author, one has an author and no score. Scrap's power reads the second table only. There is no mood column to cheat with.

4/6 Scrap is drawn in code, not generated. Image models drift, and by night four a generated Scrap would be a slightly different robot. So he is SVG with named parts, and Bedrock only writes what is around him.

5/6 It is a concept build with a seven-day life and the footer says so. The demo archive is seeded with a backfill script and labeled. A nightly cron nobody turns off is the real failure mode, so the teardown date is in the README.

6/6 Solo, one weekend, on top of the codebase I shipped two days earlier. Amplify Gen 2, Cognito, AppSync + DynamoDB, Lambda, Bedrock, EventBridge Scheduler. Repo and build log: https://github.com/SergioB03/Signalcraft
