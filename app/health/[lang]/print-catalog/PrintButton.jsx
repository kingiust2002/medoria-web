// The only client code of the printable catalog: a button that opens the browser's print dialog
// ("Save as PDF" is one of its destinations).
"use client";

export default function PrintButton({ label }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary size-md">
      {label}
    </button>
  );
}
