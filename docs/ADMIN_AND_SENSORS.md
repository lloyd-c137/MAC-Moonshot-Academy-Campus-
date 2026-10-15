# Admin panel and live sensors

## Live sensor data

M104 (一小步空间) reads real environment data from the campus sensor API:

```
GET https://map.georgehan0514.top/api/readings?location=M1&hours=24
GET https://map.georgehan0514.top/api/devices
```

The map polls each enabled binding every 60 s, and again whenever the tab becomes visible.

**Values.** Temperature and humidity come from the SHT sensor when it reports, otherwise from the SCD4x. CO₂ comes from the SCD4x. These values replace the demo environment for the bound room in three places:
- the room sheet;
- the 环境 map layer (温度 / 湿度 / CO₂);
- search suggestions.

**Status shown in the room sheet:**
- **实时**: the latest reading is newer than the staleness threshold (10 minutes by default).
- **未更新, N 小时前**: there is data but it is old. The sheet shows the last reading and says so.
- **Sensor API unreachable**: the last good reading is kept from this session, or from a per-browser cache, and labelled "传感器接口暂时无法访问，显示的是 N 小时前的读数". If nothing was ever cached, the sheet says the sensor could not be read.

**Trend.** The trend lines show hourly averages over the past 24 hours, ending now. Hours without data are bridged with a dashed line, so reporting gaps stay visible.

Rooms without a sensor keep the built-in demo values, labelled 演示数据. You can turn those off in 站点设置.

Code:
- `src/services/sensorApi.ts`: API client, normalisation, polling hook, fallback cache.
- `src/services/spaceModel.ts`: merges admin edits and live readings into spaces.

## Admin panel (`/admin`)

| Section | What it does |
|---|---|
| 传感器接入 | API address, refresh interval, staleness threshold, trend length. Room ↔ location bindings, each with enable, test (shows the latest values and reading count) and delete. A device list from `/api/devices` with online / offline status and one-click "绑定到房间". |
| 房间资料 | Per-room name, English name, description, access, capacity and facilities. Empty fields fall back to the defaults. Edited names also update the map labels. |
| 站点设置 | Show or hide the demo environment values for rooms without sensors. |
| 发布配置 | Download, import, or write to the project file (dev server only). Clear this browser's edits. Preview the JSON. |

### Where settings live

The site is static (Cloudflare Pages) and has no server to store settings, so configuration has two layers:
1. **Published.** `public/campus-config.json` is deployed with the site and is the same for every visitor.
2. **This browser.** 保存 in `/admin` stores edits in localStorage. They apply immediately to every open map tab in this browser, and to nothing else.

To make edits site-wide:
1. In 发布配置, click 下载配置文件. When running `npm run dev` locally you can click 写入项目文件 instead, which writes `public/campus-config.json` directly.
2. Commit and push to `main`. Cloudflare Pages redeploys automatically.

`/admin` has no login. That is safe today because nothing it does affects other visitors until a file is committed. If the site later gets a real backend (for example Cloudflare Pages Functions with KV or D1), the panel should move behind authentication, and saving should write there.
