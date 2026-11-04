#include <cassert>
#include <iostream>
#include "tab/device_core.hpp"

struct FakeMillis : tab::MonotonicMillis { uint64_t value = 0; uint64_t millis() override { return value; } };
struct FakeClock : tab::ClockProvider { int64_t value = 150; bool valid = true; bool nowEpoch(int64_t& epoch) override { epoch = value; return valid; } };
struct FakeManifestClient : tab::ManifestClient { explicit FakeManifestClient(tab::Manifest input) : value(input) {} tab::Manifest value; bool ok = true; bool fetch(tab::Manifest& out) override { out = value; return ok; } };
struct FakeFrameClient : tab::FrameClient { tab::DownloadedFrame value; bool ok = true; bool downloadAndHash(const tab::FrameWindow&, tab::DownloadedFrame& out) override { out = value; return ok; } };
struct FakeDisplay : tab::DisplayDriverAdapter { int refreshes = 0; bool ok = true; bool refreshMono1(const uint8_t*, size_t) override { ++refreshes; return ok; } void sleepPanel() override {} };
struct FakeStore : tab::DeviceStateStore { std::string revision; std::string displayedRevision() override { return revision; } bool storeDisplayedRevision(const std::string& value, const std::string&) override { revision = value; return true; } };
struct FakeSleep : tab::SleepScheduler { int64_t wake = 0; void deepSleepUntil(int64_t value) override { wake = value; } };

int main() {
  tab::Manifest manifest{"M123", "2026-11-10", "schedule-v1", 48000, 900, {
    {100, 200, "frame-a", "/a.bin", 48000, "a"},
    {200, 300, "frame-b", "/b.bin", 48000, "b"},
  }};
  assert(tab::selectFrame(manifest, 100)->revision == "frame-a");
  assert(tab::selectFrame(manifest, 200)->revision == "frame-b");
  assert(tab::selectFrame(manifest, 300) == nullptr);
  assert(tab::nextWakeEpoch(manifest, 150) == 200);
  assert(tab::nextWakeEpoch(manifest, 250) == 1150);
  assert(tab::retryDelaySeconds(0) == 5);
  assert(tab::retryDelaySeconds(4) == 80);
  assert(tab::retryDelaySeconds(10) == 1800);

  FakeMillis monotonic;
  tab::DemoClock demo(monotonic, 1000, 60);
  int64_t demoEpoch = 0;
  assert(demo.nowEpoch(demoEpoch) && demoEpoch == 1000);
  monotonic.value = 2000;
  assert(demo.nowEpoch(demoEpoch) && demoEpoch == 1120);

  FakeClock clock;
  FakeManifestClient manifestClient{manifest};
  FakeFrameClient frameClient;
  frameClient.value = {std::vector<uint8_t>(48000, 0), "a"};
  FakeDisplay display;
  FakeStore store;
  FakeSleep sleep;
  tab::Runtime runtime{clock, manifestClient, frameClient, display, store, sleep};
  assert(tab::runCycle(runtime) == tab::CycleResult::Refreshed);
  assert(display.refreshes == 1 && store.revision == "frame-a");
  assert(sleep.wake == 200);
  assert(tab::runCycle(runtime) == tab::CycleResult::Unchanged);
  assert(display.refreshes == 1);
  manifestClient.value.frames[0].revision = "frame-new";
  frameClient.value.sha256 = "wrong";
  assert(tab::runCycle(runtime) == tab::CycleResult::InvalidFrame);
  assert(display.refreshes == 1);
  clock.valid = false;
  assert(tab::runCycle(runtime) == tab::CycleResult::ClockUnavailable);
  std::cout << "Tab device core checks passed.\n";
}
