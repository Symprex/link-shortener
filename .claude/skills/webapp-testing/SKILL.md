---
name: webapp-testing
description: Playbook for validating a UI change against the running application — reproducing a bug in the browser, proving a fix, capturing screenshots as evidence. Use when the proof has to come from the real app rather than a test runner. For the browser commands themselves use `playwright-cli`; for Vitest and Storybook coverage use `vue-testing-best-practices`.
---

# Webapp testing

Drive the running application to reproduce a bug or prove a fix. This skill is the playbook; `playwright-cli` is the command reference.

## Workflow guardrails

- Use `diagnosing-bugs` while the browser behaviour is still not understood and you are isolating the failure. This skill is for once you know what to drive.
- Use `verifying-work` before claiming a browser-verified fix is done.
- Treat screenshots and browser notes as supporting evidence. Keep the proving navigation, assertion or repro step explicit — a screenshot alone does not prove a behaviour change.
- Prefer a Storybook story or a Vitest spec when either can prove the same thing. Reach for the running app when the behaviour crosses page boundaries, depends on real authentication, or needs real browser primitives.

## Find the application first

A repo has many applications, so there is no single dev server to assume. Before touching a browser, find the repo's own application registry and take URLs, ports, start commands and health checks from it. Look for:

- A `dev-applications`-style skill under `.claude/skills/`, often with a status or health-check script
- A section in `CLAUDE.md` or `AGENTS.md` on running the apps locally
- The repo's dev-server or getting-started documentation
- Workspace `package.json` scripts, as a last resort

**Do not invent a URL or a port.** If you cannot find the registry, say so and ask — a wrong port produces a confusing failure that looks like a bug in the app.

Note which backing services the page under test needs. A page that reads from two APIs fails in a way that looks like a frontend bug when only one of them is running.

## Authentication

Symprex apps sit behind an identity provider, so you rarely log in by typing credentials. Find the repo's development sign-in route — typically a CLI command or a development-only endpoint on the identity service that mints a session for a given user, tenant or role. The repo's registry or CLI help will name it.

Never enter real credentials into a browser session you are driving. If the only way in is a real password, stop and hand the step to the engineer.

## Test data

Create data through the repo's own development CLI or seeding commands rather than clicking through the UI — it is faster and it does not depend on the UI you are about to test.

Give every run a unique suffix so repeated runs do not collide:

```powershell
$suffix = Get-Date -Format 'yyyyMMdd-HHmmss'
$ownerEmail = "owner.test-$suffix@example.com"
```

## Evidence

Save screenshots beside the work they belong to — the spec directory named by `docs.specs` in `.symprex/config.json`, in a `research/` or `design/` subfolder of the feature's own spec folder. If the repo keeps no spec directory, say where you put them.

Capture the failing state before the fix as well as the passing state after. One screenshot of a working page proves nothing about the bug.

## Gotchas

| Problem | Fix |
|---|---|
| Navigation hangs | Do not use `waitUntil: 'networkidle'`. Apps holding long-lived connections — websockets, server-sent events, polling — never reach network idle. Use `domcontentloaded`. |
| A dialog or menu cannot be found | Overlays usually render at the end of `body`, outside the component that opened them. Do not scope the query to the parent component. |
| A development-only endpoint returns 4xx | The feature flag or environment variable enabling those endpoints is unset, or the service was not restarted after it was set. Environment variables set with `SetEnvironmentVariable` need new terminals *and* a service restart. |
| The frontend serves on an unexpected port | The environment that selects the port must be set *before* the dev server starts, not after. |
| A dev-login URL reports `ERR_HTTP_RESPONSE_CODE_FAILURE` | It is probably a 302 redirect chain that `goto` treats as a failure. Confirm the URL responds with `Invoke-WebRequest -SkipCertificateCheck -MaximumRedirection 0`, then navigate to the app URL directly. |
| The dev server will not start, missing a binary | Dependencies are not installed for that workspace — see `pnpm-management`. |

---
*Ported from the Signature365 `webapp-testing` skill, with the local port registry, identity-provider endpoints and product CLI replaced by a lookup of the repo's own application registry.*
