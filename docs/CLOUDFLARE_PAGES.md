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
The custom domains `mac.lloydev.site` and `mac.moonshotacademy.space` are attached
to `mac-github`; both serve the Git-connected Pages project. The latter was
verified with the Tab demo route on the production deployment from `main` commit
`9953710`. The former Direct Upload project `mac` was deleted after the
Git-connected deployment and custom domain were verified.
