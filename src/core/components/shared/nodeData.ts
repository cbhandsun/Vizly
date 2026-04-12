import { THEMES } from './flowStyles';

// 定义节点数据类型
export interface NodeDataItem {
  description: string;
  theme: {
    border: string;
  };
}

// 定义特殊节点数据类型
export interface SpecialNodeData {
  ids: string[];
  descs: string[];
}

export const NODE_DATA: {
  [key: string]: {
    [key: string]: NodeDataItem
  } | SpecialNodeData
} = {
  'channel': {
    'b2b': { description: '<b>B2B渠道</b><br/>• 经销商/代理商/企业客户<br/>• 线下门店/展厅/专卖店', theme: THEMES.midend },
    'b2c': { description: '<b>B2C渠道</b><br/>• 官网商城/APP/小程序<br/>• 第三方平台/社交电商', theme: THEMES.midend }
  },
  'midend': {
    'product': { description: '<b>商品中台</b><br/>• 商品主数据/类目/属性<br/>• 价格/库存/供应链协同', theme: THEMES.midend },
    'order': { description: '<b>订单中台</b><br/>• 统一订单/支付/发票<br/>• 促销/优惠/会员积分', theme: THEMES.midend },
    'user': { description: '<b>会员中台</b><br/>• 会员权益/等级/积分<br/>• 账户/认证/安全', theme: THEMES.midend }
  },
  'be-scm': {
    'sourcing': { description: '<b>寻源采购 (SRM)</b><br/>• 供应商管理/寻源<br/>• 合同/订单/对账结算', theme: THEMES.scm },
    'planning': { description: '<b>供应链计划</b><br/>• 需求/补货/配额计划<br/>• 库存优化/ABC分类', theme: THEMES.scm }
  },
  'be-logistics': {
    'l-oms': { description: '<b>调度中心 (L-OMS)</b><br/>• 仓/运/关/配协同/预约<br/>• 全链路状态追踪/预警', theme: THEMES.logistics },
    'wms': { description: '<b>仓储 (WMS/WCS)</b><br/>• 入库/上架/拣选/波次<br/>• 库内移动/路径优化', theme: THEMES.logistics },
    'tms': { description: '<b>运输 (TMS)</b><br/>• 运力/线路规划/在途跟踪<br/>• 承运商协同/回单管理', theme: THEMES.logistics },
    'customs': { description: '<b>关务 (Customs)</b><br/>• 进出口报关/单一窗口<br/>• 贸易合规/关务文件/税费', theme: THEMES.logistics },
    'bms': { description: '<b>计费结算 (BMS)</b><br/>• 物流费用模型/自动计费<br/>• 账单生成/应收应付/对账', theme: THEMES.logistics }
  },
  'be-corp': {
    'crm-ma': { description: '<b>营销活动 (Campaign)</b><br/>• 营销活动管理/自动化<br/>• 线索管理/培育/商机转化', theme: THEMES.corp },
    'crm-sales': { description: '<b>客户服务 (Service)</b><br/>• 全渠道服务请求/工单<br/>• 知识库/满意度/售后', theme: THEMES.corp },
    'fms': { description: '<b>业财税 (FMS/ERP Core)</b><br/>• 总账/应收/应付/固资<br/>• 成本核算/全面预算/税务', theme: THEMES.corp }
  },
  'data': {
    ids: ['collect', 'stream', 'warehouse', 'cdp', 'app', 'mdm'],
    descs: [
      '<b>数据集成</b><br/>• 实时采集/CDC/埋点/API<br/>• 数据交换(Hub)/ETL/ELT',
      '<b>流批一体与特征库</b><br/>• Kafka/Flink 流处理<br/>• Feature Store/实时特征服务',
      '<b>统一数仓</b><br/>• ODS/DWD/DWS/ADS<br/>• 数据湖/湖仓一体/数据治理',
      '<b>客户数据平台 (CDP)</b><br/>• OneID/标签画像/生命周期<br/>• 客群洞察/营销圈选',
      '<b>数据应用</b><br/>• BI自助分析/报表<br/>• 推荐/预测等AI服务',
      '<b>主数据管理 (MDM)</b><br/>• 物料/客户/组织主数据<br/>• 编码/血缘/质量管控'
    ]
  },
  'infra': {
    ids: ['cloud', 'paas', 'integration', 'event', 'devops', 'security'],
    descs: [
      '<b>基础设施 (IaaS)</b><br/>• 混合/多云管理(CMP)<br/>• 网络/存储/容器化(K8s)',
      '<b>技术平台 (PaaS)</b><br/>• 微服务/分布式事务<br/>• API网关/MQ/缓存/ES',
      '<b>集成平台 (iPaaS/ESB)</b><br/>• 适配器/编排/监控<br/>• 异构系统集成与治理',
      '<b>事件总线 (Event Mesh)</b><br/>• 主题/订阅/回溯<br/>• 事件溯源与解耦',
      '<b>研发效能与治理</b><br/>• CI/CD/GitOps/IDE插件<br/>• 可观测性/APM/成本优化',
      '<b>信息安全</b><br/>• 身份认证(IAM)/零信任<br/>• 数据安全(DLP)/安全审计'
    ]
  }
};
