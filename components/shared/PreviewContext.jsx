// components/shared/PreviewContext.jsx — the private preview of a product (N5) renders the REAL public page components inside this provider.
// Inside it nothing may leave the browser as if a visitor did it: no view is counted, no request is sent, nothing is added to the visitor's
// compare / wish / inquiry lists. Outside it (every public page) the hook answers false and nothing changes.
"use client";
import { createContext, useContext } from "react";

const Ctx = createContext(false);
export function PreviewProvider({ children }) { return <Ctx.Provider value={true}>{children}</Ctx.Provider>; }
export const usePreview = () => useContext(Ctx);
