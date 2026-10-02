# Preview 9: playing-disc appearance

## Scope

Authorized cosmetic follow-up to accepted preview 8 (`425b35eb3a73663e55c1210deda8e0d821c0f827`). Stained wood and poker-chip faces; Classic, Jewel, Pastel and Earth color sets; per-player printed Star, Spade, Leaf, Moon and Bolt emblems or no emblem; per-player local pictures with editable circular zoom/pan crops. The cream rotation dash is removed. No engraving or raised decoration.

Faces use flat Canvas2D textures on the existing flat lathe face, with depth bias instead of extra height. They inherit the disc's axial rotation and tilt. At most four owner textures are cached; superseded textures/materials and removed disc-local materials are disposed.

Appearance preferences use `crokinole-disc-appearance-v1`; pictures use the separate `crokinole-disc-images` IndexedDB database. Match saves remain `crokinole-match-spin-v2`; board artwork storage is unchanged. Pictures are processed locally, retain a resized source for reframing, and are not uploaded. Clearing browser site data removes them; no cross-device sync is provided.

## Protected behavior and provenance

- All 16 other baseline `src` files are byte-identical to accepted preview 8. Only existing `src/main.ts`, `src/style.css` and `src/render/scene.ts` change; four new appearance/UI/storage/render modules are added.
- `main.ts` adds only the settings import and initialization. Game, input, simulation, audio, save/migration and board-artwork modules do not change.
- The lathe dimensions, camera/orbit/picking code, disc motion/settling transforms and board rendering formulas remain unchanged. Printed-face material/children and resource cleanup are the renderer changes.
- `docs/disc-design-approved.json` independently pins the seven reviewed cosmetic source files. The physics verification tool requires the explicit `disc-appearance` policy and validates that manifest's hash before allowing cosmetic differences. The old default whole-source policy rejects them; unknown policies are rejected. Existing spin/hop manifests and physics goldens are not regenerated or relaxed.

## Verification completed

- `npm test`: **257 passed** across **28 files**, including explicit latest-preference/owner-merge regressions.
- `npm run build`: TypeScript and production Vite build pass. The existing >500 kB minified-chunk warning remains.
- `git diff --check`, staged diff checks and JS syntax checks pass.
- Independent direct comparison to preview 8 confirms the 16 unchanged source files and the two-line `main.ts` addition.
- `node scripts/physics-integrated-equivalence.mjs`: 34,944 baseline launch comparisons; 292 gesture comparisons; 72 actual/reference simulation comparisons over 8,851 frames; 32 signed-contact cases at production/fine timesteps, all finite and settled. The tool's counterfactual and actual-candidate profiles remain explicitly distinct.
- `node scripts/probe-integrated-followup.cjs`: existing spin/hop/settling probes pass with the explicit cosmetic provenance policy. Local full outputs are retained under ignored `disc-designs.local/`.
- Corrected `tests/browser-discs.mjs` passes: both styles/all palettes; independent owner emblems; reload and unchanged match discs/scores/phase; real file chooser; native keyboard/mouse zoom/pan; two independent pictures; reframe/Escape cancellation; IndexedDB write failure; localStorage preference failure warning; retaining pictures when choosing emblems; reuse and scoped removal; phone/short/landscape layouts and native touch panning; unsupported-file rejection and preservation of corrupt saved data; no runtime exceptions.

## Final browser results

- The serialized full artwork/winner/round/input/spin browser regression and full **46-case** seated aiming regression completed with runner **exit 0** on immutable snapshot `1c67e635ca68034032f677cd09bde57097036592` (103 tracked files). Its recorded file hashes remain exact. Artwork migration/failure/removal, winners, all-mode mobile round advancement, mouse/laptop/phone gestures, top-face picking, pause/reload and resumed settling pass.
- A final read-only review found a stale-tab photo overwrite: saving an owner from a startup snapshot replaced every owner's shared record. Saves/removals now merge only the target owner in a serialized IndexedDB read/write transaction. Preference changes read the latest valid record and apply only the explicit style/palette/owner choice; transient choices survive failed preference writes.
- The revised native settings/photo suite passed with **exit 0** on snapshot `0ca3d89a40ab34409701b21ad668bcc011bbcd71` (105 tracked files). It opens a real second tab before either upload, saves Red and Blue from stale independent UI snapshots, and preserves both pictures and face selections. Concurrent database writes/removals retain other owners. Quota failures and corrupt-record rejection preserve prior data. All original crop/layout/error checks also pass.
- Actual WebGL checks passed **20 cases, exit 0** on visible-fixture snapshot `a213d3179b7b061750373eec044ab3c645d18449` (105 tracked files): desktop/phone dimensions, both styles/all palettes, all four owners, inherited axial rotation, seated photos and bounded texture allocation. Screenshots were inspected for flat printed faces, grain, crop orientation and missing/depth-striped disc textures. The initial render assertions passed but screenshots were obscured by the pause dialog; those captures are not visual evidence. The corrected test closes only that backdrop and asserts fixture visibility before capturing.
- Only `src/disc-appearance.ts`, `src/disc-settings.ts` and `src/storage/disc-images.ts` changed after the broad game/aim snapshot, for the reviewed owner-safe persistence fix. Final photo/renderer checks exercise those changes. Game/input/physics, `main.ts`, CSS and both renderer modules remain byte-identical to the passed broad regression. Dependency resolution is unchanged apart from package-version fields.

Local logs, snapshot receipts, probe outputs and image evidence are retained under ignored `disc-designs.local/`. Publication verification is a separate final step against the normal URL and referenced production assets; local test success alone is not a live deployment.

The first new-settings browser attempt failed during temporary-profile cleanup, masking the original error. The second exposed a real focus bug: clicking the crop canvas prevented default focus, so arrow keys still changed the zoom slider (4 became 3.99) instead of panning. Explicitly focusing the canvas fixes the native regression. Cleanup now waits for Chrome exit and retries transient profile removal. Both failed attempts remain failures.

## Human playtest boundary and rollback

Browser checks use isolated storage and emulated phone dimensions/touch, not Frank's saved table or a physical phone. Physical-device appearance/readability remains a human playtest; preview 8's accepted feel is intentionally preserved. No measured real-board calibration is claimed.

Preview 8 is preserved as `crokinole-v0.3.0-strike-preview.8`. After publication, `crokinole-v0.3.0-disc-designs-preview.9` identifies the cosmetic release. Revert that release commit, verify and push to restore the old rendering without reverting spin/contact tuning or deleting appearance data. Do not reset history, move tags, clear site data or sweep unrelated local reviews/artwork into the release.
