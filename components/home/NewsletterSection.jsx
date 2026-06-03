// components/home/NewsletterSection.jsx — newsletter signup band.
"use client";
import NewsletterForm from "@/components/shared/NewsletterForm";
import { Reveal } from "@/components/shared/Reveal";

export default function NewsletterSection({ lang }) {
  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="relative overflow-hidden rounded-[2rem] gradient-border p-8 md:p-12 max-w-3xl mx-auto">
          <div className="blob w-[30vw] h-[30vw] -top-1/2 -end-[10%] animate-aurora"
               style={{ background: "radial-gradient(circle, rgba(139,47,247,0.12) 0%, transparent 70%)" }} />
          <div className="relative">
            <NewsletterForm lang={lang} center />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
