# TIDEKEEPER 潮汐守望者 · Pixi 版

按下 Q 讓整片海岸漲潮或退潮的橫向平台動作遊戲——這是 [TIDEKEEPER](https://akkuo.github.io/tidekeeper/) 的 **PixiJS v8** 版本。
遊戲邏輯 `src/core/` 與 Canvas 2D 原版**逐位元組相同**（SHA-256 驗證），只換掉繪圖層：`src/render-pixi/`。

- 線上遊玩：https://akkuo.github.io/tidekeeper-pixi/
- Claude Opus 5.5 撰寫；零外部素材（圖形全部執行期程式產生、音效 Web Audio 合成），PixiJS 由 CDN importmap 載入（8.6.6）。

## 操作
| 按鍵 | 動作 |
|---|---|
| `A`/`D` 或 `←`/`→` | 移動（標題畫面：選關） |
| `Space` / `W` / `↑` | 跳（按久跳更高；水中划水） |
| `X` / `J` | 三叉戟突刺（可擊破易碎牆） |
| `Q` | 切換滿潮／乾潮 |
| `↓` / `S` | 水中下潛 |
| `G` | **即時開關所有 Filter**（效能／畫面對照；`V` 同一開關） |
| `P` / `Esc` | 暫停 |
| `M` | 靜音 |
| `R` | 重新開始本關 |
| `1`–`6` | 選關（已解鎖） |
| `F2` | 關卡編輯器（編輯器內 `G` 為換配色） |

觸控裝置：左下虛擬搖桿，右下「跳／刺／潮」與暫停鈕。

## 技術重點
- **同一個 core、兩個 renderer**：介面 `createRenderer(canvas, game) → { render(alpha), resize(w,h), destroy() }`，遊戲狀態唯讀。用原版 `tools-test/routes/` 的通關輸入序列在本版的 core 上重播，6 關結果與時間完全一致。
- **執行期材質**：`sprite-data.js` 點陣、6 主題磚塊、碎片、泡泡全部畫進一張 512² 圖集（nearest），另外程式產生徑向發光材質與水下位移圖。
- **Sprite Pooling**：磚塊／實體／HUD 用逐幀池（依繪製順序取用、未用者隱藏）；粒子、泡泡、碎片用回收池（死亡即回收重用）。
- **低解析度世界 + 濾鏡**：世界畫進 `view.w × view.h` 的 RenderTexture（nearest 放大保留像素感），濾鏡也在低解析度上跑：
  - `DisplacementFilter` 水下折射：位移圖頂端為中性灰並 clamp，sprite 對齊水線，因此只扭曲水面以下。
  - 自寫 GLSL **god rays**：光源角度雜訊光柱（水下較強）＋朝光源 6 點抖動徑向取樣；暴風燈塔關以燈塔燈為光源。
  - 自寫 GLSL **潮汐震波**：切換潮汐時以玩家為圓心擴散的折射環，含 RGB 色散與亮邊（Boss 受擊／二階段也會觸發）。
- **加法混合發光**：潮之珠、出口、水母、泡泡彈、突刺、Boss 弱點與部分粒子以 `blendMode: 'add'` 疊徑向光暈。
- **GPU HUD**（右上）：渲染器、FPS、作用中 sprite／pool 總量、粒子／泡泡／碎片池用量、Filter 狀態。
- 文字（HUD、選單、編輯器）全部是 Pixi `Text` 逐幀池，同一槽位內容沒變就不重新點陣化。

## 檔案
```
index.html              頁面、CSS、觸控 DOM、importmap（pixi.js@8.6.6）
src/main.js             宿主：固定步長迴圈、鍵盤／指標、G 開關、__debug / __start / ?autostart=1
src/touch.js            觸控搖桿與按鈕（與原版相同）
src/core/               與 tidekeeper 逐位元組相同的純邏輯
src/render-pixi/renderer.js  Pixi 版 renderer（世界、HUD、標題、編輯器、GPU HUD）
src/render-pixi/textures.js  執行期材質產生（圖集、發光、位移圖）
src/render-pixi/filters.js   god rays / shockwave GLSL 與 DisplacementFilter 組裝
src/render-pixi/pool.js      逐幀池、回收池、文字池
```

## 測試掛鉤
`window.__debug()` 回傳狀態快照（含 `gpu` 欄位：濾鏡、池用量）；`window.__start()` 或 `?autostart=1` 直接開始；`?debug=1` 另外暴露 `window.__game`。
