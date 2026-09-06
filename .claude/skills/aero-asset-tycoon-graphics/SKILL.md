---
name: aero-asset-tycoon-graphics
description: >-
  Generate and catalog game art for Aero Asset Tycoon: founder portraits,
  the Office HQ standing-desk scene and its parallax layers, facility and
  map icons, seasonal sky plates, the pulse wheel face, event and easter-egg
  cards, and UI textures. Use whenever the game needs a new image, an
  existing asset needs a variant, or the shot list in references/shot-list.md
  has unfilled rows. Wraps the block-aero-brand-imagery workflow (Gemini via
  Chrome automation) with a game-specific style bible, naming, and manifest.
---

# Aero Asset Tycoon graphics

Every image in `public/assets/` is produced through this skill so the game
reads as one world. Generation itself runs through the
`block-aero-brand-imagery` skill (Gemini web app driven from a desktop
Claude session with Chrome automation). This skill supplies what that
workflow needs: the style block, the guardrails, the shot list, the names,
and the catalog step.

## Style bible (paste as the STYLE BLOCK)

Aero corporate, near-future, quietly premium. Graphite, warm white, brushed
aluminum, and one accent: Block Aero blue. Navigation-light red and green
appear only as small status indicators. Soft global illumination, long
shadows, a little haze. Clean geometry, no clutter, no sustainability or
solarpunk cues (no living walls, no foliage, no solar panels as a motif).
Painterly-digital finish, not photoreal, not cartoon. Think a Civilization
leader screen designed by an aviation asset manager.

## Guardrails (paste as the GUARDRAILS block)

- No text, numbers, logos, or lettering in the image. UI text is rendered by the app.
- No real airline liveries, real OEM logos, or identifiable real people.
- No flight boards, departure schedules, or passenger scenes. We manage assets; we do not fly them.
- Portraits: neutral business attire, shoulders up, consistent 3/4 lighting, plain graphite backdrop, same camera distance across the set.
- Scenes: camera height about 1.4 m, 35 mm equivalent, horizon in the lower third.
- Deliver at the ratio in the shot list. Leave 8% safe margin on all edges.

## Pipeline

1. Pick the next unfilled row in `references/shot-list.md`.
2. Build the flattened prompt: STYLE BLOCK + GUARDRAILS + the row's prompt from `references/prompt-templates.md`.
3. Generate through `block-aero-brand-imagery`. Verify against the row's acceptance note. Regenerate on a concept miss; retouch on a quality glitch.
4. Remove the watermark per the brand-imagery skill. Export webp, quality 82, at the target size.
5. Save as `public/assets/<role>-<variant>.webp` using the row's file name exactly.
6. Append or update the row in `public/assets/manifest.json` (`id`, `file`, `role`, `ratio`, `w`, `h`, `prompt_id`, `generated_at`).
7. Mark the row done in the shot list with the date.

## Naming

`<role>-<variant>.webp`, lower-case, hyphenated. Roles: `founder`, `hq`,
`facility`, `region`, `sky`, `wheel`, `card`, `texture`. Variants are
descriptive, never numbered (`founder-asian-woman`, not `founder-3`).
