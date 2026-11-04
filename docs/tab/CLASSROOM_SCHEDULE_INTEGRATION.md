# Classroom Schedule in Room Details

Updated: 2026-11-04

## Data source

The room detail schedule reads `data/tab/reconstructed/2026-fall-week12/week12-schedule.json`, the private 610-row Week 12 reconstruction. The browser never imports or downloads this JSON as a static asset. The Pages Function filters by a validated room ID and date before returning only that room-day result.

The records describe scheduled classes and observed/reconstructed activities. They do not prove that a person is physically present, that a room is available, or that a schedule change has been applied. Inferred periods are labeled separately in the UI. The dataset covers 2026-11-02 through 2026-11-06 only.

## Access boundary

`functions/api/tab/week12.ts` fails closed unless the request carries a valid Cloudflare Access JWT. It verifies the RS256 signature against the configured team's Access JWKS and checks issuer, audience, expiry, and not-before claims. Responses use `Cache-Control: private, no-store` and contain only the requested room and day.

Configure the Cloudflare Pages project with:

- `CF_ACCESS_TEAM_DOMAIN`: the Access team hostname, such as `example.cloudflareaccess.com` (hostname only is accepted).
- `CF_ACCESS_AUD`: the audience tag of the Access application.
- A Cloudflare Access self-hosted application covering `mac.moonshotacademy.space/api/tab/*` and `mac.lloydev.site/api/tab/*`, with the school's approved user policy.

Until configured, requests return HTTP 401 and the room detail reports that the schedule is limited to authorized school users. Do not copy this dataset into `public/`, a Vite import, a static manifest, or an unauthenticated device endpoint.

## Retired browser demo

The `/tab/demo` page, its fixed AP fixture, and the public `/tab/demo/device/v1` manifests/frames have been removed. The physical ESP32's already embedded fixed frame remains unchanged; the firmware build compiles that checked-in frame and does not publish it as a static web resource.
