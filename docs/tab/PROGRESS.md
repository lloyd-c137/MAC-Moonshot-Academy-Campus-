# Tab｜开发进度与验收清单

> **项目：** MAC / Tab（无线电子纸教室课表终端）  
> **文档基线日期：** 2026-11-04  
> **项目方案：** [PROJECT_PLAN.md](./PROJECT_PLAN.md)  
> **总体状态：** **PLANNING / HARDWARE_UNVERIFIED / NOT_READY_FOR_PILOT**  
> **目的：** 持续追踪可执行任务、依赖、实际证据与阶段门禁；不得以“方案已设计”代替“功能已交付”。

## 0. 使用方法与状态规范

**勾选规则：** 只有满足对应验收标准，且有可复核的 PR / commit、测试日志、照片、测量报告或授权 API 响应记录时，才勾选为完成。没有证据的一律保持未完成。

| 状态 | 含义 |
|---|---|
| DONE | 验收标准已达到，并有证据链接 |
| IN_PROGRESS | 有实际进行中的实现和可追溯产出，但尚未验收 |
| TODO | 尚未开始或暂无可验证证据 |
| BLOCKED | 无法继续该项，记录具体阻塞和负责人 |
| USER_CONFIRMED | 用户明确确认的设计决策或采购事实，**不等于技术验收通过** |

**更新规则：** 每次开发/审查完成后更新任务状态和证据，不虚构完成比例；每轮记录下一项动作、责任人（未分配写 TBD）、相关 PR/SHA 和阻塞。文档方案变更应更新对应验收项，不得通过删除未完成任务“提升进度”。

## 1. 当前事实快照（截至 2026-11-04）

| 事项 | 状态 | 依据 / 限制 |
|---|---|---|
| 设备正式名称 **Tab** | USER_CONFIRMED | 用户已确定 |
| 产品最终形态是实体电子纸教室门牌，MAC 网页只是 MVP 预览 | USER_CONFIRMED | 用户明确范围 |
| 支持 SEIUE API + 固定课表 | USER_CONFIRMED | 用户明确双数据源要求 |
| 门口不可接线；≥30 天免充电 | USER_CONFIRMED | 硬性产品目标，**尚无测量验证** |
| ESP32 + 电子纸开发硬件 | USER_CONFIRMED | 用户表示已购买并提供面板背面照片；**型号/固件/电源尚未核实** |
| 多教室模拟数据 | REPOSITORY_FIXTURE_VERIFIED | `docs/tab/demo/Tab_FF01_AP_Demo_2026W46.json`；固定模拟数据，2026-11-09 至 2026-11-13；102 个编号空间中 53 个参与 AP 模拟，49 个明确排除 |
| MAC 现有线上平台 | VERIFIED_SITE_AND_REPOSITORY | [mac.moonshotacademy.space](https://mac.moonshotacademy.space/) 已可从浏览器读取主页；仓库具备地图/房间搜索/详情/路线/发现/传感器及本地配置管理，详见 [方案中的“MAC 线上平台”](./PROJECT_PLAN.md#21-mac-线上平台现有功能限制与-tab-的位置)；**不代表 Tab 已上线** |
| MAC 在线平台原有管理能力 | VERIFIED_CODE_WITH_LIMITATIONS | 现有 `/admin` 主要保存至浏览器 localStorage，发布变更通过 `public/campus-config.json` 和重部署；没有可直接复用的安全云端 Tab 设备管理权限体系 |
| MAC Tab 模拟预览 | IMPLEMENTED_PENDING_PRODUCTION_CHECK | `/tab/demo` 已实现，使用固定演示 Fixture；真实 SEIUE、设备管理与硬件尚未接入 |
| Tab 安全云端管理架构 | DOCUMENTED_NOT_IMPLEMENTED | [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) 已定义 Cloudflare Access/Functions/D1、独立设备凭证、撤销、审计与安全门禁；尚无生产部署或安全测试证据 |
| MAC 已有项目基础 | VERIFIED_REPOSITORY | 当前仓库 React/TS/Vite；Cloudflare Pages 文档记录 Git-connected 项目 `mac-github`、生产分支 `main`，登记域名为 `mac.lloydev.site`；`mac.moonshotacademy.space` 的线上映射待核验 |
| Tab 项目方案 | DOCUMENTED | 本次 docs/tab/PROJECT_PLAN.md |
| 真实 SEIUE 凭证 / 接口联调 | TODO | 未获得授权凭证和成功请求证据 |
| ESP32 点亮 / MAC 画面显示 / 30 天续航 | TODO | 尚无成功烧录、刷屏或功耗日志证明 |
| 实体 Tab MVP 方案 V0.1 | DOCUMENTED_ONLY | [MVP_IMPLEMENTATION.md](./MVP_IMPLEMENTATION.md) 已定义统一课表/画面/版本与固件交付门禁；**无实体设备验收记录** |
| 3D 打印外壳与安装试验 | TODO | 尚无 CAD 与实物验证证据 |

**严禁误读：** 以上为本轮已获得的证据边界，而不是声称其他开发者没有私有成果。首次执行时应重新核对远端分支/PR 与实际硬件，并补充最新事实。

## 1.1 实体 Tab MVP：开发门禁（新）

**实现合同：[MVP_IMPLEMENTATION.md](./MVP_IMPLEMENTATION.md)。** 下列条目与 P0–P3 已有任务 ID 对应，仅用于记录设备闭环验收，不重复开发已有 Tab 网页功能。

| MVP Gate | 当前状态 | 已有成果 / 需要的证据 |
|---|---|---|
| M0 实物识别、面板点亮 | TODO / HARDWARE_UNVERIFIED | P0-04/05/06：真实主控/屏幕型号、官方驱动源码、实拍和串口输出 |
| M1 MAC→电子纸帧 | TODO | P1-10：复用 PR #5 的 `schedule.ts` 和固定 Adapter，生成 deterministic `DisplayViewModel`、时间线帧、mono1 位图及 golden 测试 |
| M2 ESP32 获取/显示/自动切换 | TODO | P2-01 至 P2-05：设备下载/校验 Manifest 与 bitmaps、两次边界刷新和设备日志 |
| M3 Deep Sleep/故障恢复/功耗基线 | TODO | P3-01/02/03：实测 Wi-Fi、刷新、休眠电流、恢复与时钟；**非 30 天认证** |
| M4 来源无关契约验证 | TODO | P1-07：Fixed / 合成 SEIUE 响应产出相同统一课程及画面；真实 SEIUE 授权另行验收 |

**第一轮执行优先级：M0 硬件识别与 M1 软件位图可并行；随后集中交付 M2。** 设备型号尚未确认时可先生成候选 800×480 软件帧，但不得将其标为实物已验证。公开 Demo 不需要为此先实现 D1/Cloudflare Access，正式接口与学校真实数据不得绕过 S0–S3。

## 2. 开发主线与阶段门禁

| 阶段 | 当前进度 | 进入下一阶段的门禁 |
|---|---|---|
| **P0 方案与硬件识别** | IN_PROGRESS | 面板、主控、引脚、供电识别；官方 Demo 可点亮 |
| **P1 MAC 软件 MVP** | TODO | Fixed 可端到端展示；SEIUE 适配器边界清楚；异常场景正确 |
| **P2 ESP32 联机显示** | TODO | 不接电脑持续显示；能从 MAC 拉取新版本并恢复断网 |
| **P3 低功耗与工业设计** | TODO | ≥30 天实测；外壳、挂架、充电均安全 |
| **P4 校园试点** | TODO | 1–3 间教室安装稳定，课表、延迟和维护记录合格 |
| **P5 全校部署准备** | TODO | 批量设备/OTA/采购 BOM/维护 SOP/设施批准具备 |

阶段可以合理并行，但**未过门禁不得对外宣称该阶段完成**。P1 固定数据链路和 P0 硬件识别可以并行，不受 SEIUE 审批阻塞。

## 3. 任务清单（可直接勾选）

### P0：方案冻结、开发环境与硬件识别

- [x] **TAB-P0-01｜确认产品定位和名字。** 验收：Tab 为 MAC 下的实体终端，非独立网页产品；用户已确认。证据：产品决策及本项目方案。
- [x] **TAB-P0-02｜确认核心约束。** 验收：双数据源、门口无布线、30 天最低续航、3D 打印外壳写入方案。证据：[PROJECT_PLAN.md](./PROJECT_PLAN.md)。
- [x] **TAB-P0-03｜购入第一套 ESP32 + 墨水屏硬件。** 验收：用户明确已购买、已提供面板背面照片。**仅采购完成，不代表能工作。**
- [ ] **TAB-P0-04｜确认主控开发板准确型号。** 产出：厂商链接、芯片、Flash/PSRAM、电池/USB 接口、板卡正反面照片；负责人 TBD。
- [ ] **TAB-P0-05｜确认电子纸型号与驱动。** 产出：面板完整料号、分辨率、驱动 IC、刷新/休眠要求、FPC/转接板、GPIO 映射；不得凭“7.5 英寸”选错驱动。
- [ ] **TAB-P0-06｜官方 Demo 点亮与重复刷屏。** 产出：烧录步骤、源码/commit、屏幕实拍、完整刷新记录、异常排查。
- [ ] **TAB-P0-07｜测量电池及供电能力。** 产出：已购设备电源结构、支持的安全电池/充电模块、基线耗电测量。
- [ ] **TAB-P0-08｜明确部署环境与权限。** 产出：MAC 当前生产服务端入口及密钥存放方案，避免把 SEIUE Secret 放在 Vite 前端。
- [ ] **TAB-P0-09｜确认 MAC 正式线上域名及部署映射。** 产出：`mac.moonshotacademy.space` 的 DNS/Cloudflare Pages 绑定、生产预览路由可用性及安全后端部署选型；现有部署文档仍记录旧域名，不可凭网站可访问就宣称平台已有安全服务端。
- [x] **TAB-P0-10｜安全云端管理威胁建模与技术选型文档。** 验收：明确 Access/设备两套身份、权限、撤销、日志、数据安全、OTA 风险及 S0–S6 门禁。证据：[SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)。**这是设计完成，绝非系统上线。**
- [ ] **TAB-P0-11｜确定云服务最小部署方案。** 验收：核实 Cloudflare Access/Zero Trust 权限、D1 binding、Pages Functions 路由、生产/预览环境与真实费用限制；记录生产域名及降级方案。

**P0 Gate：** P0-04 至 P0-09、P0-11 通过；否则不得冻结硬件 BOM/外壳尺寸。

### P1：数据源 + MAC 预览（软件 MVP）

- [x] **TAB-P1-01｜确认统一课节模型与验证器。** 验收：字段、状态、时区、排序、取消/调课、空结果/失败区别及单元测试。证据：`src/features/tab/schedule.ts`、`npm run test:tab-schedule`。
- [x] **TAB-P1-02｜导入/构建固定日期课表。** 验收：使用仓库固定 fixture，为教室与日期稳定生成课程列表，标记 DEMO。证据：`src/features/tab/data/fixedSchedule.ts`、102 个编号空间映射检查。
- [ ] **TAB-P1-03｜支持周重复固定课表。** 验收：生效日期、周次、非教学日与日期例外覆盖，取消/调房规则正确。
- [ ] **TAB-P1-04｜每间教室配置唯一有效数据源。** 验收：`seiue` 或 `fixed`，切源需审核新数据，不默默混源/回退到另一源。
- [ ] **TAB-P1-05｜SEIUE 申请与配置确认。** 验收：学校授权的 `client_id`、`client_secret`、`school_id`、测试 `place_id`、只读 scope、限制与费用确认；**绝不可提交 Secret**。依赖：学校/希悦。
- [ ] **TAB-P1-06｜SEIUE 服务端适配器。** 验收：OAuth Token 轮换、课节读取、真实 JSON 样例对账、调课/取消同步行为确认、限流/失败处理；未获凭证前仅能用 mock 测适配逻辑，不能标真实接通。
- [ ] **TAB-P1-07｜固定与 SEIUE 统一输出契约测试。** 验收：两源一致的数据投影，缺字段/重叠/时间边界/空结果测试通过。
- [x] **TAB-P1-08｜MAC Tab 预览页面。** 验收：显示房间、完整日程、当前课程高亮、模拟日期/时间、来源及 DEMO 声明；无预约入口。证据：`/tab/demo`、桌面和移动浏览器检查。
- [x] **TAB-P1-08A｜与 MAC 现有房间浏览能力集成。** 验收：房间详情可带 `room_id` 进入课表预览；保留地图房间身份；明确计划课表不等于实时占用。
- [ ] **TAB-P1-08B｜MAC 线上部署与权限验证。** 验收：`mac.moonshotacademy.space` 上可访问 Tab 预览；SEIUE Secret 仅保存在受保护的服务端，管理员写入具备鉴权；现有未登录 `/admin` 及 localStorage 配置不能承担安全设备管理。
- [x] **TAB-P1-09｜显示容量/状态回归（演示 Fixture 范围）。** 验收：11 节压力日全量呈现，取消、调房、无课、范围外和无有效日期状态正确；不静默截断有效课程。硬件面板实际可读性仍待确认。
- [ ] **TAB-P1-10｜设备可复用的渲染输出。** 验收：按真实面板规格生成、预览与硬件输出信息一致，图像可被目标 ESP32 解码。
- [x] **TAB-P1-11｜MAC 现有构建验证。** `npm run lint`、`npm run build` 和本轮空间/审阅校验通过；浏览器无页面异常。证据与 commit/PR 在本轮开发记录补充。
- [ ] **TAB-P1-12｜D1 表、迁移与环境隔离。** 验收：独立预发布/生产 D1；设备、身份摘要、房间数据源、课表版本、健康与审计 schema；迁移、备份与恢复演练记录。
- [ ] **TAB-P1-13｜Cloudflare Access 与最小 RBAC。** 验收：保护 `/tab/manage*` 和 `/api/tab/admin/*`；JWT 签名/issuer/audience 验证、Viewer/Operator/Admin 服务端权限；未授权、伪造身份、跨资源、CSRF 测试通过。
- [ ] **TAB-P1-14｜真实课表与密钥保护。** 验收：SEIUE Secret 只在 Functions/Workers 环境；静态资源、浏览器包、日志不包含敏感凭证；真实课表默认受限，学校展示范围已确认。
- [ ] **TAB-P1-15｜管理员基础操作与审计。** 验收：最小 Tab 管理页支持已授权设备目录、查看状态、固定/SEIUE 数据源管理；每次写操作有脱敏审计和结果确认，不复用原来无登录的 localStorage 管理作为后端。

**P1 Gate（Fixed 模拟开发）：** P1-01 至 P1-04、P1-08、P1-08A、P1-09 至 P1-11。**P1 真实课表上线/生产管理员操作另必须通过 P1-08B、P1-12 至 P1-15 和安全 S0/S1/S3。** SEIUE 真实端到端需 P1-05 至 P1-07 的授权/联调证明；不得因 SEIUE 审批阻塞 Fixed→Tab 测试。

### P2：MAC → ESP32 → 真实电子纸

- [ ] **TAB-P2-01｜固件网络与配网。** 验收：首次配置 Wi-Fi、重启自动连接、设备身份/最低权限凭证安全存放。
- [ ] **TAB-P2-02｜设备版本接口。** 验收：MAC manifest 提供教室、画面 hash、有效日期与资源地址。
- [ ] **TAB-P2-03｜下载并刷屏。** 验收：ESP32 成功显示当天完整课程；版本不变时不重复刷屏；真实设备照片与日志。
- [ ] **TAB-P2-04｜正确时间与边界切换。** 验收：课程开始/结束时状态正确；若需要联网取新图，准确计入续航预算。
- [ ] **TAB-P2-05｜离线/重连/掉电恢复。** 验收：显示日期正确的缓存，不误报“无课”，并在网络恢复后同步。
- [ ] **TAB-P2-06｜固件与设备最小诊断。** 验收：可读固件版本、最近联网/显示版本，异常错误可定位。
- [ ] **TAB-P2-07｜每设备唯一身份与安全注册。** 验收：至少 256-bit 随机 Token、服务端仅保存摘要、USB 安全写入（不硬编码到固件）、pending→active、凭证轮换/撤销有完整测试。
- [ ] **TAB-P2-08｜设备访问授权与越权回归。** 验收：无效/已撤销 Token 拒绝；明确记录 Bearer Token 复制后无法自动辨认克隆的限制，测试异常访问监控与管理员撤销；设备 A 不得读取 B 教室；设备自身无法修改绑定 room；日志脱敏，HTTP TLS 校验正确；限流和错误退避已验证。
- [ ] **TAB-P2-09｜最小设备健康管理。** 验收：最近联网、预计下次唤醒、显示版本、固件版本、电池数据（可测时）及错误状态；深度休眠不误报离线；所有控制操作有审计。

**P2 Gate：** 完全脱离电脑，通过电池/安全临时电源连续正常工作、自动显示 MAC 课表，且 P2-07 至 P2-09 与安全门禁 S2 通过。

### P3：至少 30 天续航 + 3D 打印结构

- [ ] **TAB-P3-01｜低功耗电路与驱动。** 验收：Deep Sleep、电子纸休眠/断电与唤醒均有实测。
- [ ] **TAB-P3-02｜功耗计量与预算模型。** 验收：睡眠、Wi-Fi+TLS、下载、刷新、失败重试各阶段电量及平均电流；不得使用空口宣传值。
- [ ] **TAB-P3-03｜业务刷新策略测试。** 验收：至少比较 15/30 分钟轮询以及课程边界刷屏；课表变化和 30 天目标一并评估。
- [ ] **TAB-P3-04｜电池安全及充电流程。** 验收：保护与充电电路来源明确，低压处理有效；拆下整机即可充电。
- [ ] **TAB-P3-05｜参数化外壳 CAD。** 验收：准确硬件尺寸、屏幕定位/缓冲、散热、USB-C 可达、可拆后盖，3D 打印源文件入库。
- [ ] **TAB-P3-06｜墙面底座与安装试验。** 验收：机械承重、防脱/防坠、重复拆装、墙面材质与学校设施批准。
- [ ] **TAB-P3-07｜完整 30 天不充电测试。** 验收：真实配置、真实 Wi-Fi、正常课表更新、连续 ≥720 小时，留存功耗及故障记录；**短期推算不算通过**。
- [ ] **TAB-P3-08｜视觉及可读性实测。** 验收：正常走廊观看距离对比字体、密度、残影和屏幕反射，完成必要修改。
- [ ] **TAB-P3-09｜签名 OTA 和安全回滚。** 验收：HTTPS 严格证书校验、受信任签名的固件、双分区成功确认与失败回滚；先测开发板 Flash/分区兼容性、功耗与电池余量。
- [ ] **TAB-P3-10｜实际芯片 Secure Boot / Flash Encryption 评估。** 验收：芯片能力、密钥保护、eFuse 不可逆风险、装配/维修/换板流程和风险接受文件齐全，正式批量前启用或落实审核过的补偿措施。

**P3 Gate：** P3-04 至 P3-10 通过；低于 30 天续航或缺少安全 OTA/硬件安全审计不得进入规模化部署。

### P4：校园试点

- [ ] **TAB-P4-01｜选定 1–3 间教室并获得安装许可。** 验收：门框/墙面、Wi-Fi、安装高度与疏散安全确认。
- [ ] **TAB-P4-02｜至少一间 Fixed 模式现场运行。** 验收：真实使用日期/课程核对与异常处理。
- [ ] **TAB-P4-03｜至少一间 SEIUE 模式现场运行（授权前阻塞）。** 验收：课节与教务系统一致、临时调课后同步结果可复核。
- [ ] **TAB-P4-04｜运行指标及用户测试。** 验收：课表准确性、更新延迟、在线率、故障重启、取下充电便捷性、学生阅读体验有记录。
- [ ] **TAB-P4-05｜试点评审。** 验收：书面 GO / NO_GO；未通过的严重问题必须有修复证据。
- [ ] **TAB-P4-06｜试点安全红队测试。** 验收：匿名管理员访问、JWT 伪造、设备跨房间、偷盗/吊销、错误共享缓存、数据源越权、审计脱敏和网络重连均测试通过。
- [ ] **TAB-P4-07｜学校信息展示与运维授权。** 验收：学校批准真实课表字段的公开范围、管理员/运维人员、密钥交接与离线设备处理规范。

### P5：批量部署准备

- [ ] **TAB-P5-01｜最终硬件 BOM 与单台综合成本。** 包括电池、外壳、打印、组装、挂架、安装、维护，不只算开发板。
- [ ] **TAB-P5-02｜批量设备登记/绑定与安全配网。** 不能把全校设备刷进同一个无法撤销的凭证。
- [ ] **TAB-P5-03｜OTA / 升级失败回滚与断电恢复。** 验收：至少有回滚/恢复验证。
- [ ] **TAB-P5-04｜低电量、离线、过期日程监测。** 验收：运维人员知道哪台设备需要介入；电池计量硬件不支持时说明限制。
- [ ] **TAB-P5-05｜安装、充电、清洁和维保 SOP。** 验收：操作手册与责任划分经校园方确认。
- [ ] **TAB-P5-06｜区域性批量部署决策。** 依据试点证据与校方批准执行，不以原型通过直接推定校园部署完成。
- [ ] **TAB-P5-07｜凭证批量发放与灾难恢复。** 验收：各设备凭证独立、可撤销；生产 D1 备份恢复、管理员安全接管、签名固件滚动升级与回滚演练。
- [ ] **TAB-P5-08｜Cloudflare 配额和告警门禁。** 验收：按教室总量预测 Workers requests/CPU、D1 读写、SEIUE 限流、电池轮询成本，设置运行监控并记录实际开支。

## 4. 关键依赖、风险与阻塞项

| 编号 | 风险 / 依赖 | 影响 | 当前处置 / 解锁动作 |
|---|---|---|---|
| R-01 | 已购设备确切型号未知 | 可能无法选驱动、估功耗或做外壳 | 优先拍开发板正反面、保留订单型号、核对 FPC |
| R-02 | 30 天免充电未验证 | 直接阻塞正式部署 | 功耗基线→策略优化→完整 720h 实测 |
| R-03 | 学校尚未提供希悦授权 | SEIUE 端到端测试阻塞 | Fixed 先推进；同步申请只读 credentials |
| R-04 | 调课/取消真实字段及延迟未知 | 课表可能错误 | 获取真实 API 响应，对照希悦界面核验 |
| R-05 | ESP32 内存/图片格式未知 | 画面可能下载或解码失败 | 结合 Flash/PSRAM/屏幕驱动决策渲染路径 |
| R-06 | MAC 现有云端只读服务形态待定 | 秘钥/生产设备接口无法安全部署 | 查明现有 Cloudflare/Vite 部署入口 |
| R-07 | 门口墙面、Wi-Fi、充电维护流程未验证 | 安装与续航不可控 | 现场勘察并得到设施批准 |
| R-08 | 屏幕日程容量和长标题未实测 | 可能漏节次 | 实体屏幕 0/3/6/10+ 压力测试 |
| R-09 | 线上 MAC 可用但缺安全可写的 Tab 后端 | 配置/密钥/设备管理风险 | 区分现有静态平台与拟新增服务端；实现并验收鉴权与部署 |
| R-10 | MAC 当前线上页面多种演示数据与推导空间信息 | 误将模拟活动、空间推荐或几何状态视为真实排课 | 复用房间 ID，不把演示占用/活动当作 Tab 日程真相 |
| R-11 | 现有 /admin 不认证且使用浏览器本地配置 | 不能承载生产密钥与设备管理 | 新增 Access + 服务端 RBAC、D1、Secrets，S0/S1/S3 门禁 |
| R-12 | 设备被取走/泄露公用或单设备凭证 | 冒充其他教室或批量设备风险 | 每台唯一高熵凭证、服务端绑定房间、可吊销、S2 跨房间测试 |
| R-13 | 设备启动/OTA 芯片能力未知 | 远程升级存在被劫持、变砖风险 | 真实芯片确认+签名 OTA/回滚/安全引导评估，S5 |
| R-14 | 公网预览及图片缓存误公开真实教务数据 | 学生或教师日程被公开 | 真实数据默认私有、鉴权、禁止共享缓存、校园授权后发布 |
| R-15 | 深度休眠导致误判在线状态 | 运维告警失真，徒增耗电 | 按 next_expected_at+宽限判断离线，不用持续 MQTT/推送 |

原则：**R-03 不阻塞 Fixed→MAC→Tab 主线**；R-01 和 R-02 是硬件试点的真实硬门槛。

## 5. 下一轮优先执行顺序（可并行但不重复造轮子）

**主线 A：软件先跑通**
1. P1-01 统一模型与状态测试。
2. P1-02 固定模拟数据 fixture 导入，并确认它不是权威学校排课。
3. P1-08 / P1-08A / P1-09：MAC 课表预览、房间入口集成及多密度压力测试。
4. P1-10 根据真实面板生成电子纸可用位图。
5. 并行核查 P0-11 与 S0：现有 Cloudflare Pages 域名和 Zero Trust/Access/D1 能力；先实施最低权限与密钥保护后再连接真实学校课表。

**主线 B：硬件识别**
1. P0-04 / P0-05 获取准确板卡与面板资料。
2. P0-06 官方 Demo 点亮，记录引脚、驱动和编译环境。
3. P0-07 确认电池/充电/休眠能力后再设计精确电池结构。

**外部依赖：** P1-05 由学校协调希悦授权，P1-06 联调随凭证到位启动。

**明确不提前启动：** 自研充电 PCB、批量外壳生产、独立设备云平台、自动预约功能。省去“先做一整套基础设施再想办法让屏幕亮起来”的经典工程浪费。

### 设备 MVP 下一轮工作建议（2026-11-04）

1. 检查现有 `src/features/tab/schedule.ts`、`fixedSchedule.ts`、`/tab/demo`，**禁止重做 PR #5 的页面、搜索、状态机和数据导入**。
2. **M1** 新增单一 `DisplayViewModel`、跨数据源标准 `DailySchedule`、确定性的 mono1 帧和 Manifest；固定数据与合成 SEIUE 的合同测试。
3. **M0** 核对已购板卡/电子纸，使用官方 Demo 点亮实屏，记录引脚、内存和图片格式。
4. **M2** 将 M1 的帧下载/校验/刷屏；测试 M123 初始 10:50 和至少两个真实面板上的自动状态边界。
5. **M3** 再进入 Deep Sleep、失败恢复和功耗测量；不可将 DEMO 加速刷屏认作 30 天续航验收。
6. 不提前做大规模 D1/Access 管理 UI、OTA、外壳或真实 SEIUE 授权。正式学校数据必须先通过安全门禁。

## 6. 开发报告模板（每轮更新）

```markdown
### 2026-11-04 · FF-01 AP 模拟课表页面
- Repo / branch / HEAD SHA: `lloyd-c137/MAC-Moonshot-Academy-Campus-` / `feat/tab-ff01-ap-demo` / implementation commit pending.
- 本轮目标（任务 ID）: TAB-P1-01、02、08、08A、09、11（固定模拟课表软件演示切片）。
- 已完成: lazy-loaded `/tab/demo`; fixed fixture adapter and schedule-state model; map room detail entry; date/time URL state; scope-out explanation; full course display and isolated M115 stress mode. Fixture stats: 102 coded spaces, 53 AP-scope spaces, 43 courses, 763 week events, 510 room-day rows, 408 status samples. Data is simulated only.
- 测试范围与结果: `npm run test:tab-schedule`, `npm run validate:spatial`, `npm run validate:review`, `npm run lint`, `npm run build` all passed. Playwright desktop/mobile: 53 rooms, M123 cancellation/current class, M105→M106 change, A101 out-of-scope, unknown date, 11 stress rows, direct query restore and no horizontal overflow; map room detail link rendered for M123; no page errors.
- 未通过 / 阻塞 / 原因: production route not yet confirmed. `mac.moonshotacademy.space` returned connection reset from this environment; deployment documentation names `mac.lloydev.site`. Verify Cloudflare hostname/deployment before marking TAB-P1-08B. SEIUE, device management, ESP32, hardware resolution and actual e-paper legibility remain unimplemented/unverified.
- 已确认的产品或架构变更: the fixture is now in-repository at `docs/tab/demo/Tab_FF01_AP_Demo_2026W46.json`; no live schedule or presence claim is made. Original M102 revision 5 and review history remain unchanged.
- 下一轮优先任务: commit/push branch, open PR, allow Git-connected Pages deployment, then verify the requested production URL and update this record with actual PR/deployment evidence.
- 本轮阶段门禁：**Fixed Demo implementation PASS; production deployment PENDING; overall P1 NOT_READY**（P1-03/04 and hardware/real-source items remain incomplete）。

### YYYY-MM-DD · Tab 开发记录
- Repo / branch / HEAD SHA:
- 本轮目标（任务 ID）:
- 已完成（必须含证据：commit/PR/测试日志/照片/测量报告）:
- 测试范围与结果:
- 未通过 / 阻塞 / 原因:
- 已确认的产品或架构变更:
- 下一轮优先任务:
- 本轮阶段门禁：PASS / NOT_READY（理由）:
```

## 7. 决策记录与版本

| 日期 | 决策 | 状态 |
|---|---|---|
| 2026-11-04 | 正式设备名称 Tab；依托 MAC，不另建独立课表云平台 | USER_CONFIRMED |
| 2026-11-04 | 两种数据源：SEIUE API / 固定课表，可逐教室选择 | USER_CONFIRMED |
| 2026-11-04 | 门口不接线；正式设备连续至少 30 天免充电 | USER_CONFIRMED |
| 2026-11-04 | 项目文档与进度分离；此文件记录验收证据 | DOCUMENTED |
| 2026-11-04 | 明确 `mac.moonshotacademy.space` 是现有 MAC 校园空间线上平台；Tab 是新增实体终端和待开发的课表功能，需复用现有房间身份、预览入口并补足安全服务端 | DOCUMENTED / TAB_NOT_DEPLOYED |
| 2026-11-04 | 云端安全架构选定 Cloudflare Access + Pages Functions/Workers + D1 + Secrets；设备独立高熵凭证、绑定、吊销、审计、HTTPS、签名 OTA；新增 S0–S6 门禁 | PROPOSED / NOT_IMPLEMENTED |
| 2026-11-04 | V0.1 实体 MVP 采用统一 DailySchedule/DisplayViewModel、分离 scheduleRevision/frameRevision、版本化 1-bit 画面与 Manifest、DemoClock/RealClock；先实屏运行再做生产化 | DESIGN_DOCUMENTED / HARDWARE_NOT_READY |

**首版基线：** 2026-11-04，创建文档与追踪骨架。**在首次实际开发会话后复查远端仓库、板卡及模拟数据来源，再更新任务状态**。不得把文档创建当作整体开发完成。
