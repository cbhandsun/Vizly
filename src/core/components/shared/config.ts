// 布局配置接口
export interface LayoutConfig {
  // 画布尺寸
  CANVAS_WIDTH: number;
  CANVAS_HEIGHT: number;
  
  // 通用节点尺寸
  NODE_WIDTH?: number;
  
  // 间距配置
  GROUP_PADDING: { H: number; V: number; };
  SUB_GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number; };
  SPACING?: { H: number; V: number; };
  LANE_PADDING?: { X: number; Y: number; };
  
  // 节点尺寸
  TITLE_BAR_HEIGHT: number;
  NODE_HEIGHT: number;
  MAIN_COL_WIDTH: number;
  
  // 间距常量
  MAIN_TO_SIDE_GAP: number;
  LAYER_V_GAP: number;
  ROW_V_GAP: number;
  FOUNDATION_GAP: number;
  
  // 特定域的配置
  SCM_NODE_HEIGHT: number;
  LOGISTICS_NODE_HEIGHT: number;
  CORP_NODE_HEIGHT: number;
  LOGISTICS_BMS_NODE_HEIGHT: number;
  CORP_V_SPACING: number;
  BE_COLUMN_GAP: number;
  DATA_COLLECT_GAP: number;
  DATA_V_GAP: number;
  
  // 新增属性
  START_Y_POSITION: number;
  NODE_MARGIN: number;
  
  // 计算属性
  calculateDomainMinWidth: () => number;
  DOMAIN_MIN_WIDTH: number;
}

// 默认配置
export const DEFAULT_CONFIG: LayoutConfig = {
  // 画布尺寸
  CANVAS_WIDTH: window.innerWidth * 0.9,
  CANVAS_HEIGHT: 2400,
  
  // 通用节点尺寸
  NODE_WIDTH: 280,
  
  // 间距配置
  GROUP_PADDING: { H: 40, V: 30 },
  SUB_GROUP_PADDING: { H: 20, V_TOP: 60, V_BOTTOM: 20 },
  SPACING: { H: 100, V: 120 },
  LANE_PADDING: { X: 50, Y: 70 },
  
  // 节点尺寸
  TITLE_BAR_HEIGHT: 50,
  NODE_HEIGHT: 120,
  MAIN_COL_WIDTH: Math.max(520, window.innerWidth * 0.9 * 0.25),
  
  // 间距常量
  MAIN_TO_SIDE_GAP: 60,
  LAYER_V_GAP: 60,
  ROW_V_GAP: 70,
  FOUNDATION_GAP: 40,
  
  // 特定域的配置
  SCM_NODE_HEIGHT: 100,
  LOGISTICS_NODE_HEIGHT: 90,
  CORP_NODE_HEIGHT: 80,
  LOGISTICS_BMS_NODE_HEIGHT: 80,
  CORP_V_SPACING: 30,
  BE_COLUMN_GAP: 40,
  DATA_COLLECT_GAP: 40,
  DATA_V_GAP: 60,
  
  // 新增属性
  START_Y_POSITION: 100,
  NODE_MARGIN: 20,
  
  // 计算属性
  calculateDomainMinWidth: () => {
    const beNodeMinWidth = 280;
    const minScmWidth = beNodeMinWidth * 2 + 40 + 20 * 2;
    const minLogisticsWidth = beNodeMinWidth * 3 + 40 * 2 + 20 * 2;
    const minCorpWidth = beNodeMinWidth * 2 + 40 + 20 * 2;
    const beMinWidth = minScmWidth + minLogisticsWidth + minCorpWidth + 60 * 2 + 40 * 2;
    const dataMinWidth = 320 * 4 + 40 * 3 + 40 * 2;
    const midendMinWidth = 320 * 3 + 40 * 2 + 40 * 2;
    const channelMinWidth = 320 * 2 + 40 + 40 * 2;
    return Math.max(beMinWidth, dataMinWidth, midendMinWidth, channelMinWidth);
  },
  get DOMAIN_MIN_WIDTH() { return this.calculateDomainMinWidth(); }
};

// 物流架构专用配置
export const LOGISTICS_CONFIG: LayoutConfig = {
  ...DEFAULT_CONFIG,
  CANVAS_WIDTH: window.innerWidth * 0.95,
  CANVAS_HEIGHT: 1800,
  NODE_HEIGHT: 140,
  LAYER_V_GAP: 80,
  ROW_V_GAP: 50,
};

// WMS架构专用配置
export const WMS_CONFIG: LayoutConfig = {
  ...DEFAULT_CONFIG,
  CANVAS_WIDTH: window.innerWidth * 0.9,
  CANVAS_HEIGHT: 1600,
  NODE_HEIGHT: 130,
  LAYER_V_GAP: 70,
  MAIN_COL_WIDTH: Math.max(450, window.innerWidth * 0.9 * 0.22),
};

// TMS架构专用配置
export const TMS_CONFIG: LayoutConfig = {
  ...DEFAULT_CONFIG,
  CANVAS_WIDTH: window.innerWidth * 0.9,
  CANVAS_HEIGHT: 1600,
  NODE_HEIGHT: 130,
  LAYER_V_GAP: 70,
  MAIN_COL_WIDTH: Math.max(450, window.innerWidth * 0.9 * 0.22),
};
