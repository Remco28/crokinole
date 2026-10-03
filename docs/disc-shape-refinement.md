# Disc shape and stained-wood refinement

Cosmetic follow-up to `9ae37e2b230856bd54bc1e6c8f9ddb0624db3417` (the live preview-9 disc release).

## Approved visual changes

- Retain the standard 1.25-inch diameter and 0.375-inch thickness, flat face/contact footprints, and accepted simulation/input behavior.
- Bow the rendered sidewall continuously rather than using a straight middle cylinder. `makeVisualDiscGeometry` is render-only; the prior geometry reference and all collision constants remain exact.
- Remove the wood face's artificial ring, solid owner border, radial baked shading and bold knot/bands. Use fine, gently wandering, low-contrast grain over the selected stain.
- Generate an unprinted body texture with the same stain/grain coordinates as the wood face. Map the grain continuously across the rounded shoulder. Face and body use the same finish; actual lighting supplies shading. Do not duplicate photos or emblems onto sidewalls.
- Preserve poker printing, local pictures/crops, owner choices and saved matches. Cache at most four owner looks (four face textures plus at most four wood-body textures); dispose superseded textures and shared geometry correctly.

## Verification completed

- `npm test`: 259 tests across 28 files pass. New tests cover exact size/flat footprints, bowed visual profile, projected body/face coordinates, wood-without-rim, bounded grain opacity, style switching and body-texture disposal.
- `npm run build`: TypeScript and production build pass. Existing chunk-size warning remains.
- `git diff --check` and changed runner syntax checks pass.
- Independent reviewer identified only stale cosmetic provenance hashes. Both reviewed renderer hashes and the cosmetic-manifest checksum were updated; no physics slice manifest, golden or assertion was relaxed.
- Every other source file is byte-identical to the preview-9 release. The existing preview-8 boundary tests still verify physics, game/input/audio/storage, camera/picking and render-clock invariance.
- Actual WebGL suite: 24 cases pass, including desktop/phone, both styles, all palettes, owner texture/rotation checks, seated photos and low-angle closeups. Screenshots inspected: solid-piece stain, continuous round shoulders, no face ring, legible photo/emblem/poker printing, no missing/z-fighting face textures. Additional body maps stay within the existing ten-live-GPU-texture bound.
- The first face/body pixel comparison incorrectly required byte-exact clipped/unclipped Canvas compositing. Direct probes across all palettes demonstrated a maximum two-channel-byte rounding difference at the sampled grain points. The corrected assertion requires opaque matching pixels within that measured tolerance; texture coordinates and stain colors are independently checked.

## Final browser regression

- The serialized full game, aiming and native settings/photo suite completed with runner exit 0. Full gameplay checks include artwork migration/failures, winner flows, all-mode responsive round progression, desktop/laptop/phone gestures, visible top/rim picking, cancellation, pause/reload and resumed settling.
- All 46 aiming cases completed. Native settings/photo checks include both styles/all palettes, reload with unchanged matches, two stale tabs saving separate owners, real file selection, keyboard/mouse/touch crops, reframing/cancellation, quota failures, removal/reuse and corrupt-record preservation. No runtime exceptions were reported.
- All tracked candidate input hashes remain exact across the completed runs. An earlier foreground run hit the tool timeout after partial game checks and is not a full pass; the successful tracked background run supersedes it. Logs and screenshot receipts are retained in ignored `disc-designs.local/wood-refinement/` and the scratch verification directory.

## Publication boundary and rollback

Publication requires the normal URL's HTML and referenced production assets to match this verified build, plus a live browser smoke check in isolated storage. The preview-9 tag remains the independently reversible visual baseline; revert only this refinement commit to restore its rendering without deleting pictures or changing accepted physics. Physical-phone appearance is a human check; no physical-board calibration is claimed.
