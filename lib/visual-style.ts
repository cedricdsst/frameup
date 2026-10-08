// Adapted from stikman_generator/general_style.md and server.js.
// Keep its MS Paint aesthetic without imposing its recurring stickman character.
export const STICKMAN_STYLE = `
Draw in an extremely simple beginner MS Paint style, as if drawn quickly with a computer mouse by someone with very little drawing experience.
Use thick uneven black outlines, wobbly imperfect hand-drawn lines, basic geometric shapes and intentionally clumsy proportions.
Use flat colors only: occasional green, brown, gray, red, yellow, orange or blue. Keep minimal details, a clear centered subject and generous empty transparent space around it.
The result must feel amateur, funny, childish and intentionally badly drawn, while the subject remains instantly recognizable.
No shading, gradients, realistic or cinematic lighting, 3D, photorealism, realistic materials, detailed textures, professional vector art, polished illustration, smooth perfect outlines, glossy design, Disney or anime style, complex scenery or unnecessary decoration.
Illustrate the requested objects or scene. Do not add stickmen or people unless the subject actually needs them. The preset defines the drawing style, not the subject.
Keep a real transparent alpha background; never paint white space or a checkerboard to represent transparency.
`.trim();

export function planningStyleRules(stickmanStyle: boolean) {
  return stickmanStyle
    ? `MANDATORY SELECTED VISUAL STYLE:\n${STICKMAN_STYLE}\nThis selected style replaces any conflicting style in the brief, outline or default instructions. Apply it to sharedPrompt and every card prompt. For the title, use simple wobbly hand-drawn lettering with flat colors, while keeping the exact words highly legible.`
    : "";
}

export function mergeCardPrompt(prompt: string, legacyStyle?: string) {
  return [prompt.trim(), legacyStyle?.trim()].filter(Boolean).join("\n\n");
}
