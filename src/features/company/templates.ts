export interface CompanyTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  employees: { role: string; nickname: string; soul: string; reportsToRole?: "ceo" | "coo" | "cto" }[];
}

export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    id: 'content-factory',
    name: '🏭 内容工厂',
    description: 'AI驱动的图文与视频内容爆款生产团队',
    icon: '🏭',
    employees: [
      { role: '内容主笔', nickname: '小李', soul: '擅长撰写深度文章、新闻摘要和SEO博客', reportsToRole: 'coo' },
      { role: '行业研究员', nickname: '小王', soul: '擅长搜集竞品资料、深度分析、数据整理', reportsToRole: 'coo' },
      { role: '社媒运营', nickname: '小张', soul: '擅长各种社交媒体文案、排期设计和互动整活', reportsToRole: 'coo' },
    ],
  },
  {
    id: 'customer-service',
    name: '🏪 客服调度中心',
    description: '7x24小时知识库问答与工单智能分配系统',
    icon: '🏪',
    employees: [
      { role: '客服专员', nickname: '小客', soul: '友善、有耐心、专业的面对客诉的一线解决者', reportsToRole: 'coo' },
      { role: '知识管家', nickname: '小知', soul: '持续维护产品 FAQ 词典并校准知识库冲突', reportsToRole: 'cto' },
      { role: '质检主管', nickname: '小检', soul: '严格冷酷地审查客服对话记录，保障服务下限', reportsToRole: 'ceo' },
    ],
  },
  {
    id: 'research-lab',
    name: '🔬 学术研究院',
    description: '海量文献解析与前瞻性理论知识加工厂',
    icon: '🔬',
    employees: [
      { role: '文献助理', nickname: '小文', soul: '擅长检索并精炼 arXiv 和各类学术PDF核心结论', reportsToRole: 'coo' },
      { role: '数据架构师', nickname: '小数', soul: '结构化清洗实验数据、清洗噪音并生成相关性分析', reportsToRole: 'cto' },
    ],
  },
  {
    id: 'personal-assistant',
    name: '🎯 个人全能助理',
    description: '帮你规划时间及处理琐碎杂项的私人数字大脑',
    icon: '🎯',
    employees: [
      { role: '日程管家', nickname: '小秘', soul: '雷厉风行地管理你的碎片化日程、发送开会提醒', reportsToRole: 'ceo' },
      { role: '生活教练', nickname: '小教', soul: '为你制定健身/学习计划、强行督促进度并给予反馈', reportsToRole: 'ceo' },
    ],
  },
  {
    id: 'blank',
    name: '🏗 空地',
    description: '不带任何预设。你和 CEO 从零开始一点点搭建部门结构。',
    icon: '🏗',
    employees: [],
  },
];
