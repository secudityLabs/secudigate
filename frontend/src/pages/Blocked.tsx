interface BlockedProps {
  country: string;
}

export default function Blocked({ country }: BlockedProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 w-12 h-12 rounded-2xl bg-bad/10 border border-bad/30 flex items-center justify-center text-bad">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Service unavailable in your region</h1>
        <p className="mt-3 text-sm text-ink-dim leading-relaxed">
          Secudigate is not available to users connecting from
          {" "}
          <span className="font-mono text-ink">{country}</span>
          {" "}
          due to applicable sanctions and export-control regulations
          (OFAC, EU, UN). The protocol's smart contracts remain public on
          Ethereum; this hosted front-end does not service comprehensive-embargo
          jurisdictions.
        </p>
        <p className="mt-3 text-[11px] text-ink-faint leading-relaxed">
          If you believe you've reached this page in error, the geolocation may
          have misidentified your network. Contact{" "}
          <a className="underline" href="mailto:security@secudigate.com">security@secudigate.com</a>
          {" "}with your IP and we'll investigate.
        </p>
      </div>
    </div>
  );
}
