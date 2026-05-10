# Secudigate — Security

This document covers Secudigate's security model, the adversarial test
suite, and the responsible disclosure process.

For the user-facing summary, see the [Security model](https://secudigate.com/docs#r-security)
section of the docs.

---

## Threat model

Secudigate is a **non-custodial** multi-tenant stablecoin payment gateway.
The protocol's only privileged operations are platform-level config
(fee receiver, fee bps, pause, price feeds, sanctions oracle). The
operator **cannot** edit any merchant's slot — merchants are walled off
by `msg.sender` checks against the `merchants` mapping.

### What the contract guarantees

| Property | Mechanism |
|---|---|
| No custody | Three direct `transferFrom` calls payer → recipients in a single tx; no `transfer` or `selfdestruct` to the contract. |
| Replay protection (invoice mode) | `paidInvoices[invoiceId]` global mapping; second use reverts with `InvoiceAlreadyPaid`. |
| Per-payer daily cap | USD-6dp accumulator keyed on `(payer, merchant, dayIndex)`, evaluated via Chainlink price feeds. |
| OFAC screen | Both payer and merchant checked against the Chainalysis oracle on every `pay` / `deposit`. |
| Reentrancy lock | OpenZeppelin `ReentrancyGuard` on every external state-mutating function. |
| Fee caps | `MAX_PLATFORM_FEE_BPS = 200` and `MAX_MERCHANT_FEE_BPS = 1000` — enforced at config time, cannot be raised. |
| Admin can't rug merchants | Owner / `ADMIN_ROLE` holders cannot edit any merchant's treasury, fee, daily limit, or paused state. |

### What the contract does NOT do (by design)

- **No FoT awareness.** Stablecoins aren't fee-on-transfer; we don't
  double the gas for a before/after balance diff just to support FoT
  tokens. A merchant accepting a FoT token will see less land in
  their treasury than the event reports.
- **No screening of `treasury` / `feeReceiver`.** The merchant vouched
  for those addresses at registration. If the merchant attaches a
  sanctioned wallet, that's the merchant's problem.
- **No screening of `secudigate` (platform fee receiver).** Admin
  picks it; admin is responsible for not pointing it at a
  sanctioned address.
- **No rescue / withdraw function.** Tokens accidentally sent to the
  contract (e.g. a merchant who registers the gateway itself as their
  treasury) are permanently stuck. Non-custodial means non-custodial.
- **`invoiceId` is global, not per-merchant.** A 32-byte random ID
  collides across tenants at 1 in 2^256. We don't add a per-merchant
  namespace because the collision risk is unmeasurable.
- **`deposit` has no replay protection.** That's the point of an
  open-amount deposit link.

---

## Test coverage

**157 tests, 0 failing.** Run `forge test` from the repo root to verify.

The adversarial suite is **80 tests across 9 files** under
[`test/attacks/`](test/attacks/). Each file probes one threat surface.

### Adversarial files

#### `Reentrancy.t.sol` — 12 tests

Hostile ERC20 calls back into the gateway at every stage of `_route`'s
three `transferFrom` calls, in every cross-function combination.

- `test_reentry_pay_during_pay_platformFeeStage`
- `test_reentry_pay_during_pay_merchantFeeStage`
- `test_reentry_pay_during_pay_netStage`
- `test_reentry_deposit_during_pay_platformFeeStage`
- `test_reentry_deposit_during_pay_merchantFeeStage`
- `test_reentry_deposit_during_pay_netStage`
- `test_reentry_pay_during_deposit_platformFeeStage`
- `test_reentry_pay_during_deposit_netStage`
- `test_reentry_deposit_during_deposit`
- `test_control_noReentry_payCompletes`
- (+ helper / harness tests)

All reentry attempts revert via `ReentrancyGuard`. The control case
(no reentry) routes cleanly.

#### `MaliciousToken.t.sol` — 6 tests

Real-world ERC20 misbehaviors:

- `test_returnFalseToken_revertsOnPay` — SafeERC20 catches return-false.
- `test_revertingToken_revertReachesPayer` — token revert bubbles up.
- `test_feeOnTransfer_merchantReceivesLessThanBookkeeping` — documents
  the FoT-non-aware design.
- `test_noZeroTransfer_worksWhenMerchantFeeIsZero` — the `if (fee > 0)`
  guard makes zero-fee merchants compatible with no-zero-transfer tokens.
- `test_usdtShapedToken_setFeedRevertsBecauseNoDecimalsBool` —
  USDT-shaped (no return value) tokens work; SafeERC20 tolerates them.
- `test_noDecimalsToken_setFeedReverts` — `setTokenPriceFeed` rejects
  tokens whose `decimals()` reverts.

#### `PriceFeed.t.sol` — 11 tests

Chainlink aggregator adversarial cases:

- Negative answer reverts (`InvalidPrice`).
- Zero answer reverts.
- `type(int256).min` answer reverts.
- Exact-staleness boundary (1h) passes; one second past reverts.
- Future-dated `updatedAt` passes (documents behavior).
- Admin swaps feed mid-block to a 100× pumped feed → daily cap still
  enforced via the new feed.
- Admin removes the feed → capped merchant can't accept that token
  (`PriceFeedNotConfigured`).
- `decimals = 78` overflows in arithmetic → reverts cleanly.
- `decimals = 0` passes (sanity).
- `quoteUsd6` for an unknown token reverts.

#### `AccessControl.t.sol` — 15 tests

Privilege boundary tests:

- Merchant-to-merchant: A can't edit B's treasury, can't pause B.
- Attacker (no merchant slot): every merchant-only function reverts
  with `CallerNotMerchant`.
- Admin can't edit any merchant's config (the wall that prevents the
  operator from rugging tenants).
- The standard `grantRole` path is locked because `DEFAULT_ADMIN_ROLE`
  is never granted.
- Admin can't propagate `ADMIN_ROLE` — only the owner can.
- Renounce ownership → previous owner can't reclaim; other admins keep
  their power.
- Documents that admin **can** redirect the platform fee receiver
  (design choice — admin is the project's trust anchor for platform
  fee disposition).
- Attacker can't disable the sanctions oracle.
- Attacker can't raise `secudigateFeeBps` above `MAX_PLATFORM_FEE_BPS`.
- Pause blocks register/pay; unpause unblocks.

#### `Sanctions.t.sol` — 13 tests

OFAC sanctions oracle surface:

- Sanctioned payer / merchant blocks `pay` and `deposit`.
- Sanctions check runs **before** merchant registration check — a
  sanctioned address can't probe registration state.
- Treasury / fee receiver / platform fee receiver are **not** screened
  (documented design, tested explicitly).
- Reverting oracle → all payments revert.
- Deny-all oracle → all payments revert (whole gateway rugged).
- Gas-griefing oracle → admin can recover by setting `address(0)`.
- Mid-flow sanction toggle: prior payments preserved, future blocked.
- Oracle disabled (`address(0)`) → screening skipped entirely.

#### `DailyLimit.t.sol` — 11 tests

Per-payer USD daily cap accumulator:

- Pay exactly at the cap passes; one wei over reverts.
- Cap resets at UTC day boundary.
- Cap does not reset mid-day (warp 23h, still blocked).
- Per-payer isolation: one payer maxing out doesn't affect others.
- Per-merchant isolation: payer maxed at merchant A still has full
  budget at merchant B.
- Multi-token: $600 in USDC + $400 in USDT fills the $1000 cap.
- Lowering the cap mid-day preserves prior spend; new payments
  measured against the new lower cap.
- Disabling the cap mid-day unrestricts future payments; the
  accumulator stops updating.
- Capped merchant with no feed for the token → `PriceFeedNotConfigured`.
- `paidUsd6Today` view stays consistent across interleaved pays.

#### `Replay.t.sol` — 9 tests

Invoice replay + cross-tenant collision:

- Same `invoiceId` twice → `InvoiceAlreadyPaid`.
- Same `invoiceId` across two merchants → second reverts (global ID
  space, by design).
- Failed `pay` does **not** consume the `invoiceId` — Solidity reverts
  the whole tx atomically, including the `paidInvoices[id] = true`
  assignment.
- `bytes32(0)` is a valid single-use ID.
- Attacker can "claim" an outstanding invoice ID by paying first;
  funds still route to the merchant — only the slot is consumed.
- `deposit` has no replay protection (by design — open-amount link).
- `pay` and `deposit` use independent ID spaces (a value used as
  `invoiceId` can still be used as a deposit `paymentRef`).
- While paused, an already-used `invoiceId` returns the paused error,
  not the replay error (pin-down of check ordering).

#### `GasGriefing.t.sol` — 7 tests

Hostile / odd recipient configurations:

- All three recipients = same address (treasury == feeReceiver ==
  secudigate) — routes cleanly, balances sum to gross.
- treasury == feeReceiver, distinct from platform — routes cleanly.
- Contract recipient for each of the three slots — ERC20 doesn't
  notify recipient contracts, so the payment completes.
- **Gateway-as-treasury foot-gun** — a merchant who registers the
  gateway contract as their treasury sees funds permanently stuck.
  No rescue function exists. Test documents this rather than fixing
  it; the user-facing UI prevents the misconfiguration.
- Zero platform fee skips the first `transferFrom` (`if (fee > 0)` guard).
- Zero merchant fee skips the middle `transferFrom`.

#### `Invariants.t.sol` — 4 fuzz + 3 stateful invariants

Foundry property-based and stateful invariant testing:

- `testFuzz_feeMath_sumsToGross` — for any (merchantBps, amount),
  platformFee + merchantFee + netToTreasury = amount.
- `testFuzz_feeMath_respectsCaps` — neither fee exceeds its declared cap.
- `testFuzz_pay_noCustody` — for any pay, contract balance delta is 0.
- `testFuzz_pay_atomic_orRevert` — payer's deduction equals the sum
  of recipient gains (no partial credit ever visible).
- `invariant_noCustody` — across 256 random call sequences of 128k
  total operations, the gateway never holds tokens.
- `invariant_supplyConserved` — total tokens in the system equal the
  initial mint across every operation sequence.
- `invariant_dailyAccumulator_zeroWhenCapDisabled` — sentinel that
  fails loudly if someone adds time-warping to the handler without
  revisiting the daily-cap property.

The handler restricts the API to legal operations (registered
merchants, valid amounts, bounded fees) so the invariant runs sweep
the legitimate state space rather than spending fuel on reverts.

---

## Running the tests

```bash
# Install Foundry: https://book.getfoundry.sh/getting-started/installation
forge install
forge test
```

To run only the adversarial suite:

```bash
forge test --match-path "test/attacks/*"
```

To run a single file:

```bash
forge test --match-path "test/attacks/Reentrancy.t.sol" -vv
```

Invariants are slow (~20s on a modern laptop) due to the 128k random
call counts; the rest of the suite finishes in under 2 seconds.

---

## Known accepted risks

- **Reorgs.** A payment confirmed in a re-orged block can be silently
  dropped. The contract has no defense; the indexer reconciles using
  finality depth and the backend marks invoices `paid` only after N
  confirmations.
- **Chainlink heartbeat staleness window.** The 1-hour staleness check
  is generous for stablecoins (Chainlink updates USDC / USDT / DAI feeds
  on a tighter cadence). A merchant whose tokens depeg sharply within
  the heartbeat window may have payments accepted at the pre-depeg
  price for up to 1 hour.
- **Admin redirecting platform fees.** Documented as design. Admin is
  the project's trust anchor for platform-fee disposition. Existing
  fund balances aren't drained (contract holds no custody); only
  future payments route to the new receiver.
- **`treasury == address(gate)` foot-gun.** Tokens stuck permanently.
  Frontend prevents the misconfiguration; the contract does not.

---

## Reporting a vulnerability

Email **security@secudigate.com** with:

- A clear description of the issue.
- Steps to reproduce (or a Foundry test case — preferred).
- Your suggested severity and any context on the impact.

We aim to acknowledge new reports within **48 hours** and provide a
remediation timeline within **5 business days**.

### Scope

- The Secudigate smart contract ([`src/Secudigate.sol`](src/Secudigate.sol)).
- The backend ([`backend/`](backend/)) — auth, webhook signing,
  invoice issuance.
- The hosted frontend (secudigate.com).

### Out of scope

- Self-hosted forks of the frontend or backend (those are yours; we
  can advise but don't operate them).
- Issues in dependencies that have an upstream advisory and a working
  fix you can deploy yourself.
- Social engineering of merchants or end-users.
- Theoretical attacks that don't translate into a reproducible
  exploit against a mainnet or Sepolia deployment.

### Safe harbor

We treat good-faith security research as authorized. We will not
pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data
  destruction, and service interruption.
- Only interact with their own accounts / merchants / payments, or
  with explicit permission from the account owner.
- Give us a reasonable disclosure window before publication.

---

*Last updated: 2026-05-16. License: MIT (this file and the project).*
