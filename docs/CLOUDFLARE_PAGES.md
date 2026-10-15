# Cloudflare Pages Deployment

The Git-connected Pages project is `mac-github` in the Cloudflare account.

- Repository: `lloyd-c137/MAC-Moonshot-Academy-Campus-`
- Production branch: `main`
- Build command: `npm install --legacy-peer-deps && npm run build`
- Build output: `dist`
- Build watch paths: all repository files

Cloudflare's current Bun build image cannot parse this repository's Bun v2 lockfile.
The Pages project sets `SKIP_DEPENDENCY_INSTALL=1` and performs the install with npm
as part of the build command, so the lockfile is not rewritten or removed. The legacy peer resolution flag accommodates the Vite 8 and esbuild versions already recorded by the project.

Cloudflare Pages builds production deployments from GitHub pushes to `main`.
The existing `mac` project and `mac.lloydev.site` domain remain in place until
the new Git-connected deployment is verified and the domain migration is ready.
