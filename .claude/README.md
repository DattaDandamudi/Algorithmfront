# Claude Code configuration

`settings.json` registers two plugin marketplaces and enables six frontend
plugins. Opening this repo in Claude Code and trusting the folder is enough —
no `/plugin marketplace add` or `/plugin install` by hand.

Registering a marketplace only fetches a JSON index; nothing executes. All six
plugins below were checked for auto-running hooks and none of them register any.

| Plugin | Source | What it adds |
|---|---|---|
| `frontend-design` | Anthropic | Design discipline for real interfaces: palette and type systems, layout direction, and an explicit list of the generic looks to avoid. |
| `modern-web-guidance` | Google Chrome team, via Anthropic's marketplace | Current web-platform guidance, so the agent stops reaching for the 2019 way of doing things. |
| `typescript-lsp` | Anthropic | Go-to-definition, find-references and real type diagnostics across the TypeScript sources instead of grep. |
| `playwright` | Microsoft, via Anthropic's marketplace | Drives a real browser, so a UI change can be verified rather than asserted. |
| `ui-design` | wshobson/agents (third party, MIT) | Responsive design, design-system patterns, interaction design, and WCAG auditing. |
| `frontend-mobile-development` | wshobson/agents (third party, MIT) | React state management, Tailwind design systems, Next.js App Router patterns. |

## One prerequisite

`typescript-lsp` needs a language server on `PATH` or it silently does nothing:

```bash
npm install -g typescript-language-server typescript
```

Worth doing on a machine that persists. In an ephemeral cloud container it has
to be repeated per session, so treat the LSP as a local-machine benefit.

## Two things worth knowing

`claude-code-workflows` is `wshobson/agents` — a third party, not Anthropic.
The two plugins enabled from it are plain markdown with no hooks and no MCP
servers, but registering the marketplace exposes its whole catalog to
`/plugin install`, and some of its *other* plugins do ship hooks. Install from
it deliberately rather than in bulk.

The `playwright` plugin runs `npx @playwright/mcp@latest`, which is unpinned.
Pin a version in your own `.mcp.json` if that matters to you, and don't point
it at a browser profile holding live session cookies — page text becomes model
input, so a hostile page is a prompt-injection surface.
