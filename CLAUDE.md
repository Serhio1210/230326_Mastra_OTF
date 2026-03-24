
## How We Build Features

### Feature workflow
1. **Discuss** — decide if the feature is needed and what approach to take
2. **Research** — use context7/mastra-docs MCP to verify the cleanest way
3. **Build** — implement the feature in its own folder/file
4. **Test** — create both a manual test script and a bun test file
5. **Commit** — commit with a clear message referencing the phase/feature
6. **Document** — write a doc in `docs/archive/` if there's a decision or finding worth recording

### File naming
- **Tests**: `src/tests/NN-feature-name.ts` (manual) + `src/tests/NN-feature-name.test.ts` (bun test)
  - Numbered sequentially: `01-`, `02-`, `03-`... so commit history is clear
  - Both files kept at every commit as a record of work
- **Tools**: `src/mastra/tools/toolname/index.ts` — each tool gets its own folder
- **Docs archive**: `docs/archive/YYYYMMDD_HHMM_description.md` — decisions, research, findings
- **Roadmap**: `docs/YYYYMMDD_HHMM_description.md` — top-level docs folder

### Commits
- Commit after each feature/phase is complete and tested
- Commit message format: `Phase N: short description` or `description of change`
- Always push after commit
- Keep files from previous phases — don't delete old test scripts

### Documentation
- Every skipped feature gets a doc explaining why
- Every non-obvious technical decision gets a doc (e.g., 2-step structured output)
- Docs are timestamped in the filename, not the content driving the naming
- Archive folder is for research/decisions; top-level docs for roadmaps/plans

### Before adding a feature
- Check if it's actually needed for our use case (vs the reference project's use case)
- Research latest approach via context7 and mastra-docs MCP
- Discuss trade-offs before building

---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
