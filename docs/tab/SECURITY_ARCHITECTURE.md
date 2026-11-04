# Tab｜安全云端设备管理架构 V1.1

> 状态：**PROPOSED / NOT_IMPLEMENTED / NOT_SECURITY_VERIFIED**  
> 基线：2026-11-04 · 所属项目 [PROJECT_PLAN.md](./PROJECT_PLAN.md) · 任务和验收见 [PROGRESS.md](./PROGRESS.md)  
> 线上平台：https://mac.moonshotacademy.space/  
> 目的：为校园长期部署的实体 Tab 提供最小、可扩展、可撤销、可审计的云端身份、课表交付与设备管理能力，**不自行重做通用 IAM、数据库或 IoT 平台**。

## 0. 结论和技术选型

**推荐：沿用 MAC 的 Cloudflare Pages 站点，在同域增加 Pages Functions（或有明确部署理由的 Worker）+ Cloudflare D1 + Cloudflare Access + Cloudflare Secrets。**

| 层次 | 推荐 | 原因与边界 |
|---|---|---|
| 现有公众网站 | React/Vite/Cloudflare Pages，继续位于 `mac.moonshotacademy.space` | 保持现有地图、房间与导航；不为 Tab 复制前端平台 |
| 人员认证 | Cloudflare Access：保护 Tab 管理页面和管理员 API | 利用成熟的身份代理和组织成员策略；必须配置学校授权账户 |
| 管理 API / 设备 API | 同域 Pages Functions / Worker | 将敏感逻辑放在服务端；区分人员和设备的鉴权路径 |
| 数据 | Cloudflare D1 | 房间与设备绑定、固定课表、版本、身份摘要、状态、审计 |
| 长期第三方密钥 | Cloudflare Secrets | SEIUE `client_secret` / `client_id` 等敏感信息不可暴露到 Vite 构建或 `public/` |
| 图片和固件 | 先使用小型受控版本化资源；体量增加后评估 R2 | 不在第一天引入 R2、KV、Queues、Durable Objects |
| 定时任务 | 先按设备拉取 + MAC 业务更新实际需求实现；后台定时同步需要时使用 Worker Cron | Pages Functions 不等于自动提供后台定时器，Cron 需要独立部署和验证 |
| 终端 | ESP32 HTTPS 定期 Pull、独立凭证、深度休眠 | 不开放设备入站端口，不依赖常连接 MQTT 或浏览器 OAuth |

**MVP 使用高熵、每台唯一、可撤销的设备 Bearer Token + TLS**，而不是一台一套 SEIUE 凭证，也不是所有设备公用一个 Token。少量设备先走管理员手动安全配置，不开放匿名自动注册；量产规模或威胁模型提升后可改为每设备非对称密钥/证书与可信配对，但**必须保留兼容性的版本迁移方案**。

### 已核实的 MAC 现状

仓库有 `src/App.tsx`、`src/config/campusConfig.ts`、`docs/ADMIN_AND_SENSORS.md` 和 `docs/CLOUDFLARE_PAGES.md`。目前 MAC 核心站点是 React/Vite 构建后部署到 Cloudflare Pages；现有 `/admin` 无登录，数据主要写入浏览器 localStorage，发布的配置存放在 `public/campus-config.json`。**不能将它直接变成 Tab 生产级后台。**

线上 `mac.moonshotacademy.space` 可访问，但仓库部署文档仍记载旧域名 `mac.lloydev.site`；尚未核实新版域名是否归属同一 Cloudflare zone / Pages 项目。**域名/Account/Access 配置验证是开工前置条件**。

## 1. 安全目标与威胁模型

| 风险场景 | 必须具备的防护 |
|---|---|
| 匿名互联网用户访问/修改课表 | 管理 API 需要验证人员身份和权限；初期真实课表预览默认私有 |
| 学生扫描、猜测设备 ID，伪装成其他教室 | 独立设备 Token；服务端从设备身份查绑定的 room ID，**不信任 URL/参数中的任意 room ID** |
| 某台设备被取走、拆机或密钥泄漏 | 只影响该设备；可暂停/撤销/换密钥；量产前评估 Secure Boot + Flash Encryption 与机械防拆 |
| 前端 JS 泄漏 SEIUE 密钥 | 云端 Secrets；仅 Functions/Workers 可访问，端侧和静态资源不可读取 |
| 冒充管理员/绕过 Access | Access 保护路径 + 服务端验证 Access JWT/受信任身份；按角色鉴权；不得只信任任意可伪造请求头 |
| CSRF/XSS/越权或错误修改 | 写接口校验 CSRF/Origin，输入验证，最小权限，逐资源授权与审计 |
| 重放/盗用设备访问令牌 | 全程 HTTPS、短作用域、凭证更换/撤销、日志脱敏、限流；硬件适配后升级证书/签名请求 |
| 中间人替换图像/固件 | TLS 正确校验证书；OTA 要签名验证并能回退 |
| 单台设备离线、停止供电、网络故障 | 健康状态和预期下次上线时间；画面有日期、同步状态，管理员能识别失联 |
| 操作员误改全校课表 | 分范围权限、明确确认、审计、版本历史、回滚与变更预览 |
| 存储/平台故障、配额耗尽 | D1 可恢复备份/Time Travel、合理缓存和流量限制；不把空响应误认为无课 |

**当前不承诺物理防破解**：尚未识别实际 ESP32 型号及 eFuse、安全存储/PSRAM/Flash 配置。Secure Boot 和 Flash Encryption 属于正式校园试点前必须评估并通过或出具明确风险接受记录的能力；**不能在开发板上未经验证就熔断不可逆 eFuse**。

## 2. 信任边界和接口分区

```text
[Public MAC Pages] ------------------------------------- public static assets
       │
       ├── /tab/preview              (真实课表默认受限；DEMO 可公开)
       │
       ├── /tab/manage               (human UI)
       │             │
       │       Cloudflare Access (human auth / IdP)
       │             ▼
       │       /api/tab/admin/*      (Access verified + role checks + audit)
       │             │
       │             ▼
       │       D1 + Secrets          (server only)
       │
[Tab ESP32] ---- HTTPS only ----> /api/tab/device/v1/* (unique device token)
       │                                 │
       └── periodically wakes           └── derive bound room, schedule and
           and polls                          version, never accept arbitrary room
```

- **人员通道**：`/tab/manage*` 和 `/api/tab/admin/*` 由 Access 的确切路径规则保护；服务器还要验证来自 Access 的签名身份及角色。不能全站套 Access 导致正常校园网页及 ESP32 被重定向到登录页。
- **设备通道**：`/api/tab/device/v1/*` 不走浏览器登录；必须验证独立设备凭证。若采用 Cloudflare Access 的 service-token 机制，也必须设计**每设备独立、可撤销、与课程范围绑定的服务端授权**；初代不额外引入第二套复杂身份机制。
- **预览通道**：公开的 DEMO 与真实课表严格隔离。真实课表的可见范围先取得学校批准，默认要求认证；不得依赖“网址没人知道”作为访问控制。
- **服务间调用**：SEIUE OAuth 客户端和业务 Token 存在服务端，不出现在设备固件、JavaScript 包、公开 JSON、错误日志及 CI 输出。

**Cloudflare Access 相关规则**：需要正确配置 Path 和 Allow policy；Access JWT 仅在核对签名、issuer、audience、有效期后可视为人员身份。对于同域路径/SPA 静态页面，需专项验证通配匹配和未受保护的别名域名是否可绕过。

## 3. 人员身份与授权

### 3.1 角色（不另造一个 IAM 产品）

| 角色 | 权限 |
|---|---|
| Viewer（教学只读） | 查看授权房间的真实课表、预览与设备状态 |
| Operator（设备运维） | 添加设备、绑定/解绑教室、暂停设备、触发安全配置更新；不能读取第三方 Secret |
| Admin（少量指定人员） | 配置 SEIUE / Fixed 数据源、权限、撤销凭证、发布更改与设备升级策略 |
| Device（非人类身份） | **仅访问自己绑定教室**的 manifest/画面，上传自身最小状态；无任何写课表或管理员权限 |

初期可以仅部署少量 Admin/Operator，避免先做复杂的角色界面。但后端要有明确 `actor -> allowed operation -> room/device` 判定，不能因为 Access 通过就默认可以做全部操作。人员身份可来自 Cloudflare Access，权限集合存于 D1 中，学校成员白名单/IDP 成员策略通过 Access 管理。

### 3.2 管理安全底线

- 提供可信登录并严格限制允许的学校人员；管理员使用 IdP MFA（如学校提供）。
- 管理写请求必须检验服务端角色、校验 JSON schema、阻止跨资源越权、要求 CSRF/Origin 防护，适用的 Access Cookie 采用安全属性。
- 操作包括 `create-device`、`bind-room`、`change-source`、`revoke-token`、`publish-schedule`、`deploy-firmware` 时需要记录审计事件。
- 不允许把已有无认证 `/admin` 直接连接到受保护的数据修改 API；新增独立受保护的 `/tab/manage`，旧功能迁移另行决定。

## 4. 设备身份、配对与生命周期

### 4.1 唯一设备身份

**每台设备两种标识：**
1. `device_id`：服务端生成的不敏感随机标识；可用于后台定位，**本身不是秘密**。
2. `device_token`：至少 32 字节高质量随机数转换成不可预测的字符串；**仅在发放时展示一次**，由设备安全存储。

服务端只存不可逆 Token 摘要（如 `SHA-256`，随机 256-bit Token 已足够抗穷举），不存明文；校验时使用固定路径/索引与安全比较方式。不能用 MAC 地址、序列号、教室号或所有设备共用常量当作登录凭证。设备令牌不得出现在 URL/查询参数、静态资源名或日志。

### 4.2 少量设备的最小安全注册

1. Operator 在已登录的管理页创建 `pending` 设备并指定或待指定 MAC `room_id`。
2. 服务器生成独立高熵 Token，D1 保存摘要，明文只在受控的单次注册响应中出现。
3. 通过 USB 本地安全配置工具写入设备的 NVS/凭证区域；不把密钥硬编码到固件版本或仓库。
4. 设备使用 HTTPS 发起首次认证并报告最小硬件/固件信息，后台确认与目标房间一致后启用 `active`。
5. 管理员可 `suspend`、`rotate`、`revoke`、`retire`；盗失/泄漏时立即撤销该设备，不影响其他 Tab。

**无匿名远程自注册、无通用出厂密码、无永久共享 Claim Token。** 若以后需要扫码配对，可新增一次性、短有效期、需管理员批准的 Claim，但不是 MVP 的必要依赖。

### 4.3 设备状态机与变更行为

`inventory -> pending -> active -> suspended -> revoked/retired`

- Pending：仅允许限额的首次激活，不返回生产课表。
- Active：仅获取自身已绑定教室的显示数据。
- Suspended：认证有效但禁止获取新画面；可允许受限的状态上报以协助维修，具体需测试。
- Revoked/Retired：凭证彻底失效；如需复用必须重新注册/重发密钥。
- Rebind（M123 → M118）：只能由 Operator/Admin 修改并审计，服务端立刻以新映射作为权威，设备下次联网收到更新。**设备请求不能自行提交 room_id 改变身份绑定**。

注意：墨水屏可能在撤销、断电后仍保留最后显示的画面。**远程撤销不能保证立即清除物理屏幕**，丢失/下线设备还需现场移除或处理。

## 5. 数据模型（最小实现）

复用现有 MAC `room_id`，不另造一套教室主数据。建议 D1 表：

| 表 | 主要字段 | 职责 |
|---|---|---|
| `tab_devices` | `device_id`, `room_id`, `status`, `hardware_model`, `firmware_version`, `last_seen_at`, `next_expected_at`, `created_at` | 设备唯一身份、教室绑定及状态 |
| `tab_device_credentials` | `device_id`, `token_digest`, `credential_version`, `revoked_at`, `created_at` | 每设备 Token 摘要及轮换/撤销 |
| `tab_room_sources` | `room_id`, `source_type`, `seiue_place_id`, `fixed_schedule_id`, `updated_at` | 唯一正式数据源与配置 |
| `tab_schedule_revisions` | `room_id`, `date`, `revision`, `valid_until`, `source`, `projection_json`, `fetched_at` | 当日已验证课表快照/版本 |
| `tab_fixed_schedule*` | 日期表 / 周循环模板 / 特殊日期覆盖 | 固定排课数据，避免所有变化都写死在代码 |
| `tab_device_reports` | `device_id`, `seen_at`, `display_revision`, `battery_pct?`, `error_code?` | 最小健康诊断；可清理过期明细 |
| `tab_admin_roles` | `subject_id`, `role`, `room_scope`, `status` | 管理员最小授权 |
| `tab_audit_events` | `at`, `actor_id`, `action`, `target_type`, `target_id`, `result`, `request_id`, `redacted_diff` | 安全审计追踪 |

建议唯一性约束：活动中的 `device_id` 唯一、Token digest 唯一、同 `room_id/date/revision` 唯一；允许一间教室暂有 0–1 台正式安装设备，测试和替换设备可标为 `staging`，不要用数据库唯一键妨碍原型/换机，但**正式 active 安装绑定应能识别重复设备**。

D1 采用参数化 SQL，写入事务/批处理确保绑定和审计同步提交；保留数据库迁移、预发布环境、备份/时间点恢复和回滚记录。完整课表可能包含敏感数据，只保留当前及必要历史窗口，不无限期存个人信息。

## 6. 最小 API 合同

### 6.1 设备接口（**每次请求都必须验证设备 Token**）

| 方法 | 路径（建议） | 权限/响应 |
|---|---|---|
| `GET` | `/api/tab/device/v1/manifest` | 自己绑定的 `room_id`、日期、画面版本/格式、`next_check_at`、必要状态；设备不指定其他 room |
| `GET` | `/api/tab/device/v1/display?revision=...` | 只读自己教室的**已授权**画面，按实际电子纸支持的位图格式 |
| `POST` | `/api/tab/device/v1/heartbeat` | 报告最小状态：当前固件、最近成功刷屏版本、错误码、可用时的电池电量 |

- 不存在无认证的 `?room=M123` 换课表漏洞。
- 全链路 HTTPS 严格验证服务器证书；Token 放 `Authorization: Bearer`，不得通过 URL、日志、响应或静态 HTML 暴露。
- manifest 返回 `Cache-Control: private, no-store`；动态真实画面不得被共享公共 CDN cache 泄露。若以后优化缓存，需先保证按设备/权限隔离。
- 未授权返回 401/403，并隐藏设备是否存在的信息；过期/版本不存在返回明确错误，不静默展示其他房间画面。
- 带每设备合理限流、体积限制、Content-Type/结构校验；离线和错误重试采用指数退避，不能为了安全事件导致电池迅速耗尽。

### 6.2 管理接口（**Access + 服务端 RBAC + 审计**）

- `GET /api/tab/admin/devices`：已授权房间的设备目录和健康状态。
- `POST /api/tab/admin/devices`：创建 pending 设备、一次性生成凭证。
- `POST /api/tab/admin/devices/:id/activate`：人工激活与绑定。
- `POST /api/tab/admin/devices/:id/suspend|revoke|rotate`：生命周期与安全响应。
- `POST /api/tab/admin/rooms/:id/source`：SEIUE/Fixed 选源变更，预览后发布。
- `GET /api/tab/admin/audit`：按权限查看脱敏操作记录。

上面路径是**设计合同**，尚未实现；正式编码可按 REST 约定调整，但必须保留认证、作用域、审核及记录语义。

### 6.3 课表与权限

SEIUE 由后端使用 OAuth/Secret 查询；Fixed 由已授权人员维护或通过受控发布读取。两源统一模型，保留 `source`、`revision`、`fetched_at` 和 `valid_until`。**设备只获取渲染后的最小信息，不包含 OAuth 凭证、无关学生信息或所有教室数据。**

## 7. 运维：设备健康、刷新节奏和审计

**Tab 是深度休眠设备，不能用持续在线作为健康条件。** 定义 `next_expected_at` / `last_seen_at`，只有错过约定唤醒窗口和合理宽限时才标为异常；夜间低频心跳不意味着离线。

建议最小管理页面：
- 设备 ID / 所属教室 / 状态（pending、active、suspended、revoked）。
- 最近一次成功连接/成功画面版本/下一次预期同步。
- 固件版本与最近错误码。
- 电量，**只在实际硬件支持可靠测量时显示**；否则标为“不可测”。
- 设备注册、暂停、撤销、更换绑定；所有写操作均有操作者记录。

审计动作包括设备激活/绑定/失效、课表数据源变更、权限更新、固件发布/回滚，记录 actor、timestamp、target、result、request_id；敏感参数须脱敏。不把设备 Token、SEIUE Secret、JWT 或整份学校课表写入日志。日志保留策略暂建议**90 天作为待校方批准的候选值**，不是已经生效的规则。

**没有设备 Push 命令/长连接。** 管理端“立即更新”仅产生待更新目标版本；设备在下次醒来检查后执行，后台清楚展示“待领取/已领取/已显示”。这兼顾无布线、续航 ≥30 天与可靠性。

## 8. OTA、设备安全与发布策略

**MVP 不以 OTA 为首日必需，但**在全校试点/规模化之前必须有安全的固件升级与故障回滚办法，不能让几十台挂在墙上的设备只能逐台拆下刷机。

- 以已购 ESP32 具体芯片确认 ESP-IDF 官方支持的 **HTTPS OTA**、双分区、固件签名及回滚；尽可能启用 Secure Boot / Flash Encryption（需严格硬件兼容与量产流程评估）。
- 签名私钥保存在受控构建/发布环境，不进入设备和 GitHub 仓库。
- 固件版本与最低安全版本管理；阻止降级至已知漏洞版本。
- 发布过程 `draft → approved → pilot (1台) → small batch (3台) → rollout`，失败停止发布；每次实际下载与激活均应可追溯。
- OTA 仅在电量充足、可安全写入时执行；成功确认应用有效，失败自动回滚。
- Secure Boot 的 eFuse 可能不可逆，**开发阶段禁止未评估就开启永久锁定选项**。
- 若实际硬件不支持关键安全能力，明确风险级别并换板或取得书面补偿措施，不可在进度文档里假装已支持。

## 9. 部署与成本控制

### 9.1 部署策略

1. 核对 `mac.moonshotacademy.space` DNS、Cloudflare 账号/zone 与当前 Pages 项目，以及 Cloudflare Zero Trust Access 可用性。
2. 新增专用 `/functions/api/tab/...` 路由或对应 Worker（**部署形式在部署检查后冻结**），不改变现有地图和静态页面。
3. 配置 D1 binding、生产/预览隔离、必要 Secrets（Cloudflare Dashboard/Wrangler），不提交任何真实密钥。
4. 配置并验证 Access 保护 `/tab/manage*` 和 `/api/tab/admin/*`，同时**不保护设备 API**；服务器自身验证身份以防配置绕过。
5. 针对失败请求、日志、缓存、跨域和 CSRF 做测试；静态路由利用 Pages 的 `_routes.json` 避免让静态网页都计为 Functions 请求。
6. SEIUE 如果需要周期性服务端刷新，再增设已验证的 Worker Cron（UTC 时区换算）；不要在 Pages Functions 中假定定时任务存在。

**现实限制：** Cloudflare Workers Free 有请求量和 CPU 时间限制；图像渲染/压缩若超过 Worker CPU 预算，应先按设备尺寸缓存预生成的画面，必要时付费升级；不要承诺所有云端费用必然为零。大量屏幕图像版本或固件可在需要时采用 R2，不为了“架构完整”提前加 R2。

### 9.2 简单流量量级

**说明性假设，不是学校实际负载：** 30 台设备，仅教学时段 10 小时、每 15 分钟检查一次，则约 **1,200 次 manifest 检查/天**，还不含画面下载、心跳、重试和后台同步。该量级可先用 Pages Functions + D1 评估实际额度。增加设备/缩短刷新时间，需要重新核算 API 请求、D1 rows read/write、CPU、SEIUE 限流和电池预算。

### 9.3 为什么暂不选 AWS IoT Core / MQTT

AWS IoT Core 提供完备的设备注册、X.509 证书、IoT Policy 和 Fleet Provisioning；如果未来发展为多校区、大量设备与高频双向控制，它很有价值。**当前 Tab 只有低频单向读取和少量状态回报**，引入 MQTT Broker、证书工厂流程与另一套 IoT 平台会增加运维和集成负担。暂采用 Cloudflare + HTTPS Pull，并保留设备 API 版本化便于将来迁移。

## 10. 安全验收门禁（全部必须有证据）

| Gate | 需要通过的最小测试 | 失败影响 |
|---|---|---|
| S0 基础部署 | 真实域名路由、独立预发布 D1/Secrets、无泄漏的配置发布 | 禁止连真实学校数据 |
| S1 人员安全 | 匿名/非授权访问 `/tab/manage` 和管理 API 均拒绝；JWT 伪造/错误 aud/过期拒绝；viewer 无管理写权 | 禁止管理端上线 |
| S2 设备身份 | 无 Token/错 Token 拒绝；设备 A 不得读 B 的课表；暂停/撤销实时生效；不能用房号越权 | 禁止设备连接生产 |
| S3 数据保护 | SEIUE Secret 不在前端包/仓库/日志；真实数据默认非公开；数据源切换审计与失败回滚 | 禁止真实课表发布 |
| S4 可靠性与成本 | 30 台假设备压力/限流/错误重试、API/缓存正确、D1 迁移恢复、日志脱敏、夜间休眠可识别 | 禁止校园试点 |
| S5 固件安全 | HTTPS 证书校验、固件签名/验证、升级失败恢复；芯片 Secure Boot/Flash Encryption 评估或替代控制记录 | 禁止规模化 |
| S6 实体现场 | 学校网络隔离、安全安装、设备丢失处理及 **≥30 天续航实测** | 禁止规模化 |

**反例测试必须包括**：一个学生直接请求后台接口、把其他房间 ID 写进设备 URL、克隆设备 Token、撤销后继续请求、伪造 Access 头、误设公开缓存、泄露响应日志、断网后持续显示过期课表、OTA 中途掉电。

## 11. 阶段交付

| 阶段 | 安全工作 |
|---|---|
| **P0** | 确认 Cloudflare 部署、Access、D1 与成本限制；核对板卡安全能力；威胁模型和权限矩阵 |
| **P1** | D1 schema + migrations、Secrets 配置、Access 保护管理路由、RBAC、Fixed 模式测试、受保护 Tab 预览 |
| **P2** | 每设备唯一 Token、手动安全注册、设备 Pull/身份绑定/撤销/审计、最小心跳与可靠重试 |
| **P3** | 实测省电 + 签名 OTA/回滚、机械防拆和电池安全；完整 30 天测试 |
| **P4** | 校园 1–3 台试点、未授权攻击回归、学校权限/隐私/维修流程确认 |
| **P5** | 批量发放/轮换、OTA 灰度发布、备份/恢复演练与运维文档 |

Tab 可以用模拟数据完成软件和显示联调，但**真实教室数据、可远程改变设备状态的管理接口必须先通过 S1–S3 安全门禁**。

## 12. 官方资料与不重复造轮子的依据

1. **NISTIR 8259A IoT device core baseline**：[NIST 官方](https://csrc.nist.gov/pubs/ir/8259/a/final)，强调唯一设备身份、数据保护、访问控制、安全更新及安全状态感知。
2. **NIST IoT Technical Capabilities**：[设备能力清单](https://pages.nist.gov/IoT-Device-Cybersecurity-Requirement-Catalogs/technical/)。
3. **OWASP IoT Security Verification Standard**：[ISVS](https://owasp.org/projects/iot-security-verification-standard)。
4. **OWASP API Security Top 10 2023**：[官方风险](https://owasp.org/projects/api-security-project)，尤其 BOLA、Broken Authentication 和权限缺陷。
5. **Cloudflare Pages Functions bindings**：[D1 + Secrets](https://developers.cloudflare.com/pages/functions/bindings/)。
6. **Cloudflare Access protected paths**：[应用路径与优先级](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)。
7. **Cloudflare Access JWT validation**：[签名、issuer、audience](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。
8. **Cloudflare Functions routing**：[_routes.json 与计费边界](https://developers.cloudflare.com/pages/functions/routing/)。
9. **Cloudflare Workers/D1 pricing**：[Workers](https://developers.cloudflare.com/workers/platform/pricing/) / [D1](https://developers.cloudflare.com/d1/platform/pricing/)。
10. **Espressif Secure Boot / OTA**：[ESP32-S3 Secure Boot v2](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/security/secure-boot-v2.html) / [OTA Rollback](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html)。
11. **AWS IoT Core provisioning comparison**：[官方设备证书与注册](https://docs.aws.amazon.com/en_en/iot/latest/developerguide/iot-provision.html)。
12. **Cloudflare Workers Cron**：[定时任务](https://developers.cloudflare.com/workers/configuration/cron-triggers/)。

> **结论**：先把安全身份、权限、撤销、审计与可恢复性做正确，再逐步补全设备管理 UI；不要把旧 `/admin` 的 localStorage 配置当成“云端安全设备管理”。这份文档是可实施设计和验收契约，**不是实现已完成的声明**。
