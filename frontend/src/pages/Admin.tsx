import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import AdminGate from "../components/AdminGate";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { SEPOLIA_ID, getChainOrDefault } from "../lib/chains";
import { isValidAddress, shortAddress } from "../lib/format";
import { describeWriteError } from "../lib/txErrors";
import { getTokensForChain, type StablecoinInfo } from "../lib/tokens";

// Same caps the contract enforces, kept here so the form shortcircuits
// before sending the tx.
const MAX_PLATFORM_FEE_BPS = 200;

export default function AdminPage() {
  return (
    <AdminGate>
      {({ isOwner, address }) => <AdminPanel isOwner={isOwner} self={address} />}
    </AdminGate>
  );
}

function AdminPanel({ isOwner, self }: { isOwner: boolean; self: `0x${string}` }) {
  const chain = getChainOrDefault(SEPOLIA_ID);

  return (
    <div className="max-w-3xl mx-auto py-10 px-2 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-brand-soft">Operator console</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-2 text-sm text-ink-dim leading-relaxed max-w-lg">
            Manage platform settings, price feeds, and the sanctions oracle. The
            contract enforces every change via{" "}
            <code className="font-mono text-ink">onlyOwner</code> /{" "}
            <code className="font-mono text-ink">onlyRole(ADMIN_ROLE)</code>; this
            page is just the UI for those methods.
          </p>
        </div>
        <RoleChip isOwner={isOwner} address={self} />
      </header>

      <PlatformSettings />
      <PauseToggle />
      <PriceFeeds />
      <SanctionsOracle />

      {isOwner && (
        <>
          <AdminManagement self={self} />
          <Ownership self={self} />
        </>
      )}

      <p className="text-[11px] text-ink-faint text-center pt-6">
        Gateway:{" "}
        {PAYMENT_GATEWAY_ADDRESS ? (
          <a
            href={`${chain.explorerUrl}/address/${PAYMENT_GATEWAY_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline hover:text-ink"
          >
            {PAYMENT_GATEWAY_ADDRESS}
          </a>
        ) : "(unset)"}
      </p>
    </div>
  );
}

function RoleChip({ isOwner, address }: { isOwner: boolean; address: `0x${string}` }) {
  return (
    <div className="text-right">
      <div className="text-[11px] text-ink-faint">Signed in as</div>
      <div className="font-mono text-xs text-ink">{shortAddress(address)}</div>
      <div className="mt-1">
        <span className={`badge ${isOwner ? "border-brand/40 text-brand-soft bg-brand/10" : "badge-paid"}`}>
          {isOwner ? "Owner + Admin" : "Admin"}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  ownerOnly,
  children,
}: {
  title: string;
  description?: string;
  ownerOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-xs text-ink-dim mt-0.5 max-w-md">{description}</p>}
        </div>
        {ownerOnly && (
          <span className="badge border-brand/40 text-brand-soft bg-brand/10 shrink-0">Owner only</span>
        )}
      </header>
      {children}
    </section>
  );
}

// Shared tx hook — wraps writeContractAsync with pre-simulate + best-effort
// receipt polling, mirroring the pattern in RegistrationModal so the admin
// panel surfaces the same crisp error messages.

function useAdminWrite() {
  const publicClient = usePublicClient({ chainId: SEPOLIA_ID });
  const { writeContractAsync } = useWriteContract();
  const toast = useToast();
  const { address } = useAccount();
  const [busy, setBusy] = useState(false);

  async function run<TArgs extends readonly unknown[]>(
    label: string,
    functionName: string,
    args: TArgs,
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (!PAYMENT_GATEWAY_ADDRESS) {
      toast.error("Contract not configured", "Set VITE_PAYMENT_GATEWAY_ADDRESS first.");
      return false;
    }
    if (!publicClient) {
      toast.error("RPC unavailable", "No public client for Sepolia.");
      return false;
    }

    setBusy(true);
    try {
      try {
        await publicClient.simulateContract({
          address: PAYMENT_GATEWAY_ADDRESS,
          abi: secudigateAbi,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          functionName: functionName as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: args as any,
          account: address,
        });
      } catch (simErr) {
        if (describeWriteError(simErr).title !== "Network unreachable") throw simErr;
        console.warn(`[admin:${label}] pre-simulate skipped (RPC outage)`, simErr);
      }

      const hash = await writeContractAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: secudigateAbi,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        functionName: functionName as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args as any,
        chainId: SEPOLIA_ID,
      });

      toast.success(label, `Tx ${shortAddress(hash, 8, 6)} sent.`);
      onSuccess?.();

      publicClient
        .waitForTransactionReceipt({ hash })
        .then(() => onSuccess?.())
        .catch((err) => console.warn(`[admin:${label}] receipt poll failed`, err));

      return true;
    } catch (err) {
      const { title, body } = describeWriteError(err);
      toast.error(title, body);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy };
}

function PlatformSettings() {
  const { data: receiver, refetch: refetchReceiver } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "secudigate",
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS) },
  });
  const { data: feeBps, refetch: refetchFee } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "secudigateFeeBps",
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS) },
  });

  const [newReceiver, setNewReceiver] = useState("");
  const [newFeeBps, setNewFeeBps] = useState("");
  const { run, busy } = useAdminWrite();

  const receiverValid = newReceiver === "" || isValidAddress(newReceiver.trim());
  const feeBpsNum = Number(newFeeBps);
  const feeBpsValid =
    newFeeBps === "" ||
    (Number.isInteger(feeBpsNum) && feeBpsNum >= 0 && feeBpsNum <= MAX_PLATFORM_FEE_BPS);

  return (
    <Section title="Platform fee" description="The cut Secudigate (you) takes from every payment. Capped at 2.00%.">
      <dl className="grid grid-cols-2 gap-4 text-xs mb-5">
        <KV label="Current receiver">
          <span className="font-mono text-ink">{receiver ? shortAddress(receiver as `0x${string}`) : "—"}</span>
        </KV>
        <KV label="Current fee">
          <span className="font-mono text-ink">
            {feeBps !== undefined ? `${feeBps} bps (${(Number(feeBps) / 100).toFixed(2)}%)` : "—"}
          </span>
        </KV>
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="recv">New receiver</label>
          <input
            id="recv"
            spellCheck={false}
            className={`input font-mono text-xs ${newReceiver && !receiverValid ? "border-bad/60" : ""}`}
            placeholder="0x…"
            value={newReceiver}
            onChange={(e) => setNewReceiver(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost mt-2 text-xs py-1.5 w-full"
            disabled={busy || !receiverValid || newReceiver.trim() === ""}
            onClick={() =>
              run("Receiver updated", "setSecudigate", [newReceiver.trim() as `0x${string}`], () => {
                setNewReceiver("");
                refetchReceiver();
              })
            }
          >
            Update receiver
          </button>
        </div>

        <div>
          <label className="label" htmlFor="feebps">New fee (bps, 0–{MAX_PLATFORM_FEE_BPS})</label>
          <input
            id="feebps"
            inputMode="numeric"
            className={`input font-mono ${newFeeBps && !feeBpsValid ? "border-bad/60" : ""}`}
            placeholder="100"
            value={newFeeBps}
            onChange={(e) => setNewFeeBps(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost mt-2 text-xs py-1.5 w-full"
            disabled={busy || !feeBpsValid || newFeeBps.trim() === ""}
            onClick={() =>
              run("Fee updated", "setSecudigateFeeBps", [feeBpsNum], () => {
                setNewFeeBps("");
                refetchFee();
              })
            }
          >
            Update fee
          </button>
        </div>
      </div>
    </Section>
  );
}

function PauseToggle() {
  const { data: paused, refetch } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "paused",
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS) },
  });
  const { run, busy } = useAdminWrite();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isPaused = Boolean(paused);

  return (
    <Section
      title="Global pause"
      description="When paused, every pay / deposit / registerMerchant reverts with Pausable.EnforcedPause. Use only for incidents."
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className={`badge ${isPaused ? "badge-pending" : "badge-paid"}`}>
          {isPaused ? "Paused" : "Live"}
        </span>

        <button
          type="button"
          className={isPaused ? "btn-primary" : "btn-bad"}
          disabled={busy}
          onClick={() => (isPaused ? run("Unpaused", "unpause", [], refetch) : setConfirmOpen(true))}
        >
          {isPaused ? "Unpause" : "Pause gateway"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Pause the gateway?"
        message="All new payments, deposits, and merchant registrations will revert until you unpause. Existing balances are untouched."
        confirmLabel="Pause"
        destructive
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const ok = await run("Paused", "pause", [], refetch);
          if (ok) setConfirmOpen(false);
        }}
      />
    </Section>
  );
}

function PriceFeeds() {
  const tokens = getTokensForChain(SEPOLIA_ID);

  return (
    <Section
      title="Token price feeds"
      description="Chainlink USD aggregators used to convert each payment to USD for the per-payer daily cap. Without a feed, that token can only be paid by merchants with no daily cap."
    >
      <ul className="space-y-3">
        {tokens.map((t) => (
          <PriceFeedRow key={t.address} token={t} />
        ))}
      </ul>
    </Section>
  );
}

function PriceFeedRow({ token }: { token: StablecoinInfo }) {
  const { data, refetch } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "priceFeeds",
    args: [token.address],
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS) },
  });

  const tuple = data as readonly [`0x${string}`, number, number] | undefined;
  const feed = tuple?.[0];
  const tokenDec = tuple?.[1];
  const feedDec = tuple?.[2];
  const hasFeed = feed && feed !== "0x0000000000000000000000000000000000000000";

  const [newFeed, setNewFeed] = useState("");
  const { run, busy } = useAdminWrite();
  const newFeedValid = newFeed === "" || isValidAddress(newFeed.trim());

  return (
    <li className="rounded-xl border border-line bg-bg-soft/60 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: token.color }}
          >
            {token.symbol[0]}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium">{token.symbol}</div>
            <div className="text-[11px] text-ink-faint font-mono truncate">{token.address}</div>
          </div>
        </div>
        <div className="text-right text-[11px] text-ink-faint">
          {hasFeed ? (
            <>
              <div className="font-mono text-ink">{shortAddress(feed)}</div>
              <div>token {tokenDec}dp · feed {feedDec}dp</div>
            </>
          ) : (
            <span className="text-warn">No feed configured</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          spellCheck={false}
          className={`input font-mono text-xs ${newFeed && !newFeedValid ? "border-bad/60" : ""}`}
          placeholder="0x… (Chainlink aggregator)"
          value={newFeed}
          onChange={(e) => setNewFeed(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost text-xs whitespace-nowrap py-1.5"
          disabled={busy || !newFeedValid || newFeed.trim() === ""}
          onClick={() =>
            run(
              `${token.symbol} feed updated`,
              "setTokenPriceFeed",
              [token.address, newFeed.trim() as `0x${string}`],
              () => { setNewFeed(""); refetch(); },
            )
          }
        >
          Set
        </button>
        {hasFeed && (
          <button
            type="button"
            className="btn-bad text-xs whitespace-nowrap py-1.5"
            disabled={busy}
            onClick={() =>
              run(`${token.symbol} feed removed`, "removeTokenPriceFeed", [token.address], () => refetch())
            }
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function SanctionsOracle() {
  const { data: oracle, refetch } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "sanctionsList",
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS) },
  });
  const [newOracle, setNewOracle] = useState("");
  const { run, busy } = useAdminWrite();

  const oracleStr = oracle as `0x${string}` | undefined;
  const active = oracleStr && oracleStr !== "0x0000000000000000000000000000000000000000";
  const newOracleValid = newOracle === "" || isValidAddress(newOracle.trim());

  return (
    <Section
      title="Sanctions oracle"
      description="Chainalysis-compatible address that screens every payer and merchant on each pay/deposit. Set to the zero address to disable (e.g. for local Anvil)."
    >
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap text-xs">
        <div>
          <div className="text-ink-faint">Current</div>
          <div className="font-mono text-ink">{active ? oracleStr : "Disabled (0x0)"}</div>
        </div>
        <span className={`badge ${active ? "badge-paid" : "badge-expired"}`}>
          {active ? "Active" : "Off"}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          spellCheck={false}
          className={`input font-mono text-xs ${newOracle && !newOracleValid ? "border-bad/60" : ""}`}
          placeholder="0x… or 0x0000…0000 to disable"
          value={newOracle}
          onChange={(e) => setNewOracle(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost text-xs whitespace-nowrap py-1.5"
          disabled={busy || !newOracleValid || newOracle.trim() === ""}
          onClick={() =>
            run("Sanctions oracle updated", "setSanctionsList", [newOracle.trim() as `0x${string}`], () => {
              setNewOracle("");
              refetch();
            })
          }
        >
          Update
        </button>
      </div>
      <p className="text-[11px] text-ink-faint mt-2">
        Mainnet: <span className="font-mono">0x40C57923924B5c5c5455c48D93317139ADDaC8fb</span>
      </p>
    </Section>
  );
}

function AdminManagement({ self }: { self: `0x${string}` }) {
  const [lookup, setLookup] = useState("");
  const [addInput, setAddInput] = useState("");
  const [removeTarget, setRemoveTarget] = useState<`0x${string}` | null>(null);
  const { run, busy } = useAdminWrite();
  const toast = useToast();

  const lookupValid = lookup === "" || isValidAddress(lookup.trim());
  const addValid = isValidAddress(addInput.trim());

  const lookupAddr = useMemo(() =>
    (lookupValid && lookup.trim() !== "" ? (lookup.trim() as `0x${string}`) : undefined),
    [lookup, lookupValid],
  );

  const { data: lookupIsAdmin, isLoading: lookupLoading, refetch: refetchLookup } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "isAdmin",
    args: lookupAddr ? [lookupAddr] : undefined,
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS && lookupAddr) },
  });

  function handleRemoveSelf() {
    if (lookupAddr && lookupAddr.toLowerCase() === self.toLowerCase()) {
      toast.error(
        "Can't remove yourself this way",
        "Removing your own ADMIN_ROLE while still owner would only re-grant it via the next transferOwnership. Use renounceOwnership instead.",
      );
    }
  }

  return (
    <Section
      title="Admins"
      ownerOnly
      description="Holders of ADMIN_ROLE can manage platform settings, price feeds, and the sanctions oracle. They cannot edit merchant slots — that's owner-walled by design."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Look up</label>
          <input
            spellCheck={false}
            className={`input font-mono text-xs ${lookup && !lookupValid ? "border-bad/60" : ""}`}
            placeholder="0x…"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
          />
          {lookupAddr && (
            <div className="mt-2 text-xs">
              {lookupLoading ? (
                <span className="text-ink-faint">Checking…</span>
              ) : lookupIsAdmin ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-good">✓ Has ADMIN_ROLE</span>
                  <button
                    type="button"
                    className="btn-bad text-xs py-1 px-2"
                    onClick={() => { handleRemoveSelf(); setRemoveTarget(lookupAddr); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="text-ink-dim">No role</span>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">Grant admin to</label>
          <input
            spellCheck={false}
            className={`input font-mono text-xs ${addInput && !addValid ? "border-bad/60" : ""}`}
            placeholder="0x…"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost text-xs mt-2 w-full py-1.5"
            disabled={busy || !addValid}
            onClick={() =>
              run("Admin added", "addAdmin", [addInput.trim() as `0x${string}`], () => {
                setAddInput("");
                refetchLookup();
              })
            }
          >
            Grant ADMIN_ROLE
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Revoke ADMIN_ROLE?"
        message={
          <>
            This wallet will lose admin access:{" "}
            <span className="font-mono text-ink">{removeTarget ?? ""}</span>.
            If they still hold the owner role (you), the next transferOwnership
            will re-grant it.
          </>
        }
        confirmLabel="Revoke role"
        destructive
        busy={busy}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          const ok = await run("Admin removed", "removeAdmin", [removeTarget], () => {
            refetchLookup();
          });
          if (ok) setRemoveTarget(null);
        }}
      />
    </Section>
  );
}

function Ownership({ self }: { self: `0x${string}` }) {
  const [newOwner, setNewOwner] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [renounceOpen, setRenounceOpen] = useState(false);
  const { run, busy } = useAdminWrite();

  const newOwnerValid = isValidAddress(newOwner.trim());

  return (
    <Section
      title="Ownership"
      ownerOnly
      description="Transferring ownership moves both the owner role AND ADMIN_ROLE from you to the new wallet in one tx. Renouncing leaves the contract without an owner forever."
    >
      <dl className="grid grid-cols-1 gap-2 text-xs mb-5">
        <KV label="Current owner"><span className="font-mono text-ink">{shortAddress(self)} (you)</span></KV>
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="newowner">New owner</label>
          <input
            id="newowner"
            spellCheck={false}
            className={`input font-mono text-xs ${newOwner && !newOwnerValid ? "border-bad/60" : ""}`}
            placeholder="0x…"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost mt-2 text-xs w-full py-1.5"
            disabled={busy || !newOwnerValid}
            onClick={() => setTransferOpen(true)}
          >
            Transfer ownership
          </button>
        </div>

        <div>
          <label className="label">Permanent action</label>
          <button
            type="button"
            className="btn-bad text-xs w-full py-2.5"
            disabled={busy}
            onClick={() => setRenounceOpen(true)}
          >
            Renounce ownership
          </button>
          <p className="text-[11px] text-ink-faint mt-1.5">
            Other admins keep their role. No one can grant new admins after.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={transferOpen}
        title="Transfer ownership?"
        message={
          <>
            Ownership moves to{" "}
            <span className="font-mono text-ink">{newOwner.trim() || "—"}</span>.
            They gain admin role; you lose both. This is reversible only if the
            new owner transfers it back.
          </>
        }
        confirmLabel="Transfer"
        destructive
        busy={busy}
        onCancel={() => setTransferOpen(false)}
        onConfirm={async () => {
          const ok = await run("Ownership transferred", "transferOwnership", [newOwner.trim() as `0x${string}`]);
          if (ok) {
            setNewOwner("");
            setTransferOpen(false);
          }
        }}
      />

      <ConfirmDialog
        open={renounceOpen}
        title="Renounce ownership forever?"
        message={
          <>
            <strong>This is permanent and irreversible.</strong> The contract
            will have no owner. Existing admins keep their role but no new
            admins can be added, and the role cannot be revoked. The platform
            fee setter and pause control remain in the hands of remaining
            ADMIN_ROLE holders.
          </>
        }
        confirmLabel="Renounce"
        typedConfirmation="RENOUNCE"
        destructive
        busy={busy}
        onCancel={() => setRenounceOpen(false)}
        onConfirm={async () => {
          const ok = await run("Ownership renounced", "renounceOwnership", []);
          if (ok) setRenounceOpen(false);
        }}
      />
    </Section>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-faint uppercase tracking-widest">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
