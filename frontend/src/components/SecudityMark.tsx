// Renders the Secudity parent-brand logo from /public/logo.png at the same
// visible scale as the Secudigate mark in the navbar: a 36×36 (h-9 w-9)
// outer box with internal padding so the glyph doesn't fill edge-to-edge.
// Keeps the two marks visually consistent across header and footer.
export default function SecudityMark({ className = "h-9 w-9 " }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Secudity"
      className={`${className} object-contain p-1.5 py-1.5 pl-3 pr-0 -mr-1`}
      draggable={false}
    />
  );
}
