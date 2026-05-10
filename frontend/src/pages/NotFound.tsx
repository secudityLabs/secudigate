import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="text-6xl font-bold tracking-tight text-ink-faint">404</div>
      <p className="mt-3 text-ink-dim">That page does not exist.</p>
      <Link to="/" className="btn-ghost mt-6 inline-flex">Back home</Link>
    </div>
  );
}
