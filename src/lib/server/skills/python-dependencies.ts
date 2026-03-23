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

/**
 * SKILLS_WITH_LOCAL_PACKAGES - 包含本地 Python 模块的 Skills
 * 这些 Skills 的 scripts/ 目录包含 Python 包（如 docx_dev），
 * 需要使用 `pip install -e` 以便 Python 能识别导入
 */
export const SKILLS_WITH_LOCAL_PACKAGES = [
  'docx-dev', // docx_dev Python 模块
] as const

export type SkillWithLocalPackage = typeof SKILLS_WITH_LOCAL_PACKAGES[number]

/**
 * 检查某个 Skill 是否需要安装本地包
 */
export function isSkillWithLocalPackage(skillName: string): boolean {
  return (SKILLS_WITH_LOCAL_PACKAGES as readonly string[]).includes(skillName)
}
