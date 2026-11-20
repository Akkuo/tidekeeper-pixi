// 純常數：物理、尺寸、版面配置（renderer 與 core 共用，不含任何繪圖）
export const T = 16;            // 磚塊邊長（世界像素）
export const DT = 1 / 60;       // 固定邏輯步長
export const ROWS = 18;         // 標準關卡高度（格）
export const WATER_LOW_ROW = 15;  // 乾潮水線（格）
export const WATER_HIGH_ROW = 8;  // 滿潮水線（格）

export const PHYS = {
  accel: 900, airAccel: 650, maxRun: 105, fric: 1300,
  slipFric: 120, slipAccel: 280,
  grav: 950, maxFall: 380, jumpV: -330, jumpCut: -110,
  coyote: 0.1, buffer: 0.12,
  swimMax: 85, swimAccel: 520, buoy: 300, waterDrag: 4.2, diveAccel: 620,
  strokeV: -150, surfaceJumpV: -330, currentV: 170,
  dashV: 270, dashT: 0.16, dashCd: 0.38,
  invuln: 1.0, windV: -70,
};

export const TIDE = { trans: 0.5, cooldown: 0.6 };

// 實心磚：岩石、易碎牆、濕滑地面
export const SOLID_TILES = '#BW';
export const HAZARD_TILES = '^K';
export const ENTITY_CHARS = 'SocjpECX';

// 標題選關卡片的版面（正規化座標，core 用於點擊判定、renderer 用於繪製）
export const MENU = { cardY0: 0.50, cardY1: 0.68, cardX0: 0.08, cardX1: 0.92 };

export const LEVEL_COUNT = 6;
