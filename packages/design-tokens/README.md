# Folio design-token provenance

source/figma.json is the live read-only MCP snapshot of 49 variables across three collections and eight text styles. Generate from the two canonical collections: 23 semantic colors in Dark/Light modes and 17 dimensions. The nine legacy compatibility variables remain provenance and are not exported.

source/components.json contains all 119 inspected variants. Each row is:
[id, parentId, propertyString, width, height, gap, paddingTRBL, radius, strokeWeight, fillVariableId, strokeVariableId, firstTextVariableId].
firstTextVariableId is an observation, not a guarantee that every descendant has that role. Shared primitives assign their inspected child roles explicitly. Null strokeWeight means mixed/edge-specific strokes; selected navigation supplies its observed 2 px left border.

source/families.json lists 26 component families. source/geometry.json records shell/child/table literal geometry and source-node provenance. Breakpoints 1024/720 are derived under D14 and require design review.

Run pnpm tokens:sync to regenerate tokens.css, components.css, tailwind.css, manifest.json, and the theme variants of multi-color SVGs. Run pnpm tokens:check to detect stale output. No generator connects to or modifies Figma; refresh source data only from a new read-only MCP inspection with provenance.

Original downloaded SVG paths remain unchanged. Multi-color radio/switch Light assets map only exact known Dark semantic literals to their corresponding Light variables; paths/viewboxes are retained. Monochrome icons use the original asset as a CSS mask, with existing semantic roles. New colors, fonts, glyphs, or spacing patterns are not introduced.

Accessible aliases preserve the exported source palette and substitute stronger existing text roles when the measured minimum across used neutral surfaces is below 4.5. manifest.json records each alias, role and contrast. Disabled controls preserve the original disabled role. Decorative borders retain the design palette; automated axe success is not a claim that every unmeasured non-text pair or touch target has been independently certified.

The gallery composition, unavailable wording, native semantics/focus behavior, derived Light shell and responsive layouts are review extensions documented in DESIGN_HANDOFF.md.
