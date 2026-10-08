import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const nativeRequire = createRequire(import.meta.url);
const json = (value, options = {}) => Response.json(value, options);

// Execute the real TypeScript routes, replacing only framework bindings and
// external dependencies. No OpenAI calls or writes to existing projects.
function loadModule(relative, { fetch = () => { throw new Error("Unexpected network request"); }, store, cwd = root } = {}, cache = new Map()) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  cache.set(file, module.exports);
  function requireDependency(name) {
    if (name === "next/server") return { NextResponse: { json } };
    if (name === "server-only") return {};
    if (store && name.endsWith("/project-store")) return store;
    if (name.startsWith(".")) {
      return loadModule(path.relative(root, path.resolve(path.dirname(file), `${name}.ts`)), { fetch, store, cwd }, cache);
    }
    return nativeRequire(name);
  }
  new Function("require", "module", "exports", "fetch", "process", source)(
    requireDependency, module, module.exports, fetch,
    { env: { OPENAI_API_KEY: "test-key-never-sent" }, cwd: () => cwd },
  );
  return module.exports;
}

function request(payload) {
  return new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

const outline = {
  videoTitle: "Cultiver des tomates", count: 1, concept: "Planter facilement",
  titleStyle: "Lettres lisibles", sharedImageStyle: "Couleurs plates",
  parts: [{ title: "La plantation", purpose: "Montrer un pot et une jeune pousse" }],
};

test("the selected Paint style reaches both planning stages and cards need only one prompt", async () => {
  const calls = [];
  const route = loadModule("app/api/plan/route.ts", { fetch: async (_url, options) => {
    const call = JSON.parse(options.body);
    calls.push(call);
    const value = calls.length === 1 ? outline : {
      titlePrompt: "Titre dessiné à la souris", sharedPrompt: "Dessin Paint naïf",
      cards: [{ title: "La plantation", prompt: "Un pot rouge avec une petite pousse verte." }],
    };
    return json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
  } });
  const first = await route.POST(request({ stage: "outline", brief: "Cultiver des tomates", stickmanStyle: true }));
  assert.equal(first.status, 200);
  const second = await route.POST(request({ stage: "details", brief: "Cultiver des tomates", outline: (await first.json()).outline, stickmanStyle: true }));
  assert.equal(second.status, 200);
  for (const call of calls) {
    assert.match(call.input[0].content, /beginner MS Paint/);
    assert.match(call.input[0].content, /Do not add stickmen or people unless/);
  }
  const schema = calls[1].text.format.schema.properties.cards;
  assert.equal(schema.minItems, 1);
  assert.equal(schema.maxItems, 1);
  assert.deepEqual(schema.items.required, ["title", "prompt"]);
  const { plan } = await second.json();
  assert.equal(plan.title, outline.videoTitle);
  assert.equal(plan.cards[0].style, "");
});

test("standard planning does not force the Paint preset", async () => {
  let instructions;
  const route = loadModule("app/api/plan/route.ts", { fetch: async (_url, options) => {
    instructions = JSON.parse(options.body).input[0].content;
    return json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(outline) }] }] });
  } });
  assert.equal((await route.POST(request({ stage: "outline", brief: "Tomates" }))).status, 200);
  assert.doesNotMatch(instructions, /MANDATORY SELECTED VISUAL STYLE/);
});

test("inconsistent card counts are rejected", async () => {
  const route = loadModule("app/api/plan/route.ts", { fetch: async () => json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ titlePrompt: "Titre", sharedPrompt: "Paint", cards: [] }) }] }] }) });
  assert.equal((await route.POST(request({ stage: "details", brief: "Tomates", outline }))).status, 500);
});

const project = { id: "project", cards: [{ id: 7 }], stickmanStyle: true };
const imagePayload = { kind: "card", title: "Tomate", prompt: "Un pot rouge", projectId: "project", imageKey: "card-7", sharedPrompt: "a".repeat(3000) };

for (const kind of ["card", "title"]) {
  test(`Paint is enforced on ${kind} generation, with the full shared direction`, async () => {
    let call;
    let stored;
    const route = loadModule("app/api/generate/route.ts", {
      store: { getProject: async () => project, storeGeneratedImage: async (...args) => { stored = args; return "/test.png"; } },
      fetch: async (_url, options) => { call = JSON.parse(options.body); return json({ data: [{ b64_json: "cG5n" }] }); },
    });
    const response = await route.POST(request({ ...imagePayload, kind, imageKey: kind === "title" ? "title" : "card-7" }));
    assert.equal(response.status, 200);
    assert.match(call.prompt, /MANDATORY STYLE OVERRIDE/);
    assert.match(call.prompt, /Do not add stickmen or people unless/);
    assert.equal(call.background, "transparent");
    assert.equal(call.size, kind === "title" ? "1536x1024" : "1024x1024");
    if (kind === "card") assert.ok(call.prompt.includes(imagePayload.sharedPrompt));
    else assert.match(call.prompt, /wobbly hand-drawn lettering/);
    assert.equal(stored[0], "project");
    assert.equal((await response.json()).image, "/test.png");
  });
}

test("an explicit unchecked option overrides a previously saved preset", async () => {
  let prompt;
  const route = loadModule("app/api/generate/route.ts", {
    store: { getProject: async () => project, storeGeneratedImage: async () => "/test.png" },
    fetch: async (_url, options) => { prompt = JSON.parse(options.body).prompt; return json({ data: [{ b64_json: "cG5n" }] }); },
  });
  assert.equal((await route.POST(request({ ...imagePayload, stickmanStyle: false }))).status, 200);
  assert.doesNotMatch(prompt, /MANDATORY STYLE OVERRIDE/);
});

test("invalid image destinations fail before any billable image call", async () => {
  const route = loadModule("app/api/generate/route.ts", { store: { getProject: async () => project } });
  assert.equal((await route.POST(request({ prompt: "Tomate" }))).status, 400);
  assert.equal((await route.POST(request({ ...imagePayload, imageKey: "card-999" }))).status, 400);
  const missing = loadModule("app/api/generate/route.ts", { store: { getProject: async () => { throw new Error("Missing project"); } } });
  assert.equal((await missing.POST(request(imagePayload))).status, 404);
});

test("rate-limit headers still reach the client", async () => {
  const route = loadModule("app/api/generate/route.ts", {
    store: { getProject: async () => project },
    fetch: async () => json({ error: { message: "Rate limit" } }, { status: 429, headers: { "retry-after": "12" } }),
  });
  const response = await route.POST(request(imagePayload));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
});

test("legacy individual styles survive in the single editable prompt", () => {
  const { mergeCardPrompt } = loadModule("lib/visual-style.ts");
  assert.equal(mergeCardPrompt("Un pot rouge", "Contours irréguliers"), "Un pot rouge\n\nContours irréguliers");
  assert.equal(mergeCardPrompt("Un pot rouge", ""), "Un pot rouge");
});

test("creating, saving and reopening projects preserves the preset and long edited prompts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frameup-test-"));
  try {
    const store = loadModule("lib/project-store.ts", { cwd: directory });
    const createRoute = loadModule("app/api/projects/route.ts", { store });
    const plan = { title: "Tomates", titlePrompt: "Titre naïf", sharedPrompt: "Couleurs plates", cards: [{ title: "Pot", prompt: "Un pot rouge" }] };
    const response = await createRoute.POST(request({ brief: "Tomates", plan, stickmanStyle: true }));
    assert.equal(response.status, 201);
    const created = (await response.json()).project;
    assert.equal(created.stickmanStyle, true);
    assert.equal((await store.getProject(created.id)).stickmanStyle, true);
    const route = loadModule("app/api/projects/[projectId]/route.ts", { store });
    const context = { params: Promise.resolve({ projectId: created.id }) };
    const payload = { ...created, stickmanStyle: false, cards: [{ ...created.cards[0], prompt: "x".repeat(10000) }] };
    assert.equal((await route.PUT(request(payload), context)).status, 200);
    const reopened = (await (await route.GET(request({}), context)).json()).project;
    assert.equal(reopened.stickmanStyle, false);
    assert.equal(reopened.cards[0].prompt.length, 10000);
    const old = await store.createProject("Ancien projet", { ...plan, cards: [{ ...plan.cards[0], style: "3D" }] });
    assert.equal(old.stickmanStyle, false);
    assert.equal((await store.listProjects()).length, 2);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("frameup-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
