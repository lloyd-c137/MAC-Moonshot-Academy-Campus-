# MAC — Moonshot Academy Campus (Your Campus, Alive)
### Floor-Plan-Driven 2.5D Interactive Campus Platform

MAC 是专为**北京探月学院（Moonshot Academy）**打造的数字孪生与生活体验平台。它以真实工程建筑施工图纸 **《01_探月26年平面系统图（根据最新导视图更新）20260806》 (FF-01)** 为唯一空间事实权威，采用轻盈、温暖的 2.5D 正交建筑剖切（Stylized Architectural Miniature World）风格，让学生探索空间、寻找合适角落、感知微气候环境、发现活动并回顾校园记忆。

---

## 核心系统架构与交付成果

### 1. 权威平面图纸空间还原 (Spatial Truth & Fidelity)
- **源工程图纸信息**：
  - 图名：总平面布置图 (`FF-01`)，比例 `1:300`，出图单位：广州亚泰建筑设计院有限公司。
  - 总体轴网尺寸：横向 **134,100 mm (134.1m)**，纵向 **115,800 mm (115.8m)**，标准柱网 8.4m。
- **中央莲花球场 (Central Lotus Arena)**：
  - 八面多边形莲花环抱式建筑构架。
  - 标准比赛场地、看台阶梯、记分牌、无障碍 FOP 区、摄影沟及外围环形疏散连廊。
- **西侧 M 系列空间 (Western Wing)**：
  - 核心学习造物空间：`M104 一小步空间` (62.6m²)、`M103 创客空间` (196.3m²)、`M102 设计工作室` (131m²)。
  - 科学艺术实验室：`M124 科学实验室`、`M126/M127`、`M128 音乐教室`、`M129 计算机教室`。
  - 隐私保护区：`M116 护士站`、`M117 隔离室`（遵循隐私规范，不公示实时人数）。
- **环形 S 系列空间 (Central S-Series)**：
  - `S404 / S405 绝对安静自习室` (Silence Preferred)。
  - `S202 对话空间` (Conversation & Group Discussion)。
  - `S104 赤子书院`、`S203 上善书院`、`S204 复朴书院`、`S205 无极书院`。
  - `S100 阅览室` (208m²)、`S407 图书馆`、`S101 录音室`。
- **东侧 A 系列空间 (Eastern Wing)**：
  - `A114 / A115 校园大餐厅` (509.8m² + 147m²)。
  - `A217 多功能厅` (186m²)、`黑匣子小剧场` (104m²)。
  - `A221 小学图书馆`、`A111 小学科创教室`（标记为小学专属/权限准入）。
  - `北苑与南苑中庭花园` (145m² / 152.7m² 天然采光天井与绿植)。
- **楼层纪律 (Floor Integrity)**：
  - 严格基于 FF-01 单张权威施工图构建，其他未提供图纸依据的楼层在审计中统一标记为 **Not Available**，坚决不凭空虚构。

---

### 2. 交互与功能矩阵 (Features)

| 功能模块 | 说明 | 状态 |
|---|---|---|
| **2.5D Orthographic Map** | Three.js 正交投影、平滑阻尼插值、鼠标拖拽漫游、滚轮缩放、正交视角与全图自适应 | ✅ 已交付验证 |
| **Room Intelligence** | 选中任何空间展开面板：空间类型、准入权限、占用状态、微气候传感读数、24小时历史折线、设施标签 | ✅ 已交付验证 |
| **Environmental Layers** | 地图一键切换：温度 (°C)、湿度 (%)、CO₂ 新风 (ppm) 空间分级着色与图例 | ✅ 已交付验证 |
| **Campus Pulse** | 莲花球场、大餐厅、创客工坊等核心人流枢纽的活跃脉动涟漪展示 | ✅ 已交付验证 |
| **Campus Time Machine** | 单个空间维度的 [当下 Now / 记忆 Past / 未来 Next] 三重时空穿梭 | ✅ 已交付验证 |
| **Find My Spot** | 自然语言意图空间匹配（安静自习、好友研讨、清凉房间、新风极佳、静心阅读、实验造物等），提供透明匹配依据与打分 | ✅ 已交付验证 |
| **Indoor Navigation** | 基于真实走廊与门洞拓扑路网的 Dijkstra 寻路算法，生成无穿墙路线、步行距离与预估耗时，并在 3D 地图中描绘发光动线 | ✅ 已交付验证 |
| **Moments & Memory** | 支持学生自选空间上传图片、撰写心情故事，带点赞互动与本地浏览器持久化保存 (LocalStorage) | ✅ 已交付验证 |
| **Geometry Review Mode** | 空间事实对照抽屉：叠加 1-18 轴与 A-Q 轴网线、拓扑路网连线、几何审计核验清单 | ✅ 已交付验证 |

---

### 3. 本地运行与构建指令 (Development & Build)

```bash
# 1. 安装项目依赖
npm install

# 2. 启动开发服务器 (默认端口 3000)
npm run dev

# 3. 生产环境构建与验证
npm run build
```

---

### 4. 未来接入真实传感器与校园系统指引 (Future Integration Roadmap)

1. **环境传感器接入 (IoT Telemetry)**：
   - 空间模型已标准化封装 `EnvironmentalReading` 接口，预留了 `sensorId`、`sensorHealth` ('live' | 'stale' | 'offline')。
   - 接入时只需实现一个 MQTT / WebSocket 客户端，将教室传感器数据流实时映射入 `CAMPUS_SPACES.environment`。
2. **门禁与排课系统对接 (Access & Timetable)**：
   - 当前已严格解耦 `access` ('open' | 'closed' | 'restricted') 与 `occupancy` ('available' | 'in_use' | 'crowded')。
   - 对接教务选课系统及门禁刷卡闸机后，即可动态切换当前时段的教室开放情况。
3. **隐私合规机制 (Privacy by Design)**：
   - 护士站、心理辅导室、隔离室在数据层配置了 `isPrivateRoom: true`，即使接入人脸识别或红外人数传感器，前端亦遵循隐私守则屏蔽精细人数展示。
