"use client";
// components/gateway/GatewayStage.jsx — orchestrates the split. Holds which
// world the pointer (or keyboard focus) is in and exposes it as
// [data-gw-active] so CSS can dim/desaturate the other world and lean the
// seam's hue (see GATEWAY v3 in globals.css). Renders both panels + the seam;
// everything inside is server-renderable HTML that hydrates quietly.
import { useState } from "react";
import WorldPanel from "./WorldPanel";
import HealthScene from "./HealthScene";
import BeautyScene from "./BeautyScene";
import Seam from "./Seam";

export default function GatewayStage({ copy, defaultLang, langs, langLabels }) {
  const [active, setActive] = useState(null);

  return (
    <div
      data-gw-active={active || undefined}
      className="gw-stage relative z-10 flex flex-1 flex-col lg:flex-row"
    >
      <WorldPanel
        vertical="health"
        side="left"
        scene={<HealthScene />}
        edgeLabel="CLINICAL · HEALTH"
        chip={copy.health.chip}
        tagline={copy.health.tagline}
        cta={copy.health.cta}
        defaultLang={defaultLang}
        langs={langs}
        langLabels={langLabels}
        onActive={setActive}
      />

      {/* stacked-mobile hairline between the worlds */}
      <div
        aria-hidden="true"
        className="h-px w-full lg:hidden"
        style={{ background: "linear-gradient(90deg, transparent, rgba(15,23,42,0.14), transparent)" }}
      />

      <WorldPanel
        vertical="beauty"
        side="right"
        scene={<BeautyScene />}
        edgeLabel="BEAUTY · LUXURY"
        chip={copy.beauty.chip}
        tagline={copy.beauty.tagline}
        cta={copy.beauty.cta}
        defaultLang={defaultLang}
        langs={langs}
        langLabels={langLabels}
        onActive={setActive}
      />

      <Seam />
    </div>
  );
}
