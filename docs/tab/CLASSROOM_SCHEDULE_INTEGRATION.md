# Classroom Schedule in Room Details

Updated: 2026-11-04

## Data source

The room detail schedule reads `data/tab/reconstructed/2026-fall-week12/week12-schedule.json`, the 610-row Week 12 reconstruction. The browser never imports or downloads this JSON as a static asset. The public Pages Function filters by a validated room ID and date before returning only that room-day result.

The records describe scheduled classes and observed/reconstructed activities. They do not prove that a person is physically present, that a room is available, or that a schedule change has been applied. Inferred periods are labeled separately in the UI. The dataset covers 2026-11-02 through 2026-11-06 only.

## Public access

The Week 12 schedule is intentionally public: anyone can read the selected room and date through `/api/tab/week12`. The function validates the room ID and date and returns only matching records. Responses are not stored in browser or shared caches.

The source JSON remains outside `public/` and is not bundled into the browser app. This endpoint is read-only and does not expose schedule editing or administration.

## Retired browser demo

The `/tab/demo` page, its fixed AP fixture, and the public `/tab/demo/device/v1` manifests/frames have been removed. The physical ESP32's already embedded fixed frame remains unchanged; the firmware build compiles that checked-in frame and does not publish it as a static web resource.
