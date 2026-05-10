// Secudigate brand mark — the full product logo (blue 3D S with arrows).
// Used as the fallback wherever a merchant hasn't configured their own
// logo / business name yet (pay page, deposit page, dashboard preview),
// and anywhere else the brand needs to render at avatar size.
//
// Note: we deliberately use /logo-secudigate.png here, NOT /favicon.svg.
// The favicon is the simplified S-mark optimized to read at 16×16 in a
// browser tab; this file is the proper logomark that should appear in
// the product chrome.
export default function SecudigateMark({
  className = "h-7 w-7",
}: {
  className?: string;
}) {
  // Source PNG extends edge-to-edge in its own bounds. Wrap it in a
  // plate with generous inner padding so the mark sits comfortably
  // inside small avatar slots; the plate also gives it a subtle outline
  // that helps it read on busy headers.
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-md bg-bg-soft border border-line/60 shrink-0 overflow-hidden`}
    >
      <img
        src="/logo-secudigate.png"
        alt="Secudigate"
        className="h-[90%] w-[90%] object-contain"
        draggable={false}
      />
    </span>
  );
}
