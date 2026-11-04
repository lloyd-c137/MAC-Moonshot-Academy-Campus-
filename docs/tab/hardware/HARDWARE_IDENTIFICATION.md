# Tab 硬件识别记录

日期：2026-11-04。此记录区分实机刷写与刷新日志、此前面板照片证据及仍未完成的视觉/电源验收。

## 当前实机识别、刷写与刷新

设备 `/dev/cu.usbserial-1140` 通过 esptool 连接成功：

- Chip: ESP32-D0WD, revision v1.1；40 MHz crystal；Wi-Fi/BT；MAC `58:2a:bd:97:f8:a8`。
- Flash: 4 MB，3.3 V strapping。
- 工具输出指出 classic ESP32；未从本次 flash-id 读取 PSRAM 信息。
- V0.1 离线 Tab 固件已写入 app0 `0x10000`，esptool 写后 hash 校验通过；固定帧版本启动时只执行一次 F53 刷新。日志见 `../evidence/tab-fixed-frame-serial-2026-11-04.log`。未采集功耗。

## 面板身份与此前照片确认

2026-11-02 同一串口上曾确认 Good Display ESP32-L 配套 `GDEM075F53`：800×480、B/W/R/Y 四色、SPI、JD79665CA。先前运行的 Good Display 样例驱动使用 BUSY=13、RST=12、DC=14、CS=27、SCK=18、MOSI=23，并且用户当时确认屏幕显示 Hello World。本轮已将该 F53 驱动适配纳入仓库并刷入 Tab 课表帧；当前固定帧不会重复刷新。本轮未采集新的屏幕照片。

## 未验证事项与安全界限

- Flash 之外的 PSRAM 配置、开发板完整料号/修订、电池及充电保护电路未确认。
- 本轮映射验证覆盖黑白 mono1 帧到 F53 全刷流程；未确认屏幕照片中的最终可读性、方向或残影。
- 四色面板需将网络 mono1 frame 映射为驱动的原生帧格式；不可直接把 48 KB mono1 buffer 当成 panel-native payload。
- 固件休眠、NTP/RTC、Wi-Fi、TLS CA、显示耗时、电流和续航均未验证。当前不接裸电池。

## 下一步实测

1. 拍摄当前 M123 课表画面，核对方向、裁切、对比度和字体可读性。
2. 加入经过验证的 DemoClock/Manifest 选择与帧下载流程，再测两个真实时间边界；当前固件是离线预排帧轮播。
3. PSRAM、休眠、Wi-Fi、下载与刷新电流均需实测后再评估续航；不将加速演示计入 30 天验收。
