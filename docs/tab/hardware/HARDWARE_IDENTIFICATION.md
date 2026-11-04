# Tab 硬件识别记录

日期：2026-11-04。此记录区分当前串口识别和 2026-11-02 的实际屏幕演示证据。

## 当前只读识别

设备 `/dev/cu.usbserial-1140` 通过 esptool 连接成功：

- Chip: ESP32-D0WD, revision v1.1；40 MHz crystal；Wi-Fi/BT；MAC `58:2a:bd:97:f8:a8`。
- Flash: 4 MB，3.3 V strapping。
- 工具输出指出 classic ESP32；未从本次 flash-id 读取 PSRAM 信息。
- 本轮未写 Flash、未复位运行 MAC 固件、未采集功耗。

## 已有面板证据（先前会话）

2026-11-02 同一串口上曾确认 Good Display ESP32-L 配套 `GDEM075F53`：800×480、B/W/R/Y 四色、SPI、JD79665CA。先前运行的 Good Display 样例驱动使用 BUSY=13、RST=12、DC=14、CS=27、SCK=18、MOSI=23，并且用户当时确认屏幕显示 Hello World。该历史结果不是本轮刷新记录；本轮仓库还没有吸收并锁定这份板级驱动源码。

## 未验证事项与安全界限

- Flash 之外的 PSRAM 配置、开发板完整料号/修订、电池及充电保护电路未确认。
- 未在本轮重新构建和烧录 F53 应用；未验证 MAC frame 到屏幕的格式映射。
- 四色面板需将网络 mono1 frame 映射为驱动的原生帧格式；不可直接把 48 KB mono1 buffer 当成 panel-native payload。
- 固件休眠、NTP/RTC、Wi-Fi、TLS CA、显示耗时、电流和续航均未验证。当前不接裸电池。

## 下一次 M0/M2 实测

1. 重新接入已记录的 USB 数据线并确认串口 MAC/芯片与此记录匹配。
2. 先构建板级 F53 驱动和 mono1→黑白像素适配，限制只写 app0；保留 bootloader、分区表、NVS 与其他应用槽。
3. 刷入 M123 2026-11-10 的静态 demo frame，记录完整串口日志并拍摄面板。
4. 在 DemoClock 下越过两个 Manifest 时间边界，核对显示版本、下载长度/hash、无重复刷新和画面变化。
5. 测量休眠、Wi-Fi、下载与刷新电流前，不评估 30 天续航；不把加速演示计入电池验收。
