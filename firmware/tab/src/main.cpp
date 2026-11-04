#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_4C.h>
#include "GxEPD2_750c_GDEM075F53.h"
#include "tab/demo_frames.hpp"

// ESP32-L / GDEM075F53, Good Display wiring recorded from the previously
// verified panel setup. The firmware stays USB-powered; battery behavior is not tested.
constexpr int PIN_CS = 27, PIN_DC = 14, PIN_RST = 12, PIN_BUSY = 13;
constexpr int PIN_SCK = 18, PIN_MOSI = 23;
constexpr uint32_t DEMO_HOLD_MS = 5000;

GxEPD2_4C<GxEPD2_750c_GDEM075F53, 30> display(
  GxEPD2_750c_GDEM075F53(PIN_CS, PIN_DC, PIN_RST, PIN_BUSY));
static uint8_t monoFrame[tab_demo::STRIDE * tab_demo::HEIGHT];

bool decodeFrame(const tab_demo::Frame& frame) {
  size_t src = 0, dst = 0;
  while (src < frame.size && dst < sizeof(monoFrame)) {
    const uint8_t control = pgm_read_byte(frame.data + src++);
    const size_t count = (control & 0x7f) + 1;
    if (control & 0x80) {
      if (src >= frame.size || dst + count > sizeof(monoFrame)) return false;
      memset(monoFrame + dst, pgm_read_byte(frame.data + src++), count);
    } else {
      if (src + count > frame.size || dst + count > sizeof(monoFrame)) return false;
      for (size_t i = 0; i < count; ++i) monoFrame[dst + i] = pgm_read_byte(frame.data + src++);
    }
    dst += count;
  }
  return dst == sizeof(monoFrame) && src == frame.size;
}

bool refreshFrame(const tab_demo::Frame& frame) {
  if (!decodeFrame(frame)) {
    Serial.printf("TAB_FRAME_INVALID revision=%s\n", frame.revision);
    return false;
  }
  const uint32_t started = millis();
  display.setRotation(0);
  display.setFullWindow();
  const uint16_t pageHeight = display.pageHeight();
  uint16_t page = 0;
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    const uint16_t y0 = page * pageHeight;
    const uint16_t y1 = min<uint16_t>(tab_demo::HEIGHT, y0 + pageHeight);
    for (uint16_t y = y0; y < y1; ++y) {
      const size_t row = static_cast<size_t>(y) * tab_demo::STRIDE;
      for (uint16_t x = 0; x < tab_demo::WIDTH; ++x) {
        const uint8_t bits = monoFrame[row + (x >> 3)];
        if (bits & (0x80 >> (x & 7))) display.drawPixel(x, y, GxEPD_BLACK);
      }
    }
    ++page;
  } while (display.nextPage());
  display.hibernate();
  Serial.printf("TAB_REFRESH time=%s revision=%s bytes=48000 ms=%lu\n",
                frame.time, frame.revision, static_cast<unsigned long>(millis() - started));
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(250);
  SPI.begin(PIN_SCK, -1, PIN_MOSI, PIN_CS);
  display.init(115200);
  Serial.printf("TAB_BOOT mode=DEMO room=M123 date=2026-11-10 frames=%u profile=800x480-mono1\n",
                tab_demo::FRAME_COUNT);
  for (uint8_t i = 0; i < tab_demo::FRAME_COUNT; ++i) {
    const auto& frame = tab_demo::FRAMES[i];
    if (refreshFrame(frame)) delay(DEMO_HOLD_MS);
    else delay(1000);
  }
  Serial.println("TAB_DEMO_SEQUENCE_COMPLETE; restarting in 10 seconds");
  delay(10000);
  ESP.restart();
}

void loop() {}
