/**
 * Skills Python 依赖配置
 * 这些包会在会话虚拟环境创建时自动安装
 */

export const SKILLS_PYTHON_PACKAGES = [
  // pdf-dev - PDF 生成和处理
  'reportlab',
  'pypdf',
  'matplotlib',

  // docx-dev - Word 文档处理
  'python-docx',
  'lxml',

  // pptx-generator - PPT 文本提取
  'markitdown[pptx]',

  // xlsx-dev - Excel 处理和分析
  'pandas',
  'openpyxl',
] as const

export type SkillsPythonPackage = typeof SKILLS_PYTHON_PACKAGES[number]

/**
 * 获取所有需要安装的 Python 包列表
 */
export function getSkillsPythonPackages(): string[] {
  return [...SKILLS_PYTHON_PACKAGES]
}
