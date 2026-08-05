# Project Notes

- `npm install` can fail under restricted network access with `ENOTFOUND` and `Exit handler never called`. Retry only with explicit network approval, and use `--cache /private/tmp/codex-npm-cache` so logs stay writable.
- `npm run dev` can fail in the sandbox with `listen EPERM` on the inspector port. Retry with explicit approval for local port usage.
- `npm run build -- --prerender-all` can fail in the sandbox with `listen EPERM` because Vinext starts a local prerender server. Retry with explicit approval for local port usage.
- Vinext prerender can expose Cloudflare worker entry assumptions where `env` is undefined. Keep application env access guarded and inspect generated worker entry if prerender skips every route.
- Do not run `npm run build` in parallel with another build/test command. Vinext can fail with `EEXIST` while both processes write to `dist/.openai/drizzle`.
- Sites `save_site_version` requires the full commit SHA. Do not pass a short SHA such as `71617f5`.
- Git commits can fail in the sandbox with `.git/index.lock: Operation not permitted`. Retry the same git write command with explicit approval.
