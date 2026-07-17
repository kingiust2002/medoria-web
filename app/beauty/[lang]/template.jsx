// app/beauty/[lang]/template.jsx — soft opacity fade between Beauty route
// changes (opacity-only, so it never leaves a transform that would break
// position:fixed children like modals or the floating WhatsApp button).
"use client";
import { motion } from "framer-motion";

export default function Template({ children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
