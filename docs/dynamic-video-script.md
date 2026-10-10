# Dynamic bounty video (about 2 minutes)

Record on the live site. Each block is what's on screen, then what you say.

Record in a fresh browser profile so the sign-in starts from nothing. Leave automation on the
default, "Ask me first": switching to "Do it for me" waits 24 hours by design, so the video shows
the agent carrying out a change you approve, which is the same signer either way.

**0:00 · Landing page**
"Modalis is a wealth manager on Monad for people who've never used crypto. Dynamic does three
jobs here: sign-in, telling our server who's asking, and running the agent that manages your plan
while you're away."

**0:10 · Sign in with email**
Type an email, enter the code.
"No wallet extension, no seed phrase. Dynamic creates an embedded wallet on Monad that only this
person controls."

**0:25 · Get test money, then Add money**
"Adding money is one signature: Dynamic's wallet sends the approval and the deposit together as a
batch."

**0:45 · Plan page, approve the plan**
Point at the "Adjustments allowed" receipt.
"Approving the plan signs one more thing: a permission naming our agent. The agent is a Dynamic
server wallet, so its key is split between Dynamic and us with MPC."

**1:00 · Settings → What Modalis is allowed to do**
Point at "Who makes adjustments: A Dynamic server wallet" and the paragraph below it.
"The plan contract lets that wallet do exactly one thing: rebalance inside your limits. It can't
take money out, can't change a limit, and Revoke takes the permission back in one block."

**1:15 · Run "Simulate a market move", then approve the suggested adjustment**
"Prices move and the plan drifts past its limit. I approve the fix, and the Dynamic server wallet
carries it out. On "Do it for me" it would do this without asking."

**1:30 · Proof page (/proof/your-address)**
Point at "Who can adjust it" and the "signed by the Dynamic server wallet" line on the adjustment.
"Anyone can check this page. It's read straight from Monad: the agent's address, and every
transaction it sent, with a link to the explorer."

**1:45 · Settings → Revoke adjustments**
"And if I change my mind, one tap revokes it."

**1:55 · Close**
"Dynamic for sign-in, for identity, and for an agent you can see and switch off. That's Modalis."
