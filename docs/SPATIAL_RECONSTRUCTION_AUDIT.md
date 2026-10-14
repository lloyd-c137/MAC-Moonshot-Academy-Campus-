# MAC — 空间可视化与交互架构深度审计报告 (Spatial Reconstruction Audit)

**项目**: MAC — Moonshot Academy Campus  
**任务**: P0 建筑三维化重构 (Architectural 3D Reconstruction) + 地图导航与相机交互系统重构 (Camera Interaction Overhaul)  
**日期**: 2026-10-14  

---

## 1. 现有实现技术审计 (Current Implementation Audit)

### 1.1 当前地图渲染技术 (Rendering Tech)
- **核心引擎**：Three.js (r160+)，采用 `THREE.OrthographicCamera`。
- **渲染器配置**：`ACESFilmicToneMapping`，`SRGBColorSpace`，支持软阴影 `PCFSoftShadowMap`。
- **状态管理**：React 19 + TypeScript，UI 覆盖层（TopNav, ContextDetailPanel, BottomDiscoverDock, FindMySpotModal, NavigationPanel, GeometryReviewDrawer）。

### 1.2 当前 Floor Polygon 与 Room Geometry 生成逻辑
- **当前机制**：`CAMPUS_SPACES` 定义了各个空间的多边形轮廓点（`polygon: Point2D[]`）。
- **核心缺陷 (Needs Replacement)**：
  - 目前仅使用 `THREE.ExtrudeGeometry(shape, { depth: 8.0 })` 将房间整体拉伸为一个实体厚块（Solid Extruded Polygon），这导致每个房间更像一个厚垫子或实心积木，而不是一座带有**中空室内地面、真实围合墙体（厚度与高度）、门洞开口（Door Openings）**的真正建筑微缩模型（Architectural Cutaway / Dollhouse）。
  - 用户从斜上方观察时，无法看到教室内真实的地面、隔墙与走廊通道的围合关系。

### 1.3 当前中央莲花球场 (Lotus Arena) 生成逻辑
- **当前机制**：球场地面由一个六边形挤压块承托，看台只是三层同心放大的八边形薄片（ShapeGeometry）。
- **核心缺陷 (Needs Refactor)**：
  - 缺少真实的中央下沉/深凹比赛大厅构造。
  - 看台未形成立体的梯级踏步剖面（Stepped Seating Geometry）。
  - 周围环廊通道（Ring Corridor）与外围 S 系列房间的通廊开口未做物理开孔，无法体现多边形场馆的透空空间感。

### 1.4 当前 Camera 控制与交互系统
- **当前机制**：自定义指针事件处理，仅在 pointermove 中计算 `dx, dy` 并线性修改 `cameraTarget.current.pos.x / z`。
- **核心缺陷 (Needs Replacement)**：
  - **Pan 不自由**：未通过数学射线交于世界地平面（Ground Plane Ray Intersection），导致在不同缩放级别下拖拽手感不一致，易产生漂移或卡顿。
  - **Zoom 无法围绕光标**：目前滚轮缩放仅修改 `camera.zoom`，强制将缩放锚点固定在屏幕中心，不支持高阶现代地图的“以鼠标当前指针位置为锚点连续缩放 (Zoom at Cursor)”。
  - **缺少 Rotate**：右键拖拽无法自由调整 2.5D 水平环视与合理俯仰角。
  - **缺少真正的 2D / 2.5D 切换**：当前只有静态重置按钮，没有严格无透视正俯视 2D Plan View（Top-Down）与 2.5D Explore View 的无缝平滑姿态过渡动画。

### 1.5 现有功能复用评估 (Component Reuse Matrix)

| 模块 | 评估结论 | 处理策略 |
|---|---|---|
| `CAMPUS_SPACES` (空间事实数据) | **Can Reuse** | 空间 ID、编号、中英文名称、面积、功能属性完全保留，扩展墙体与中空房间几何 |
| `NAVIGATION_NODES` & `EDGES` (走廊路网) | **Can Reuse** | 真实走廊拓扑与 Dijkstra 寻路算法完整保留，路线贴地渲染 |
| `EnvironmentalReading` & `CAMPUS_EVENTS` | **Can Reuse** | 传感器数据模型、温度/湿度/CO₂ 分级着色、校园活动完好保留 |
| `ContextDetailPanel` (房间面板) | **Can Reuse** | 24小时趋势折线、时空穿梭 (Now/Past/Next)、隐私保护策略完好保留 |
| `CampusCanvas.tsx` (3D 视图与控制器) | **Needs Refactor & Overhaul** | 重构为真实三维切片建筑模型 + 统一 Camera Controller (Pan, Zoom-at-cursor, Rotate, 2D/2.5D) |
| `TopNav` & UI 控件 | **Needs Update** | 在右下角/顶部增加专业 2D/2.5D 视图切换和罗盘重置控件 |

---

## 2. 重构设计蓝图 (Refactor Architecture)

1. **真实三维剖切建筑 (Architectural Dollhouse 3D Reconstruction)**：
   - **Floor Slab**：每个房间独立的下凹或齐平室内地坪（带环境热力材质与选中高亮）。
   - **Boundary Walls**：真实的厚度（0.3m~0.4m 建筑实体隔墙）、可见高度（3.2m 规范高度，Cutaway 剖切视野），并在走廊连通处开设门洞开口（Door Openings）。
   - **Lotus Arena 真实空间构架**：
     - 中央比赛球场（木质枫木地板、官方标准划线、边界落差）。
     - 环绕式多层立体梯级观众看台（带踏步高度与台阶深度的实体 Mesh）。
     - 八面环抱外围结构立壁，带有连接周边走廊的真实门洞与出入口。
2. **统一相机与地图控制器 (Unified Camera & Interaction System)**：
   - **Free Pan**：利用正交射线投影到 Y=0 地平面，实现真正的无感抓地拖拽。
   - **Cursor-Centered Zoom**：滚轮缩放时，将光标下的世界坐标点锁定在同一屏幕像素，支持连续缩放（0.45x ~ 3.5x）。
   - **Orbit Rotation**：支持鼠标右键拖拽在 2.5D 模式下围绕当前焦点 360° 水平旋转，并限制俯仰角在 30°~65° 之间，杜绝翻转与穿地。
   - **2D Plan View vs 2.5D Explore View 平滑无缝切换**：
     - 2D 模式：严格正俯视（Polar Angle = 0, Azimuth = 0, Orthographic, 绝对正交投影无透视变形，对齐原始施工图 FF-01 纸面方向）。
     - 2.5D 模式：优雅微缩建筑模型视角（Polar Angle = 54.7°, Azimuth = 45°），呈现墙体厚度与看台深度。
     - 切换时平滑过渡 600ms，保留用户当前关注的世界坐标与选中房间。
   - **手势防误触仲裁 (Gesture Arbitration)**：位移超过 6px 视为拖拽，禁止触发房间点击；支持双击缩放；支持移动端单指平移与双指缩放。
