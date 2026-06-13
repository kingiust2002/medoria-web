// components/gateway/Nexus.jsx
// Central Medoria marque resting on the split axis (desktop only). Decorative
// anchor for the divide — the accessible brand + choice already live in the
// header and the two worlds, so this is aria-hidden and lg-only.
import Lockup from "@/components/layout/Lockup";

export default function Nexus() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
    >
      <div className="v-glass rounded-full px-5 py-3 shadow-[0_22px_60px_-26px_rgba(15,23,42,0.4)]">
        <Lockup size={22} />
      </div>
    </div>
  );
}
