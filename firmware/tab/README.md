# Tab firmware boundary

`include/tab/device_core.hpp` contains source-neutral firmware contracts and the wake/fetch/verify/refresh decision loop. It accepts a Manifest/Frame provider, a clock, a persistent revision store, and a panel driver through interfaces; the MCU never receives lesson rules or branches on `fixed` versus `seiue`.

## Physical Tab demo firmware

`platformio.ini` builds an ESP32-L / GDEM075F53 demo that displays actual MAC-generated M123 mono1 frames. `scripts/embed_tab_demo_frames.py` validates and embeds the five existing fixture frames at 08:30, 10:50, 12:20, 16:00, and 17:30. The firmware decodes those images and sends black/white pixels through the verified full-refresh F53 adapter; it repeats the visible sequence and logs each frame revision. It is explicitly offline DEMO firmware, not the future network/SEIUE production client, and it does not use deep sleep.

Build from the repository root:

```sh
npm run build:tab-firmware-demo
```

Flash only the active app slot after confirming `/dev/cu.usbserial-1140` is the attached board:

```sh
uvx --from esptool esptool --chip esp32 --port /dev/cu.usbserial-1140 --baud 115200 write-flash 0x10000 firmware/tab/.pio/build/esp32l_f53_demo/firmware.bin
```

The binary ships only when the five embedded images fit the existing 1.31 MB app partition; PlatformIO reports the actual size. The firmware sequence is a hardware demo and does not claim cloud fetching, automatic natural-time schedule transitions, battery life, or production authentication.

The attached setup is an ESP32-L / ESP32-D0WD with a Good Display GDEM075F53 800×480 four-color SPI panel and JD79665CA. The checked driver uses BUSY 13, RST 12, DC 14, CS 27, SCK 18, MOSI 23. A fresh check on 2026-11-04 found `/dev/cu.usbserial-1140`, ESP32-D0WD revision 1.1, and 4 MB flash. PSRAM and battery/charge circuitry remain unverified.

The web `mono1` image is a grayscale software contract. The four-color panel adapter must map black/white into the panel's native plane format and retain full-refresh behavior. Do not wire a battery or claim low-power behavior until the power circuit and actual current are measured. Firmware compilation and a fresh screen refresh are not claimed by the host-side core test.

Future board integration should provide:

- `ClockProvider`: `DemoClock` with an explicit accelerated 2026-11-10 date, or NTP/RTC-backed `RealClock`.
- `ManifestClient`: fixed public demo path or separately authenticated production endpoint.
- `FrameClient`: HTTPS certificate validation, complete download, SHA-256 verification.
- `DisplayDriverAdapter`: F53 full-refresh panel adapter is vendored under `src/panel`; partial refresh remains disabled.
- `DeviceStateStore`: persist displayed frame revision and date across deep sleep/reboot.
- `SleepScheduler`: wake at the next frame boundary or sync deadline.

`tests/test_core.cpp` covers deterministic frame selection and wake/retry calculations without pretending to test GPIO, Wi-Fi, panel refresh, or battery life.
