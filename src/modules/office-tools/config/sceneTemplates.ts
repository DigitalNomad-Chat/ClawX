/**
 * Scene Templates — Pre-defined AI refine scenarios for document processing
 */

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  instruction: string;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'general',
    name: '通用文档整理',
    description: '修正OCR错误、统一格式、提升可读性',
    icon: 'FileText',
    instruction:
      '请对以下文本进行整理和优化：修正OCR识别错误、统一格式、提升可读性，保持原文意思不变。直接输出优化后的文本，不要添加解释。',
  },
  {
    id: 'policy',
    name: '保单信息整理',
    description: '提取保单关键信息，结构化输出',
    icon: 'Shield',
    instruction:
      '请对以下保单文本进行整理，提取以下关键信息并以结构化方式输出：\n' +
      '- 保单号\n' +
      '- 保险公司名称\n' +
      '- 产品名称\n' +
      '- 投保人/被保险人信息\n' +
      '- 保费金额\n' +
      '- 保额/保险金额\n' +
      '- 生效日期和到期日期\n' +
      '- 保障期限\n' +
      '- 缴费方式和期限\n' +
      '- 受益人信息\n' +
      '- 保障责任/条款摘要\n' +
      '如果某项信息缺失请标注"未找到"。输出格式为清晰的Markdown列表。',
  },
  {
    id: 'medical',
    name: '体检报告整理',
    description: '识别异常指标，标注参考范围',
    icon: 'Stethoscope',
    instruction:
      '请对以下体检报告文本进行整理：\n' +
      '1. 提取所有检查项目及其结果\n' +
      '2. 识别并标注异常指标（偏离正常范围的值）\n' +
      '3. 列出异常项目的参考范围\n' +
      '4. 对每个异常指标给出简要的健康建议\n' +
      '5. 总结整体健康状况\n' +
      '输出格式为Markdown表格和列表，异常项用醒目的方式标注。',
  },
  {
    id: 'quotes',
    name: 'AI金句提炼',
    description: '提取核心观点，生成结构化摘要',
    icon: 'Sparkles',
    instruction:
      '请对以下文本进行深度提炼：\n' +
      '1. 提取3-5条核心观点或金句\n' +
      '2. 生成一段不超过200字的结构化摘要\n' +
      '3. 列出关键要点（bullet points）\n' +
      '4. 如果文本有行动建议，单独列出行动项\n' +
      '输出格式为清晰的Markdown，核心观点加粗显示。',
  },
];

export function getSceneTemplate(id: string): SceneTemplate | undefined {
  return SCENE_TEMPLATES.find((t) => t.id === id);
}

export function getSceneInstruction(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return getSceneTemplate(id)?.instruction;
}
