# 空间几何校准与审计清单 (Geometry Audit & Calibration)
## Moonshot Academy Campus (MAC) — Spatial Verification

### 1. 坐标系与尺寸校准 (Coordinate System & Scale Calibration)

| 标定参考点 | 图纸标注尺寸 (mm) | 真实物理尺寸 (m) | 归一化地图坐标范围 (Norm 0~1000) |
|---|---|---|---|
| **总宽度（轴线 1 ~ 18）** | 134,100 mm | 134.1 m | X: 0 ~ 1000 |
| **总深度（轴线 A ~ Q）** | 115,800 mm | 115.8 m | Z: 0 ~ 863.5 (Aspect Ratio = 1.158) |
| **中央球场中心** | 轴线 9.5, H-J 中点 | (67.05m, 57.9m) | (500, 432) |
| **莲花多边形外环** | 直径约 42.0m | 42.0 m | 环绕半径 R ≈ 157 norm units |
| **西入口主门** | 轴线 1, G-H 附近 | (0m, 55m) | (15, 410) |
| **东入口主门** | 轴线 18, G-H 附近 | (134.1m, 55m) | (985, 410) |
| **南入口主门** | 轴线 9~10, A 轴 | (67m, 0m) | (500, 30) |

---

### 2. 几何复原与图层分解 (Reconstruction Layers)

1. **Base Slab (建筑底板)**：
   - 包含建筑外轮廓基底与外围景观过渡。
2. **Floor Slabs (地表与铺装)**：
   - 西区学术走廊 (M 翼)
   - 东区活动与幼小走廊 (A 翼)
   - 南大厅与创新区地坪
   - 中央莲花球场木地板面 (带有三分线、罚球圈、中圈)
   - 莲花球场阶梯看台 (Tiered Bleachers)
   - 中庭花园天然植被地块 (Courtyard Greenery)
3. **Wall Network (实体墙体网格)**：
   - 外围承重外墙与轴网柱（8.4m 标准柱网）
   - 室内房间隔墙（带门洞开口 Door Openings，防止阻断导航）
   - 莲花球场八边形环状立壁与栏杆
4. **Interactive Space Anchors (空间拾取与交互多边形)**：
   - 每一个教室、书院、餐厅、实验室都具备独立多边形网格，支持射线检测、悬停高亮、选定与状态着色。
5. **Walkable Navigation Graph (无阻挡室内导航路网)**：
   - 主干道节点（西门、东门、南门、中央环廊、南北横贯主道）
   - 房间门点连接边（Doorway Edges）
   - 严格避开建筑实墙、球场深坑看台与设备隔断，保证 Dijkstra/A* 寻路路径绝不穿墙。

---

### 3. 图纸对照模式 (Geometry Review Mode)
系统内嵌了「图纸对照 (Review Mode)」工具栏：
- 可开启原设计图纸透明叠加层（Source Overlay）。
- 可切换空间多边形线框（Wireframe Polygons）。
- 可显示导航路网拓扑点线（Navigation Nodes & Edges）。
- 可查看未经验证几何标记（Unverified Geometry Markers），确保每一处建模皆有据可查。
