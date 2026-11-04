# Tab｜实体电子纸 MVP 实现方案 V0.1

> 状态：**M1 SOFTWARE READY / OFFLINE TAB FIRMWARE FLASHED AND FIVE FRAMES REFRESHED / NETWORK DEVICE INTEGRATION PENDING**
> 基线：2026-11-04 · 目标：已购 ESP32 + 电子纸能从 MAC 数据链路显示真实可验证的模拟课表，并自动切换  
> 对应总方案：[PROJECT_PLAN.md](./PROJECT_PLAN.md) · 追踪：[PROGRESS.md](./PROGRESS.md) · 正式安全边界：[SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)

> 实施记录（2026-11-04）：M1 软件渲染合同通过；离线 M123 Tab 固件已刷写至 ESP32-L app0，并在 GDEM075F53 上执行五个真实全屏刷新。串口证据和边界见 [PROGRESS.md](./PROGRESS.md)；这仍不代表已完成网络协议、可信时钟、低功耗或目视照片验收。

## 0. 当前工程事实，不重复造轮子

截至本方案制定时，`main` 已合并 **PR #5**（`9953710`），实现：
- `src/features/tab/schedule.ts`：`FixedScheduleAdapter`、`TabScheduleData`、按时间判断课程状态、基础数据校验。
- `src/features/tab/data/fixedSchedule.ts`：从 FF-01/AP Fixture 读取并转换为当前 Demo 模型。
- `src/features/tab/TabDemoPage.tsx` + `TabScheduleWorkspace.tsx`：`/tab/demo` 页面、教室日期时间选择、课表列表、电子纸样式预览。
- `docs/tab/demo/Tab_FF01_AP_Demo_2026W46.json`：2026-11-09 至 13 的模拟记录（102 个有编号空间、其中 53 个 AP 模拟教学空间、43 门 AP 课程、763 条周事件）；**非真实教务课表**。

**本轮禁止重新生成模拟数据、重写已有状态机、建立第二套教室主数据或另起独立 Tab 网站。** 优先把当前模型**抽出为数据源无关的投影合同**，并新增真正可输出电子纸像素的渲染与设备固件。

**未确认的硬件**：实际 ESP32 主控/板卡版本、Flash/PSRAM、面板型号、驱动 IC、分辨率、接口引脚、供电与电池管理。800×480 只能作为默认测试 display profile，不能当作已确认规格。用户已购 ESP32 + 电子纸，但尚无 GitHub 中可核验的点亮、烧录或续航证据。

## 1. 本轮交付定义

**MVP 成功 =** 选定一间教室（第一台默认 M123）、使用指定模拟日期的固定课表，通过 MAC 模型生成**单色、无裁切的完整日程画面**，将画面交给**实际 ESP32**，在真实电子纸上稳定显示。之后按约定时间边界**自动切换当前高亮课程**，并在无变化时避免无意义刷屏。

必须有以下**可分别验收**的交付：
1. **MAC Renderer Ready**：浏览器画面、电子纸图片源自同一课程投影；格式、分辨率与数据版本清楚。
2. **Physical Screen Ready**：准确识别硬件、匹配驱动、下载/读取位图并刷屏，有设备照片和串口日志。
3. **Automatic Switching Ready**：无需重新烧录，课程状态改变后自动取/换画面；失败恢复有日志。
4. **Battery Feasibility Baseline**：测量休眠、联网与刷屏电流；**不等同已满足 30 天**。
5. **SEIUE-Ready Contract**：同一标准课表模型可被固定数据和 SEIUE 模拟响应生成；固件不解析特定数据源。

**不在本轮做**：真实 SEIUE OAuth、生产 D1 管理后台、完整 Cloudflare Access、批量配网/OTA、量产外壳和 30 天实测。这些留在既有 P1–P5 与安全门禁中；但当前协议必须不阻碍它们。

## 2. 不变的分层架构

```text
 EXISTING FIXTURE --> FixedScheduleAdapter --┐
                                              ├--> DailySchedule (source-neutral)
 FUTURE SEIUE ---> SeiueScheduleAdapter ------┘          |
                                                         v
                                             validate / project
                                              (at target time)
                                                         |
                                                         v
                                           DisplayViewModel (pure)
                                              /                  \
                                             v                    v
                                    MAC browser preview      Rasterizer
                                                                |
                                         versioned 1-bit frames + manifest
                                                                |
                                       GET frame / verify / e-paper driver
                                                                |
                                         ESP32 wake / render / deep sleep
```

**单一课程投影、单一状态计算**：允许保留 `schedule.ts` 的现有代码，增加薄适配层映射到通用模型；不要同时保留两套互不一致的 `getRoomDay` 和新状态机。浏览器与设备图像必须消费相同 `DisplayViewModel`；排版可以因像素密度不同调整，但课程、次序、高亮、取消及错误状态一致。

### 2.1 统一 DailySchedule（内部契约，非设备请求）

```ts
type DataSource = { type: 'fixed' | 'seiue'; mode: 'demo' | 'production' };
type DataState = 'valid' | 'stale' | 'unavailable';

type Lesson = {
  id: string;
  roomId: string;
  date: string;            // YYYY-MM-DD
  start: string;           // HH:mm, Asia/Shanghai
  end: string;
  title: string;
  status: 'scheduled' | 'cancelled' | 'moved_out';
  movedToRoomId?: string;
  movedFromRoomId?: string;
};

type DailySchedule = {
  schemaVersion: 1;
  roomId: string;
  date: string;
  timezone: 'Asia/Shanghai';
  source: DataSource;
  dataState: DataState;
  scheduleRevision: string;   // stable canonical content hash, not fetched_at
  fetchedAt?: string;
  validUntil?: string;
  lessons: Lesson[];          // all daily records; include exception notices
};
```

**实现提示**：
- 当前 Fixture 的 `fixed_mock` → `{type:'fixed',mode:'demo'}`，这是**Adapter 的映射**，不是修改原始数据。
- `fetchedAt` 只表示数据最后成功读取的时间；并非课堂实时使用率。
- `scheduleRevision` 根据按规则排序/规范化后的日程内容及必要来源元数据确定，不应随重复 HTTP 请求而变化。
- 模拟数据之外无有效排课日 ≠ 经过成功确认的空课表；`out_of_ap_scope` ≠ 有效空课表；`unavailable` / `stale` 不显示“今日无课”。
- 取消和调出的课程可在列表中显示变更提示，但不能计入当前排课；调入课程在新教室计入有效排课。
- 源接入不允许由固件读取全校 JSON；设备不得接触 SEIUE API、`client_secret`、课程元数据全量库。

### 2.2 显示视图模型（前后复用）

```ts
type DisplayViewModel = {
  schemaVersion: 1;
  roomId: string;
  date: string;
  timeLabel: string;
  sourceMode: 'demo' | 'production';
  state: 'before' | 'in_class' | 'between' | 'finished' |
         'no_classes' | 'out_of_scope' | 'unavailable' | 'stale';
  rows: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    emphasis: 'current' | 'next' | 'none';
    note?: 'cancelled' | 'moved_out' | 'moved_in';
  }>;
  lastSuccessfulSync?: string;
};
```

视图模型是课表到像素的唯一输入。取消课程显示不计入有效课时；课程边界采用 `start <= now < end`。真实时间统一 `Asia/Shanghai`，不能使用浏览器所在时区或把 2026-11-10 模拟日程误判成今天真实课表。

## 3. 屏幕排版规范：一张画面，不轮播页面

**信息层级**：
- 页眉：醒目的房间编号 + 日期；Demo 模式清晰标识 `DEMO`。
- 主体：**全天全部有效课节**（按开始时间），显示起止时间与课程名；当前/下一节在原位高亮；取消/调课作为说明。
- 页脚：数据来源真实性、最后同步时间 / 数据状态；只在真实可用时显示“已同步”。不展示误导性的“有人/空闲”。

**固定布局优先**：高对比黑白、清晰文本、极少装饰；不增加占用屏幕大量空间的独立 Now 卡片；不要以滚动、自动轮播或隐藏课程逃避版式限制。

**必须覆盖的密度**：0、3、6、10+ 节和长中文/英文课名，尤其隔离的 `M115` 11 条短课压力样本。若实际面板在所有内容保留前提下字号达不到合理可读性，要记录阻塞并调整布局或物理屏幕，不得悄悄截断。

**显示驱动参数**：从硬件识别结果定义 `DisplayProfile`：width/height、orientation、driverName、黑白极性、行步长、bit order、全刷/局刷支持。候选 800×480 profile 仅供软件 golden 图测试；硬件型号确认后调整并实测。

## 4. 显示版本和设备协议：与未来真实数据兼容

**分别定义两个版本**：
- `scheduleRevision`：规范化课表内容变更时更新；与取数时间无关。
- `frameRevision`：由 `scheduleRevision + displayProfile + rendererVersion + state/time-boundary` 决定；同一课表在 09:50/10:40 改变高亮后，画面版本也改变。

**设备绝不根据来源决定如何显示。** 固件只处理版本、画面列表/下载、时间边界、刷屏及睡眠。

### 4.1 Demo 服务与未来生产 API 隔离

**Demo：** 允许使用纯模拟数据、开发机预览或 Cloudflare Pages 的**公共静态 Demo 资产**，例如 `/tab/demo/device/v1/manifest.json` 和对应版本位图；可以构建时预生成整天的时间边界帧。不得放真实密钥或真实教务数据。公共演示 URL 不能被误认为受保护的生产设备接口。

**Production（后续）：** 采用既有 [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) 所定义的 `/api/tab/device/v1/manifest`、`/api/tab/device/v1/display`；在服务端识别设备身份，按授权绑定的教室生成响应，独立设备凭证可撤销。**不能把 Demo 的自由 `room_id` / `date` / `time` 查询参数原样搬到真实设备 API。**

通过 `FrameProvider`／环境配置更换资源地址、是否带设备凭证以及时间来源，固件的通用显示/刷屏主循环保持不变。

### 4.2 Manifest V1（建议合同）

可采用“**日内帧时间线**”，特别适合低功耗电子纸：一天内多张不同高亮状态的画面共享一份课程版本。Demo 通过相同合同模拟边界，未来 SEIUE 也输出同样结构。

```json
{
  "schema_version": 1,
  "room_id": "M123",
  "date": "2026-11-10",
  "timezone": "Asia/Shanghai",
  "source": { "type": "fixed", "mode": "demo" },
  "data_state": "valid",
  "schedule_revision": "sha256:example",
  "display_profile": {
    "width": 800, "height": 480, "format": "mono1",
    "bit_order": "msb_first", "stride_bytes": 100,
    "one_bit": "black", "orientation": "landscape"
  },
  "frames": [
    {
      "effective_from": "2026-11-10T08:00:00+08:00",
      "effective_until": "2026-11-10T09:35:00+08:00",
      "frame_revision": "sha256:example-frame-a",
      "path": "/tab/demo/device/v1/frames/example-frame-a.bin",
      "byte_length": 48000,
      "sha256": "64-hexadecimal-hash-of-binary"
    }
  ],
  "next_sync_after_seconds": 900
}
```

示例字段和 hash 均为占位，**不可以把示例 hash 当实际校验值**。正式实现的 schema、媒体类型和错误码须用 TypeScript 类型及测试冻结。所有日期/时间窗口要完整覆盖演示日，帧窗口**不重叠且无空洞**（必要时包含“课前”“课间”“当天结束”帧）。

**像素约定**：`mono1` 是逐行 1-bit 位图，`stride_bytes = ceil(width / 8)`，行内 MSB 优先，1 代表黑、0 代表白；800×480 时载荷为 48,000 字节（不含包装）。如果实际面板字节方向不同，在驱动适配层转换，不随意改变网络协议。

**校验要求**：下载完成后校验长度与 SHA-256，再刷屏；TLS 下验证证书；对相同 `frameRevision` 不重复下载/刷屏。画面缓存必须记录日期/源有效性；失去网络不允许错误地声明实时同步成功。

**生产安全约束**：真实设备不发可更换的 `room_id` 参数，不能通过字符串拼接下载其他教室的资源；资源鉴权由服务端判定，生产 manifest 与图像禁止错误的公共共享缓存。Demo 静态路径仅存模拟内容。

## 5. 演示时钟与日常运行：同一渲染状态机

**两个时钟提供者，不是两套课程算法：**
- `DemoClock`：指定 2026-11-10 之类的模拟日期，允许通过预设时刻或加速比运行；屏幕上始终可见 `DEMO`。
- `RealClock`：设备以受信时间取得 `Asia/Shanghai` 日期/时刻，按自然时间变更。未来使用 SEIUE 的真实日程时，仅替换数据来源并关闭 DemoClock。

演示初始：M123、2026-11-10、10:50；验证 08:30、10:50、12:20、16:00、17:30 等不同状态；不是从访问当天实际日期读取已经过期的模拟数据。

**优先让云端生成帧时间线**：时钟切换仅影响选取哪一帧，并不会导致固件重新计算课程标题/规则。设备在当前帧有效窗口内只需显示当前版本；边界到来后可直接选择下一张缓存帧，或联网下载，随后根据下一时刻与定期数据检查时间设定定时唤醒。

**RTC/Deep Sleep 注意**：模拟“每 30 秒换帧”只用于现场展示；生产用日程边界和低频检查。真实长时休眠后时钟漂移/重启/日期跨天要实测。若开发板无法保障 RTC 精度，需要开机同步可靠时间；未同步时间时不得显示自信的“正在上课”。

## 6. Firmware 最小主循环

```text
boot
  -> load display profile and mode (DEMO / PRODUCTION)
  -> check clock validity
  -> get manifest / cached manifest
  -> validate manifest schema/date/profile
  -> choose effective frame for clock time
  -> frame version changed?
       yes -> authenticated HTTPS fetch or valid cache
           -> validate length/hash
           -> map 1-bit buffer to actual panel driver
           -> refresh -> record displayed revision
       no  -> skip refresh
  -> schedule next wake (next frame boundary / next sync / date rollover)
  -> panel sleep or power-off as supported
  -> ESP32 deep sleep
```

首轮开发先用 USB 安全供电烧录和验证，不得在未确认板卡电池保护电路前接裸电芯。串口日志至少包括 boot reason、clock/mode、room ID、schedule/frame revisions、download bytes/hash、refresh duration、next wake、error/retry；不得输出 Wi-Fi 凭证或设备 Token。

**错误与恢复**：网络中断有限重试并退避；帧下载不完整不得刷新；缓存仍在有效日期时可显示并标记状态，**电子纸保留旧图像时不可声称远程已清屏或已实时同步**。电源恢复后应依据缓存中的 `displayed_revision` 校验状态，不能只依赖内存变量。

## 7. 建议的代码归属与顺序

**使用现有 `src/features/tab/`，不要另造一个 parallel/Tab 目录。**

```text
src/features/tab/
  schedule.ts                 # 保留且重用已实现算法
  data/fixedSchedule.ts       # 保留、只做必要适配
  display/model.ts            # 新增来源无关的 DisplayViewModel
  display/profiles.ts         # 屏幕能力参数
  display/render.ts           # 来源无关的渲染接口
  display/mono1.ts            # 1-bit 打包、校验/测试
  device/manifest.ts          # manifest/frames 纯函数合同
  TabDemoPage.tsx             # 现有页面，复用新渲染模型
firmware/tab/                 # 根据确认的 ESP32 SDK/板卡选型
docs/tab/                     # 方案、进度、硬件识别和测试证据
```

目录仅为建议，实际应先检查已有命名与构建工具，优先复用；不为此创建独立服务或新 npm 应用。

### M0：硬件识别与点亮（阻塞真实设备）

- 核实主控板型号、内存/引脚、电源结构、显示驱动 IC、分辨率和刷新方式。
- 从真实厂商官方 Demo 点亮至少两次，记录照片、代码和串口日志。
- 任何时候不能猜面板型号或直接假设 Seeed E1001 / 800×480。

**M0 gate**：实际屏幕能重复可靠显示指定像素，面板/引脚/驱动记录完整。

### M1：无硬件依赖的软件渲染（可立即开始）

- 复用当前 `FixedScheduleAdapter` → `DailySchedule` → `DisplayViewModel`。
- 实现候选 800×480 的 mono1 导出、时间线帧、确定性修订号。
- 生成并自动校验 0/3/6/11 节及长标题的屏幕 golden 图片；和现有网页预览对账。
- 单元测试：时间边界、取消、调房、数据过期、`fixed_mock` 来源转换、修订稳定性、帧校验。
- 小心 Cloudflare Pages 静态导出：**不要默认 Pages 当前已有设备 API**。纯模拟版可以从构建产物生成静态 manifest/帧，无需数据库或密钥。

**M1 gate**：浏览器/命令行可以生成按真实像素定义打包的文件；从课表切换时间导致正确 `frameRevision` 变化。

### M1 实际实现（2026-11-04）

- `src/features/tab/display/model.ts` 将现有 `FixedScheduleAdapter` 转为来源无关 `DailySchedule`，再使用 `schedule.ts` 同一课程选择函数生成 `DisplayViewModel`。固定 `fixed_mock` 映射为 `fixed + demo`；合成 SEIUE 输入通过等价投影测试，不需要凭证。
- `/tab/demo` 课表预览读取同一 `DisplayViewModel` 的课程、高亮和调课说明。
- `src/features/tab/display/render.ts` 输出高对比 SVG 版式；`mono1.ts` 按行打包、MSB-first、bit 1 黑。800×480 是软件测试 profile，不代表驱动参数已经对应到面板。
- `device/manifest.ts` 冻结 Manifest v1 与无缝日内帧窗口校验；课程版本和按边界计算的画面版本分离。
- `npm run build:tab-device-demo` 从仓库固定演示 Fixture 生成 M123、M107、M115 的公开静态 DEMO Manifest、40 个 48,000-byte 帧及 PNG 预览。资源只含模拟数据；生产设备 API 和真实课程数据仍与公开静态路径隔离。
- `npm run validate:tab-device-assets` 逐帧验证完整日期覆盖、数据长度与 SHA-256；`npm run test:tab-browser` 对 M123、M107、M115 做 Chromium 页面交互并保存截图证据。
- 课表版本使用稳定 FNV-1a 64 内容标识（不是安全校验值）；frame revision 和帧 payload 使用 SHA-256。

### M2：设备通信与刷屏（依赖 M0 + M1）

- 使 ESP32 使用 manifest 与 bitmaps，而非下载整个 961KB 的 FF-01 JSON。
- 用受控 Demo 固定资源模式验证：M123 首次刷屏、相同版本不刷、换课程自动刷新。
- Demo 模式可通过加速时钟或预生成时间线演示，不需要修改、重新烧录课程表内容。
- 把站点的 Demo 数据与将来生产接口严格隔离；不要求此阶段建立真实设备 Token 服务，但**禁止把匿名 Demo endpoint 直接作为生产设备 endpoint**。

**M2 gate**：真实屏幕显示指定教室的完整课程，连续至少跨过两个边界，具备日志/画面证据。

### M3：基础低功耗与故障恢复

- 刷新结束后正确睡眠、RTC 定时唤醒、重连和数据更新。
- 实测 Wi-Fi/刷新/休眠基础电流，为 30 天续航建预算。
- 演示的 30 秒加速循环**不得**用作 30 天续航认证。

**M3 gate**：断网/复位后可恢复有效显示；有实际功耗测量；不虚报 30 天通过。

### M4：真实数据兼容性验收（当前可用 Mock 验证）

- 使用固定数据和**合成 SEIUE 风格响应**生成相同 `DailySchedule`，然后证明 DisplayViewModel 和生成帧具有相同内容。
- 真实 SEIUE OAuth 和学校审批另按 P1-05/06、安全 S0–S3 执行；固件协议和显示引擎不为 SEIUE 特殊分支。
- 设备生产身份、权限、撤销、OTA/回滚按现有安全架构另行验收。

**M4 gate**：固定数据与 SEIUE 合成样例的标准化课程列表一致；共享 renderer 的输出一致；无设备源特判。

## 8. 验收矩阵与证据

| 场景 | 期望 | 必须的证据 |
|---|---|---|
| M123 2026-11-10 取消课程 | 不计入有效占用，但保留取消提示 | 单测 + 界面/位图 |
| M123 10:50 当前课 | 正确高亮 10:40–12:15 区间课程 | 单测 + 位图 |
| M105→M106 调房 | 原教室不被误判占用，新教室出现调入 | 单测 + 双房间位图 |
| M107 2026-11-11 空 AP 排课 | 与 API 错误/未知状态区分 | 单测 + 位图 |
| A101 模拟范围外 | 不显示“教室真实空闲” | 单测 + 位图 |
| M115 11 节压力画面 | 不丢节次、标题与时间可读（硬件上再测） | golden 画面 + 设备实拍 |
| 相同 manifest 重读 | 不重复刷新 | 串口日志 |
| 课程边界且课表未改变 | `scheduleRevision` 相同，`frameRevision` 更新 | 版本测试 |
| 网络失败/损坏的帧 | 不显示半张图；保留合规缓存并报错 | 失败注入 + 日志 |
| Fixed vs synthetic SEIUE | 规范化结果与渲染一致 | 契约测试 |
| 硬件分辨率变化 | 变更 `DisplayProfile` 即可重新渲染，驱动参数有映射 | 同源跨 profile 测试 |
| 真实板卡点亮与自动切换 | 不靠软件截图，真实电子纸至少两个边界切换 | 现场实拍或视频、日志、板卡信息 |

**产品完成状态严格区分**：
- M1 是 **RENDERER_READY**，不等于硬件跑通。
- M0 是 **PANEL_DRIVER_VERIFIED**，不等于 MAC 已下发画面。
- M2 是 **DEVICE_MVP_RUNNING**，不等于已经通过 30 天。
- M3 是 **LOW_POWER_BASELINED**，不等于 30_DAY_VERIFIED。
- 生产上线必须额外满足 **S0–S3** 等既有安全门禁。

## 9. 实施与仓库协作

- 基于远端 `main` 单独开 `feat/tab-epaper-mvp-v01`，先交付软件渲染及可离线验证的 fixture，再推进固件。
- 每个阶段可单独提交、运行 `npm run test:tab-schedule`、`npm run lint`、`npm run build` 以及硬件相关测试；不确定硬件的工作仍可先完成软件侧。
- 每轮工作都在 [PROGRESS.md](./PROGRESS.md) 标记任务、验收证据（PR/commit、日志和照片），保留 `NOT_READY` 直到实际验证。
- 不得修改真实数据、伪造硬件照片、编造电流值，也不得把 Demo 时间当作真实日期。
- 如果开发环境完全无法连接实际硬件，明确交付 **software-ready + firmware-prepared / HARDWARE_UNVERIFIED**，说明下次实物验证的精确操作，不得宣称屏幕已运行。

## 10. 资料

- 现有 Tab 项目 [PROJECT_PLAN.md](./PROJECT_PLAN.md)、[PROGRESS.md](./PROGRESS.md)、[SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)。
- 固定数据：[`Tab_FF01_AP_Demo_2026W46.json`](./demo/Tab_FF01_AP_Demo_2026W46.json)。
- Espressif Sleep Modes：https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/sleep_modes.html
- Espressif OTA：https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html
- GxEPD2（先确认面板兼容性）：https://github.com/ZinggJM/GxEPD2
