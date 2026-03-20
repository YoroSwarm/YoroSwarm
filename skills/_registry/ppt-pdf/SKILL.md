---
name: ppt-pdf
description: 演示文稿（PPT/Slides）分阶段制作工作流（PDF 版本）。使用 HTML+Paged.js 技术制作 16:9 幻灯片，最终通过 pdf skill 的脚本转换为 PDF 文件。适用于需要 PDF 格式交付的演示文稿场景。需要同时分配 pdf skill 以获得 HTML→PDF 转换能力。
license: MIT
metadata:
  author: swarm
  version: "1.0"
  category: productivity
---

# PPT 分阶段制作工作流（PDF 版本）

## 概述

将 PPT 创作视为**分阶段的团队工作**，最终产出 **PDF 格式的幻灯片**。核心流程：

**需求澄清 → 资料调研 → 大纲规划 → 策划稿 → HTML 页面 → PDF 转换 → 复核**

关键原则：**约束工作流程，而非约束实现方式**。

## ⚠️ 输出格式：PDF 幻灯片（通过 HTML 中间格式）

### 技术路径

1. 使用 HTML + CSS 编写幻灯片页面（Paged.js 分页）
2. 使用 `pdf` skill 的 `_skills/pdf/scripts/pdf.sh html` 命令将 HTML 转为 PDF
3. 最终交付为 `.pdf` 文件

### 前置要求

**必须同时为 Agent 分配 `pdf` skill**，否则无法执行 HTML→PDF 转换。

### 强制规格

1. **16:9 比例**：每页 CSS 尺寸为 `33.867cm × 19.05cm`（即 1280pt × 720pt）
2. **Paged.js 分页**：使用 `@page` CSS 规则控制页面尺寸和边距
3. **每个 `<section>` 是一页幻灯片**：通过 `break-after: page` 分页
4. **不需要导航 JS**：PDF 自身支持翻页，无需键盘/鼠标导航代码
5. **不引用外部资源**：字体、CSS 全部内联

### ⚠️ 分步生成策略（必须遵循）

**禁止一次性生成完整 HTML 文件！** 由于 LLM 输出长度限制，必须分两步：

#### 第一步：生成框架文件（使用 `create_workspace_file`）
生成包含完整 HTML 结构的框架文件，每页使用占位符：
```html
<section class="slide">
  <!-- SLIDE_CONTENT_N -->
</section>
```

#### 第二步：逐页填充内容（使用 `replace_in_file`）
```
replace_in_file({
  path: "presentation.html",
  replacements: [{
    old_str: "<!-- SLIDE_CONTENT_3 -->",
    new_str: "<h1>实际标题</h1>\n<div class='content'>实际内容...</div>"
  }]
})
```

### HTML 页面模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>{{TOPIC}}</title>
  <style>
    @page {
      size: 33.867cm 19.05cm;  /* 16:9 */
      margin: 0;
    }
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; }

    .slide {
      width: 33.867cm;
      height: 19.05cm;
      padding: 2cm 2.5cm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      break-after: page;
      position: relative;
    }

    /* 在此添加全局配色和自定义样式 */
  </style>
</head>
<body>
  <section class="slide">
    <!-- SLIDE_CONTENT_1 -->
  </section>

  <section class="slide">
    <!-- SLIDE_CONTENT_2 -->
  </section>

  <!-- ... 每页一个 section ... -->
</body>
</html>
```

### 转换为 PDF

内容填充完成后，使用 pdf skill 的脚本转换：

```bash
# 确保 pdf skill 依赖已安装
bash _skills/pdf/scripts/pdf.sh fix

# 转换 HTML → PDF
bash _skills/pdf/scripts/pdf.sh html presentation.html
```

输出文件默认与输入同名（`presentation.pdf`）。

## 与 ppt-workflow（HTML 版本）的区别

| 特性 | ppt-workflow（HTML） | ppt-pdf（PDF） |
|------|---------------------|----------------|
| 输出格式 | 单一 HTML 文件 | PDF 文件 |
| 导航方式 | 键盘/鼠标/触摸 JS 导航 | PDF 阅读器翻页 |
| 查看方式 | 浏览器打开 | PDF 阅读器 |
| 分页方式 | CSS visibility 切换 | Paged.js 物理分页 |
| 适用场景 | 在线演示、分享链接 | 线下打印、正式提交 |
| 依赖 | 无 | 需要 pdf skill |

## 核心方法

1. **从问题出发，而非从模板出发** — 先搞清楚给谁看、为什么做、希望对方记住什么
2. **内容先行，设计随后** — PPT 的灵魂是内容，不是皮囊
3. **增加中间层：策划稿** — 在大纲和成品之间插入页面级规划卡片
4. **分层交付** — 根据需求在合适的层级停下

## 标准工作流程

### 第 1-6 步：同 ppt-workflow

需求澄清、调研判断、上下文收集、调研底稿、大纲生成、策划稿生成。

流程完全一致，请参考 ppt-workflow skill 的详细说明。

### 第 7 步：生成样例 HTML 页面

使用分步策略生成 2-3 页样例：
1. `create_workspace_file` 创建框架
2. `replace_in_file` 填充样例页

**注意：此时不需要转换为 PDF**，直接预览 HTML 确认风格。

### 第 8 步：审阅关卡

同 ppt-workflow。

### 第 9 步：扩展为完整 HTML 并转换 PDF

1. 生成完整框架（所有页面占位符）
2. 逐批填充（每次 1-3 页）
3. 验证所有占位符已替换
4. 执行 `bash _skills/pdf/scripts/pdf.sh html presentation.html`
5. 检查 PDF 输出

### 第 10 步：复核

交付前检查：
- **内容**：逻辑、事实、证据、信息密度
- **技术**：PDF 生成成功、16:9 比例正确、分页正确
- **视觉**：文字可读、配色一致、留白合理

## 协调规则

- **调研规则**：任务依赖事实时，先收集/验证再自信发言
- **诚实规则**：环境不支持理想工作流时，说明限制
- **审阅关卡规则**：高风险任务先展示中间成果
- **PDF 优先规则**：最终产物必须是 PDF，16:9 比例

## 质量标准

- **PDF 文件**可在任何 PDF 阅读器中打开
- **16:9 比例**每页幻灯片
- 论证清晰的演示结构
- 通过策划稿获得更好的可控性
- 用户可在全面扩展前审阅 HTML 中间产物
