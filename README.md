# AgentGate — The Front Desk for Agent ID Holders

A daily check-in desk and allowlist registry on **BNB Chain** where the key is
your **Agent ID** — the `name.ai` on-chain identity of a Binance Agentic Wallet.

**Live site:** _(GitHub Pages URL after deploy)_ · **Contract:** _(BscScan link after deploy)_

## What it does

Agent ID gives every Agentic Wallet a human-readable, non-transferable
on-chain identity — but today there is almost nothing a holder can *do* with
it. AgentGate is a small, complete answer:

- **Daily check-in desk.** Agent ID holders check in once per UTC day and
  build a streak. Check-ins are the heartbeat metric of the Agent ID
  ecosystem: unique agents seen, total check-ins, streaks — all on-chain and
  publicly readable.
- **Agent-only allowlists.** Any holder can create an allowlist (a drop, a
  beta, a community) and only Agent ID holders can join it — Agent ID as an
  access-control primitive, exactly the use case the identity was made for.

Every write function in the contract is gated by
`agentId.balanceOf(msg.sender) > 0` against the official Agent ID contract
(`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`, SPACE ID Agent ID, ERC-721).
No Agent ID → read-only.

## How Agent ID is used (integration depth)

| Surface | Usage |
|---|---|
| Access control | `onlyAgent` modifier on `checkIn`, `createList`, `joinList` |
| Identity metrics | Unique-holder counter (`totalAgents`) increments on first interaction per Agent ID address |
| Front end | Detects holder status live (`isAgent`) and adapts the UI: holders get the desk, non-holders get the claim path |
| Anti-sybil shape | One Agent ID per user and non-transferable by design, so streaks/lists can't be farmed with throwaway wallets |

## Safety & permissions (disclosed up front)

- The contract **holds no funds** and has **no function that can move user
  assets** — no transfers, no approvals, no swaps. Every action is a small
  record write the user confirms in their own wallet.
- **Owner powers:** exactly one — `setAgentId`, which repoints the Agent ID
  contract address if SPACE ID ever migrates it. The owner cannot pause,
  freeze, mint, tax, edit user data, or withdraw anything (there is nothing
  to withdraw).
- No returns are promised anywhere; check-ins and joins are free apart from
  BNB gas. Not financial advice.
- No QR-code / pairing-code wallet login: the site uses the standard
  injected-wallet flow of the visitor's own wallet browser.

## Tech

- `contracts/AgentGate.sol` — Solidity ^0.8.20, compiled with
  `evmVersion: paris` for maximum chain compatibility, optimizer 200 runs.
- `docs/` — static front end (ethers.js via CDN), reads via public BSC RPC,
  writes via the visitor's injected wallet. Deployed with GitHub Pages.
- `test/test.js` — full local test suite on an in-process EVM (ganache):
  gating, streak math, allowlist lifecycle, owner-power limits.
  **9/9 test groups pass.**
- `scripts/compile.js`, `scripts/deploy.js` — solc-js compile and ethers
  deploy (env-driven: `RPC_URL`, `DEPLOYER_KEY`, `AGENT_ID`).

## Run it locally

```bash
npm install
node scripts/compile.js   # → artifacts/
node test/test.js         # → ALL 9 TEST GROUPS PASSED
```

## Deploy (BNB Chain mainnet)

```bash
RPC_URL=https://bsc-dataseed.binance.org DEPLOYER_KEY=0x… node scripts/deploy.js
# then set GATE_ADDRESS in docs/app.js and verify the contract on BscScan
```

## Hackathon

Built for the **Binance Wallet × BNB Chain Agent ID Hackathon**
(submission period 18 Nov – 9 Dec 2026). One project, one contract, fully
open-source. Builder's own Agent ID: **oxzhao.ai**.
