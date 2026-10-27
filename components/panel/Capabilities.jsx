"use client";
// components/panel/Capabilities.jsx — what this person may do, for hiding buttons (not for security: the server asks again on every action).
// Without a provider (tests, a screen rendered outside the panel layout) nothing is hidden; the server still refuses.
import { createContext, useContext } from "react";

const Ctx = createContext(null);

export function CapabilitiesProvider({ value, children }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// "direct" | "approval" | "denied"
export function useMode(operation) {
  const caps = useContext(Ctx);
  if (!caps) return "direct";
  return caps[operation] || "denied";
}
// may the person try this at all (directly or through the approval queue)?
export const useCan = (operation) => useMode(operation) !== "denied";
// the same for several operations at once: every one must be possible
export function useCanAll(operations) {
  const caps = useContext(Ctx);
  if (!caps) return true;
  return operations.every((o) => (caps[o] || "denied") !== "denied");
}
