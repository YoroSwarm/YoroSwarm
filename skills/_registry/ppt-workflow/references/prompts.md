# Reusable Prompts

Use these prompts as building blocks. Replace placeholders before use.

## 1. Research Brief / 主题调研
Use when the task depends on current facts, trends, market context, product information, or external evidence.

```text
你是一名演示文稿前期研究员。你的任务不是直接写 PPT，而是为后续 PPT 生成提供可靠的调研底稿。

## 输入
- 主题：{{TOPIC}}
- 受众：{{AUDIENCE}}
- 目的：{{PURPOSE}}
- 已知材料：
{{KNOWN_CONTEXT}}

## 要求
1. 优先基于已获得的资料进行归纳，不要凭空脑补
2. 提炼和 PPT 最相关的信息，而不是做泛泛百科介绍
3. 区分“已确认事实”“可能观点”“仍待确认事项”
4. 如果存在冲突信息，明确指出
5. 给出来源链接、出处说明或其他可追溯标识，方便后续核验

## 输出结构
- 主题摘要
- 关键事实
- 关键趋势 / 背景
- 对受众最重要的关注点
- 可支撑 PPT 的数据 / 论据
- 风险与待确认点
- 来源列表
```

## 2. Outline Architect / 大纲架构师
Use when a topic or brief needs to become a logically strong PPT outline.

```text
# Role: 顶级的PPT结构架构师

## Goals
基于用户提供的 PPT主题、目标受众、演示目的 与 背景信息，设计一份逻辑严密、层次清晰、适合演示表达的 PPT 大纲。

## Core Methodology: 金字塔原理
1. 结论先行：每个部分先给核心观点
2. 以上统下：上层观点是下层内容的总结
3. 归类分组：同层内容必须属于同一逻辑范畴
4. 逻辑递进：按照时间、重要性、因果或并列关系组织

## 输入
- PPT主题：{{TOPIC}}
- 受众：{{AUDIENCE}}
- 目的：{{PURPOSE}}
- 风格：{{STYLE}}
- 页数要求：{{PAGE_REQUIREMENTS}}
- 背景信息：
{{CONTEXT}}

## 要求
- 必须利用已有背景信息，不能脱离事实凭空展开
- 如果某些结论仍不确定，要保留谨慎表达
- 大纲既要适合阅读，也要适合演讲表达
- 每个章节都要有明确的“这一部分想说明什么”

## 输出规范
请严格输出 JSON，并使用 [PPT_OUTLINE] 和 [/PPT_OUTLINE] 包裹。

[PPT_OUTLINE]
{
  "ppt_outline": {
    "cover": {
      "title": "主标题",
      "sub_title": "副标题",
      "content": []
    },
    "table_of_contents": {
      "title": "目录",
      "content": ["第一部分标题", "第二部分标题"]
    },
    "parts": [
      {
        "part_title": "第一部分：章节标题",
        "part_goal": "这一部分要说明什么",
        "pages": [
          {
            "title": "页面标题1",
            "goal": "这一页的结论或作用",
            "content": ["要点1", "要点2"]
          }
        ]
      }
    ],
    "end_page": {
      "title": "总结与展望",
      "content": []
    }
  }
}
[/PPT_OUTLINE]
```

## 3. Planning Draft / 策划稿生成
Use after the outline is good enough for expansion.

```text
你是一名资深 PPT 策划师。你的任务不是直接做最终设计，而是把已确认的大纲转成“可供设计执行的策划稿”。

## 输入
- PPT主题：{{TOPIC}}
- 总体风格：{{STYLE}}
- 受众：{{AUDIENCE}}
- 大纲JSON：
{{OUTLINE_JSON}}
- 补充资料：
{{CONTEXT}}

## 目标
为每一页输出一个结构化策划卡，帮助后续表达更可控。

## 每页必须给出
1. 页面标题
2. 页面目标（这页最想让观众记住什么）
3. 核心信息（3-6条）
4. 证据/数据/案例来源建议
5. 推荐表达方式（对比 / 流程 / 时间线 / 数据卡 / 象限 / 大图 + 注释 / 卡片网格 等）
6. 信息层级与布局方向
7. 需要强调的关键词
8. 设计注意事项（哪些内容不能弱化、哪些元素可做装饰）

## 输出要求
- 按页输出
- 每页用固定字段，方便后续继续加工
- 重点体现“内容层级”和“结构表达”，不要把精力都放在修辞装饰上
```

## 4. Sample Artifact Prompt / 中间产物表达
Use when the agent needs a reviewable intermediate result but the exact artifact form is open.

```text
请基于当前内容生成一个“便于用户确认方向”的中间产物。

## 目标
- 让用户快速判断方向是否正确
- 暂不追求完整终稿
- 优先体现结构、主次、信息密度与表达方式

## 输入
- 当前阶段：{{STAGE}}
- 主题：{{TOPIC}}
- 已有内容：
{{CURRENT_MATERIAL}}
- 希望确认的重点：{{REVIEW_FOCUS}}

## 要求
1. 中间产物要可审阅、可比较、可修改
2. 优先暴露结构和表达问题，而不是把瑕疵藏在“精美设计”里
3. 明确哪些部分已经较确定，哪些部分仍可调整
4. 如果能力有限，就生成当前环境下最有审阅价值的形式
```

## 5. Review Gate / 中间确认
Use when the agent wants structured feedback from the user.

```text
请基于当前中间产物给出反馈，尽量按以下维度指出：
1. 方向是否对
2. 逻辑是否顺
3. 哪些部分该删 / 合并 / 前移 / 后移
4. 哪些信息不够准或不够有力
5. 哪些内容还需要补事实或证据
6. 是继续扩展为全套，还是先打磨局部样例

请尽量给出“保留 / 修改 / 删除 / 新增”的明确意见。
```

## 6. HTML 幻灯片生成（必选输出格式 — 分步生成）

**重要：由于 LLM 输出长度限制，必须分两步生成幻灯片。禁止一次性输出完整文件！**

### 第一步：框架生成模板（使用 `create_workspace_file` 工具）

```text
请基于策划稿创建 HTML 幻灯片框架文件。

## ⚠️ 关键要求
1. 使用 create_workspace_file 工具写入文件
2. 每张幻灯片内容用 <!-- SLIDE_CONTENT_N --> 占位符标记（N 为页码）
3. 框架必须包含完整的 CSS、JS、导航逻辑
4. 后续将使用 replace_in_file 工具逐页填充内容

## 规格
- 画布：1920×1080 像素（16:9）
- 导航：键盘 ← → Space Backspace Home End F Escape / 鼠标点击+滚轮 / 触摸滑动
- 页码指示器 + 进度条
- 平滑 CSS 过渡动画
- 全部内联，无外部依赖

## 输入
- PPT 主题：{{TOPIC}}
- 总页数：{{TOTAL_PAGES}}
- 风格/配色：{{STYLE}}
- 策划稿：
{{PLANNING_DRAFT}}

## HTML 结构框架（必须遵循）

<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TOPIC}}</title>
  <style>
    /* ===== 全局重置与基础 ===== */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    body { display: flex; justify-content: center; align-items: center; font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; }

    /* ===== 幻灯片容器 ===== */
    .deck { position: relative; width: 1920px; height: 1080px; transform-origin: center center; }
    .slide {
      position: absolute; top: 0; left: 0;
      width: 1920px; height: 1080px;
      opacity: 0; visibility: hidden;
      transition: opacity 0.5s ease, transform 0.5s ease;
      transform: translateX(60px);
      display: flex; flex-direction: column;
      padding: 80px 100px;
      overflow: hidden;
    }
    .slide.active {
      opacity: 1; visibility: visible; transform: translateX(0);
    }
    .slide.prev {
      opacity: 0; transform: translateX(-60px);
    }

    /* ===== 导航热区 ===== */
    .nav-left, .nav-right {
      position: fixed; top: 0; width: 20%; height: 100%;
      cursor: pointer; z-index: 100; opacity: 0;
    }
    .nav-left { left: 0; }
    .nav-right { right: 0; }
    .nav-left:hover, .nav-right:hover { opacity: 0.04; background: white; }

    /* ===== 页码指示器 ===== */
    .slide-indicator {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      color: rgba(255,255,255,0.6); font-size: 14px; z-index: 200;
      user-select: none; pointer-events: none;
    }
    .progress-bar {
      position: fixed; bottom: 0; left: 0; height: 3px;
      background: currentColor; transition: width 0.4s ease; z-index: 200;
    }

    /* ===== 在此添加每页的自定义样式 ===== */
    /* ... */
  </style>
</head>
<body>
  <div class="deck" id="deck">
    <!-- 第 1 页：封面 -->
    <div class="slide active" data-slide="1">
      <!-- SLIDE_CONTENT_1 -->
    </div>

    <!-- 第 2 页：目录 -->
    <div class="slide" data-slide="2">
      <!-- SLIDE_CONTENT_2 -->
    </div>

    <!-- 第 3 页 -->
    <div class="slide" data-slide="3">
      <!-- SLIDE_CONTENT_3 -->
    </div>

    <!-- ... 为每一页添加 slide 容器和占位符 ... -->
    <!-- 最后一页 -->
    <div class="slide" data-slide="N">
      <!-- SLIDE_CONTENT_N -->
    </div>
  </div>

  <!-- 导航热区 -->
  <div class="nav-left" id="navLeft"></div>
  <div class="nav-right" id="navRight"></div>

  <!-- 页码指示器 -->
  <div class="slide-indicator" id="indicator">1 / N</div>
  <div class="progress-bar" id="progressBar"></div>

  <script>
    (() => {
      const deck = document.getElementById('deck');
      const slides = deck.querySelectorAll('.slide');
      const indicator = document.getElementById('indicator');
      const progressBar = document.getElementById('progressBar');
      const total = slides.length;
      let current = 0;

      function go(idx) {
        if (idx < 0 || idx >= total || idx === current) return;
        slides[current].classList.remove('active');
        slides[current].classList.add(idx > current ? 'prev' : '');
        current = idx;
        slides[current].classList.remove('prev');
        slides[current].classList.add('active');
        indicator.textContent = (current + 1) + ' / ' + total;
        progressBar.style.width = ((current + 1) / total * 100) + '%';
        // 清除非当前 slide 的 prev 类
        slides.forEach((s, i) => { if (i !== current) { s.classList.remove('active'); if (i < current) s.classList.add('prev'); else s.classList.remove('prev'); }});
      }
      function next() { go(current + 1); }
      function prev() { go(current - 1); }

      // 键盘导航
      document.addEventListener('keydown', e => {
        switch(e.key) {
          case 'ArrowRight': case ' ': case 'Enter': e.preventDefault(); next(); break;
          case 'ArrowLeft': case 'Backspace': e.preventDefault(); prev(); break;
          case 'Home': e.preventDefault(); go(0); break;
          case 'End': e.preventDefault(); go(total - 1); break;
          case 'f': case 'F':
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
            break;
          case 'Escape':
            if (document.fullscreenElement) document.exitFullscreen();
            break;
        }
      });

      // 鼠标点击导航
      document.getElementById('navLeft').addEventListener('click', prev);
      document.getElementById('navRight').addEventListener('click', next);

      // 滚轮导航（带节流）
      let wheelLock = false;
      document.addEventListener('wheel', e => {
        if (wheelLock) return;
        wheelLock = true;
        setTimeout(() => wheelLock = false, 600);
        e.deltaY > 0 ? next() : prev();
      }, { passive: true });

      // 触摸导航
      let touchStartX = 0;
      document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
      document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
      }, { passive: true });

      // 自适应缩放
      function resize() {
        const sw = window.innerWidth / 1920;
        const sh = window.innerHeight / 1080;
        deck.style.transform = 'scale(' + Math.min(sw, sh) + ')';
      }
      window.addEventListener('resize', resize);
      resize();

      // 初始化进度条
      progressBar.style.width = (1 / total * 100) + '%';
    })();
  </script>
</body>
</html>

## 每页内容设计要求
1. 先判断内容结构，再决定主次与视觉层级
2. 保持专业感、简洁感、可读性
3. 一级信息用大号字体、显眼颜色；二级信息用常规字体；辅助信息用小号、浅色
4. 图表、流程、对比等用 CSS + HTML 实现（flexbox/grid 布局）
5. 保持每页信息密度适中，不要堆砌
6. 配色方案全局一致，可根据风格要求调整
7. 使用 create_workspace_file 工具写入框架文件，不要在回复中直接输出完整 HTML
```

### 第二步：逐页内容填充模板（使用 `replace_in_file` 工具）

框架创建完成后，使用此模板指导逐页内容填充：

```text
请使用 replace_in_file 工具将占位符替换为实际内容。

## ⚠️ 关键规则
1. 每次调用 replace_in_file 只替换 1-3 页
2. old_str 必须是精确的占位标记，如 <!-- SLIDE_CONTENT_3 -->
3. new_str 是该页的完整 HTML 内容（.slide 容器内部）
4. 不要包含 <div class="slide"> 外层包裹

## 输入
- 文件路径：{{FILE_PATH}}
- 要填充的页码：{{PAGE_NUMBERS}}
- 策划稿（相关页）：
{{PLANNING_DRAFT_PAGES}}

## 调用示例
replace_in_file({
  path: "{{FILE_PATH}}",
  replacements: [
    {
      old_str: "<!-- SLIDE_CONTENT_3 -->",
      new_str: "<h2 style=\"font-size: 48px; color: #fff; margin-bottom: 40px;\">页面标题</h2>\n<div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 40px;\">\n  <div>左侧内容</div>\n  <div>右侧内容</div>\n</div>"
    },
    {
      old_str: "<!-- SLIDE_CONTENT_4 -->",
      new_str: "<h2 style=\"...\">另一页标题</h2>\n<p>内容...</p>"
    }
  ]
})

## 每页内容要求
1. 只输出 .slide 容器内部的 HTML（不要外层 div.slide 包裹）
2. 使用 inline style 或框架中已定义的 class
3. 使用 flexbox/grid 实现布局
4. 信息层级清晰：标题 → 核心信息 → 支撑细节
5. 适当使用图标字符（Unicode emoji 或 HTML 实体）
6. 与全局配色方案一致

## 填充完成后
使用 read_workspace_file 检查文件，确认所有 <!-- SLIDE_CONTENT_N --> 占位符都已被替换。
```

## Suggested Orchestration Pattern
When quality matters, this is the preferred sequence:
1. clarify brief
2. gather or organize context
3. research brief
4. outline
5. planning draft
6. **create_workspace_file** — generate HTML framework with placeholder slides (2-3 pages for sample)
7. **replace_in_file** — fill sample slide content for direction check
8. review gate
9. **replace_workspace_file** or **create_workspace_file** — generate full framework with all slides
10. **replace_in_file** × N — fill all slides (1-3 per call)
11. **read_workspace_file** — verify all placeholders replaced
