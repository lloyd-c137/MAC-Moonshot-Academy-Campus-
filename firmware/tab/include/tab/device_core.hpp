#pragma once

#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

namespace tab {

struct FrameWindow {
  int64_t fromEpoch;
  int64_t untilEpoch;
  std::string revision;
  std::string path;
  size_t byteLength;
  std::string sha256;
};

struct Manifest {
  std::string roomId;
  std::string date;
  std::string scheduleRevision;
  size_t expectedFrameBytes;
  int32_t nextSyncAfterSeconds;
  std::vector<FrameWindow> frames;
};

struct DownloadedFrame {
  std::vector<uint8_t> bytes;
  std::string sha256;
};

enum class CycleResult { Refreshed, Unchanged, ClockUnavailable, ManifestUnavailable, NoEffectiveFrame, DownloadFailed, InvalidFrame, DisplayFailed };

class ClockProvider {
 public:
  virtual ~ClockProvider() = default;
  virtual bool nowEpoch(int64_t& epoch) = 0;
};

class MonotonicMillis {
 public:
  virtual ~MonotonicMillis() = default;
  virtual uint64_t millis() = 0;
};

class DemoClock : public ClockProvider {
 public:
  DemoClock(MonotonicMillis& monotonic, int64_t startEpoch, uint32_t acceleratedSecondsPerRealSecond)
      : monotonic_(monotonic), startEpoch_(startEpoch), startMillis_(monotonic.millis()), speed_(acceleratedSecondsPerRealSecond) {}
  bool nowEpoch(int64_t& epoch) override {
    if (speed_ == 0) return false;
    epoch = startEpoch_ + static_cast<int64_t>(((monotonic_.millis() - startMillis_) / 1000) * speed_);
    return true;
  }
 private:
  MonotonicMillis& monotonic_;
  int64_t startEpoch_;
  uint64_t startMillis_;
  uint32_t speed_;
};

class TrustedEpochSource {
 public:
  virtual ~TrustedEpochSource() = default;
  virtual bool readEpoch(int64_t& epoch) = 0;
};

class RealClock : public ClockProvider {
 public:
  explicit RealClock(TrustedEpochSource& source) : source_(source) {}
  bool nowEpoch(int64_t& epoch) override { return source_.readEpoch(epoch); }
 private:
  TrustedEpochSource& source_;
};

class ManifestClient {
 public:
  virtual ~ManifestClient() = default;
  virtual bool fetch(Manifest& manifest) = 0;
};

class FrameClient {
 public:
  virtual ~FrameClient() = default;
  // Implementations must validate TLS and compute SHA-256 over the downloaded bytes.
  virtual bool downloadAndHash(const FrameWindow& frame, DownloadedFrame& output) = 0;
};

class DisplayDriverAdapter {
 public:
  virtual ~DisplayDriverAdapter() = default;
  virtual bool refreshMono1(const uint8_t* bytes, size_t length) = 0;
  virtual void sleepPanel() = 0;
};

class DeviceStateStore {
 public:
  virtual ~DeviceStateStore() = default;
  virtual std::string displayedRevision() = 0;
  virtual bool storeDisplayedRevision(const std::string& revision, const std::string& date) = 0;
};

class SleepScheduler {
 public:
  virtual ~SleepScheduler() = default;
  virtual void deepSleepUntil(int64_t epoch) = 0;
};

struct Runtime {
  ClockProvider& clock;
  ManifestClient& manifestClient;
  FrameClient& frameClient;
  DisplayDriverAdapter& display;
  DeviceStateStore& state;
  SleepScheduler& sleep;
};

inline const FrameWindow* selectFrame(const Manifest& manifest, int64_t nowEpoch) {
  for (const auto& frame : manifest.frames) if (frame.fromEpoch <= nowEpoch && nowEpoch < frame.untilEpoch) return &frame;
  return nullptr;
}

inline int64_t nextWakeEpoch(const Manifest& manifest, int64_t nowEpoch) {
  int64_t wake = nowEpoch + std::max<int32_t>(60, manifest.nextSyncAfterSeconds);
  for (const auto& frame : manifest.frames) if (frame.fromEpoch > nowEpoch) wake = std::min(wake, frame.fromEpoch);
  return wake;
}

inline CycleResult runCycle(Runtime& runtime) {
  int64_t now = 0;
  if (!runtime.clock.nowEpoch(now)) return CycleResult::ClockUnavailable;
  Manifest manifest;
  if (!runtime.manifestClient.fetch(manifest)) return CycleResult::ManifestUnavailable;
  const FrameWindow* selected = selectFrame(manifest, now);
  if (!selected) return CycleResult::NoEffectiveFrame;
  CycleResult result = CycleResult::Unchanged;
  if (runtime.state.displayedRevision() != selected->revision) {
    DownloadedFrame downloaded;
    if (!runtime.frameClient.downloadAndHash(*selected, downloaded)) return CycleResult::DownloadFailed;
    if (downloaded.bytes.size() != selected->byteLength || downloaded.bytes.size() != manifest.expectedFrameBytes || downloaded.sha256 != selected->sha256) return CycleResult::InvalidFrame;
    if (!runtime.display.refreshMono1(downloaded.bytes.data(), downloaded.bytes.size())) return CycleResult::DisplayFailed;
    runtime.display.sleepPanel();
    if (!runtime.state.storeDisplayedRevision(selected->revision, manifest.date)) return CycleResult::DisplayFailed;
    result = CycleResult::Refreshed;
  }
  runtime.sleep.deepSleepUntil(nextWakeEpoch(manifest, now));
  return result;
}

inline uint32_t retryDelaySeconds(uint32_t attempt, uint32_t capSeconds = 1800) {
  const uint32_t shift = std::min<uint32_t>(attempt, 10);
  return std::min<uint32_t>(capSeconds, 5U << shift);
}

}  // namespace tab
