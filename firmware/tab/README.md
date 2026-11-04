# Tab firmware boundary

`include/tab/device_core.hpp` contains source-neutral firmware contracts and the wake/fetch/verify/refresh decision loop. It accepts a Manifest/Frame provider, a clock, a persistent revision store, and a panel driver through interfaces; the MCU never receives lesson rules or branches on `fixed` versus `seiue`.

The current attached setup was identified in a separate, successful hardware session as an ESP32-L / ESP32-D0WD with a Good Display GDEM075F53 800×480 four-color SPI panel and a JD79665CA controller. This repository does not yet vendor or lock that panel adapter. Its known control pins are BUSY 13, RST 12, DC 14, CS 27, SCK 18, MOSI 23. A fresh read-only check on 2026-11-04 found the same `/dev/cu.usbserial-1140`, ESP32-D0WD revision 1.1, and 4 MB flash. PSRAM and battery/charge circuitry remain unverified.

The web `mono1` image is a grayscale software contract. The four-color panel adapter must map black/white into the panel's native plane format and retain full-refresh behavior. Do not wire a battery or claim low-power behavior until the power circuit and actual current are measured. Firmware compilation and a fresh screen refresh are not claimed by the host-side core test.

Future board integration should provide:

- `ClockProvider`: `DemoClock` with an explicit accelerated 2026-11-10 date, or NTP/RTC-backed `RealClock`.
- `ManifestClient`: fixed public demo path or separately authenticated production endpoint.
- `FrameClient`: HTTPS certificate validation, complete download, SHA-256 verification.
- `DisplayDriverAdapter`: verified panel driver; no partial-refresh calls unless vendor support is confirmed.
- `DeviceStateStore`: persist displayed frame revision and date across deep sleep/reboot.
- `SleepScheduler`: wake at the next frame boundary or sync deadline.

`tests/test_core.cpp` covers deterministic frame selection and wake/retry calculations without pretending to test GPIO, Wi-Fi, panel refresh, or battery life.
