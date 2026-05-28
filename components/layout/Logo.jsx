// components/layout/Logo.jsx
export default function Logo({ size = 36, showText = true, white = false }) {
  return (
    <div className="flex items-center gap-2.5 group">
      <img
        src="/logo.png"
        alt="Medoria"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        className="shrink-0 drop-shadow-sm transition-transform group-hover:scale-105"
      />
      {showText && (
        <span
          className={`font-display text-[20px] font-extrabold tracking-tight ${
            white ? "text-white" : "text-ink"
          }`}
        >
          Medoria
        </span>
      )}
    </div>
  );
}
