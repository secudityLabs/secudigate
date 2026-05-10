import { Link } from "react-router-dom";

export default function Security() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-2">
      <header className="mb-10">
        <div className="text-xs uppercase tracking-widest text-brand-soft">Disclosure policy</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Security</h1>
        <p className="mt-3 text-sm text-ink-dim leading-relaxed">
          Secudigate runs an open-source, non-custodial payment contract.
          We take responsible disclosure seriously and welcome reports from
          the security community.
        </p>
      </header>

      <Section title="Reporting a vulnerability">
        <p>
          Email{" "}
          <a className="underline text-brand-soft hover:text-ink" href="mailto:security@secudigate.com">
            security@secudigate.com
          </a>
          {" "}with a clear description of the issue, reproduction steps, and
          (where applicable) impact. Encrypt with our PGP key if the report
          contains exploit details.
        </p>
        <p className="mt-2">
          We aim to acknowledge new reports within 48 hours and provide a
          remediation timeline within 5 business days. Please give us a
          reasonable window to fix the issue before public disclosure.
        </p>
      </Section>

      <Section title="Scope">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <code>Secudigate.sol</code> and any contracts it deploys
            (mocks deployed alongside it on Sepolia included).
          </li>
          <li>The hosted dashboard, pay, and deposit pages on this domain.</li>
          <li>The webhook dispatcher and chain indexer in the public repo.</li>
        </ul>
      </Section>

      <Section title="Out of scope">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Issues affecting third-party RPC providers or wallets we depend on.</li>
          <li>Findings against Sepolia mock tokens (the faucet is intentionally open).</li>
          <li>Spam or abuse of the demo site that does not lead to fund loss.</li>
          <li>Self-XSS, social engineering, or attacks requiring a fully compromised victim wallet.</li>
        </ul>
      </Section>

      <Section title="Severity bands (informal)">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className="py-2 pr-4 font-medium">Severity</th>
              <th className="py-2 pr-4 font-medium">Examples</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="py-2 pr-4 align-top text-bad">Critical</td>
              <td className="py-2 pr-4">Funds drained from any party in the routing path; bypass of platform-fee cap; takeover of any merchant slot.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 align-top text-warn">High</td>
              <td className="py-2 pr-4">Bypass of daily-limit / sanctions checks; reentrancy escapes; price-feed manipulation that misroutes funds.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 align-top text-ink">Medium</td>
              <td className="py-2 pr-4">Webhook signature bypass; indexer-DoS; RPC-side state desync that survives cache invalidation.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 align-top text-ink-dim">Low</td>
              <td className="py-2 pr-4">UI inconsistencies, cosmetic bugs, denial-of-service against the demo dashboard only.</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Safe harbor">
        <p>
          Good-faith research conducted under this policy will not result in
          legal action. To stay in good faith: don't access data you don't
          own, don't drain non-test funds, don't keep exploit details to
          yourself once we've patched, and don't publish before coordinated
          disclosure.
        </p>
      </Section>

      <Section title="Other resources">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Source:{" "}
            <a className="underline text-brand-soft hover:text-ink" href="https://github.com/" target="_blank" rel="noreferrer">
              github.com/secudigate
            </a>
          </li>
          <li>
            Docs: <Link to="/docs" className="underline text-brand-soft hover:text-ink">/docs</Link>
          </li>
          <li>
            Contract on Sepolia: see {" "}
            <code>VITE_PAYMENT_GATEWAY_ADDRESS</code> in the README.
          </li>
        </ul>
      </Section>

      <p className="text-[11px] text-ink-faint mt-12">
        This policy is provided as-is. It does not create a legal contract
        or warranty. Last reviewed: {new Date().toISOString().slice(0, 10)}.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="text-base font-semibold mb-2.5">{title}</h2>
      <div className="text-sm text-ink-dim leading-relaxed">{children}</div>
    </section>
  );
}
