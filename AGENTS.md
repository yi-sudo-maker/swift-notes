# Project Notes

- `npm install` can fail under restricted network access with `ENOTFOUND` and `Exit handler never called`. Retry only with explicit network approval, and use `--cache /private/tmp/codex-npm-cache` so logs stay writable.
- `npm run dev` can fail in the sandbox with `listen EPERM` on the inspector port. Retry with explicit approval for local port usage.
- Do not run `npm run build` in parallel with another build/test command. Vinext can fail with `EEXIST` while both processes write to `dist/.openai/drizzle`.
- Sites `save_site_version` requires the full commit SHA. Do not pass a short SHA such as `71617f5`.
