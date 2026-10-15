# Cloudflare Pages Deployment

The Git-connected Pages project is `mac-github` in the Cloudflare account.

- Repository: `lloyd-c137/MAC-Moonshot-Academy-Campus-`
- Production branch: `main`
- Build command: `bun run build`
- Build output: `dist`
- Build watch paths: all repository files

Cloudflare Pages builds production deployments from GitHub pushes to `main`.
The existing `mac` project and `mac.lloydev.site` domain remain in place until
the new Git-connected deployment is verified and the domain migration is ready.
