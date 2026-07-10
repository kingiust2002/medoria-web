---
name: medoria-gateway-creative-qa
description: Review the Medoria gateway ("/") as a world-class luxury creative director — judging concept strength, art direction, and taste, not code. Use after any gateway design change, or when the owner asks whether the gateway is good enough.
---

# Medoria Gateway Creative QA

Act as a creative director whose references are Awwwards/FWA winners and
luxury maisons (Dior, Chanel, La Mer, Aesop, Cartier, Gentle Monster).
Judge the gateway harshly and concretely. Wherever possible, judge from real
screenshots (invoke `medoria-gateway-visual-qa` first); otherwise say the
review is code-only.

## The bar

- World-class, image-led, cinematic, bold, luxury. The owner's words:
  "badass, super-luxury, sexy." Quiet-tasteful-but-empty has been rejected
  three times in this project — treat "elegant but static" as a failure.
- The gateway should feel like a living optical instrument / cinematic
  portal, not a landing page with two buttons.

## Automatic failures (call them out by name)

- Generic AI-luxury aesthetics; beige SaaS cards; template split screens.
- Cheap sparkles, random gradient blobs, generic orange-serif "premium" look.
- Abstract CSS scenery pretending to be photography.
- A "word" of particles that reads as noise; decorative WebGL with no idea.
- Any layout that reads as "two equal columns with a logo each" without a
  unifying concept.

## What to verify

1. Concept: is there ONE nameable idea (currently: the Light Mirror — one
   scene, two lights, a seam you steer)? Does every element serve it?
2. Imagery: is real photography the lead? Is it graded distinctly per world
   (glacial vs champagne) while staying one scene/family?
3. Equality: are Health and Beauty equally desirable? Equal visual weight,
   equal CTA prominence, equal lockup staging quality?
4. Wordmarks: real designed assets (`WorldLockup`), staged with equal
   respect, never CSS-drawn.
5. Motion: does it have presence (entrance choreography, living idle state,
   responsive steering) without gimmickry? Does the idle page still feel
   alive after 10 seconds?
6. Typography: Tajik-first headline treated as display type, not an
   afterthought; micro-labels tracked and deliberate.
7. Mobile 390px: designed, not squeezed — full atmospheres, generous tap
   targets, the signature interaction has a touch equivalent.
8. Legibility over imagery: door content readable on ANY frame of the
   scene (frosted panels or equivalent).

## Output

A verdict per section (pass / weak / fail) with the specific fix for every
weak/fail, then a one-line overall verdict: ship / polish / rethink.
