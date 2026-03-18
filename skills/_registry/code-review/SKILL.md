---
name: code-review
description: 对代码进行质量审查，发现潜在 bug、安全漏洞和设计问题。当需要审查代码质量时使用此 Skill。
license: MIT
allowed-tools:
  - Bash(npx tsx:*)
  - Read
metadata:
  author: swarm
  version: "1.0"
  category: development
compatibility:
  - "node >= 18"
---

# Code Review Skill

## 工作流程

1. 使用 `read_workspace_file` 读取需要审查的代码文件
2. 运行静态分析脚本：
   ```
   npx tsx _skills/code-review/scripts/lint-check.ts <文件路径>
   ```
3. 综合脚本输出和自身分析，生成完整审查报告

## 脚本说明

- `scripts/lint-check.ts` — 接受文件路径参数，输出 JSON 格式的代码检查结果，包含：
  - 潜在 bug 和逻辑错误
  - 未处理的异常/错误
  - 安全风险（硬编码密钥、SQL 注入等）
  - 性能问题
  - 代码风格建议

## 审查维度

### 1. 正确性
- 逻辑错误和边界条件
- 空值/未定义检查
- 类型安全问题
- 异步操作处理

### 2. 安全性
- 输入验证
- SQL/命令注入
- 敏感数据泄露
- 权限检查

### 3. 可维护性
- 代码重复
- 函数/模块复杂度
- 命名清晰度
- 文档完整度

### 4. 性能
- 不必要的计算
- 内存泄漏风险
- N+1 查询
- 缓存机会

## 输出格式

审查报告应包含：
1. **摘要**：总体评价和风险等级（低/中/高）
2. **问题列表**：按严重程度排序，每项包含位置、描述、建议修复
3. **改进建议**：非阻塞性的优化建议
