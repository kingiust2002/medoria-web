// app/providers.jsx — client-side providers (theme + smooth scroll).
"use client";
import { ThemeProvider } from "next-themes";
import SmoothScroll from "@/components/shared/SmoothScroll";

export function Providers({ children }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <SmoothScroll />
      {children}
    </ThemeProvider>
  );
}
