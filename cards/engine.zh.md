---
title: 引擎即二进制
id: engine-is-the-binary
tags: [引擎, 架构]
icon: ⚙️
links: [guides/getting-started]
---

Grimoire 编译成**一个可执行文件**。它本身不携带内容：启动时读取一个项目目录
——`config` + `notes/` + `components/` + `cards/`——并按需编译 MDX 后提供服务。

由此带来的结果是：升级引擎从不触碰你的笔记，把笔记复制到另一台机器也不需要
任何构建步骤。

---
title: 启动流程
id: engine-boot
tags: [引擎, 运行时]
icon: 🚀
---

1. 加载 `config.ts`（或 `.json`/`.jsonc`）。
2. 从磁盘扫描 `notes/`、`components/`、`cards/`。
3. 提取全部链接并解析，构建图谱——参见 [[link-resolution]]。
4. 依据主题与扫描到的类名在服务端生成 CSS。
5. 提供服务；监听这三个目录，发生变化即重建。

没有任何东西被预编译：一篇笔记在第一次被请求时才变成 JavaScript，随后一直
缓存到文件发生改动为止。

---
title: 链接解析
id: link-resolution
tags: [双链, 图谱]
icon: 🔗
---

`[[目标]]` 按以下顺序解析：

1. 显式的类型前缀——`note:x`、`card:x`。
2. 精确 id（`guides/getting-started`），不区分大小写。
3. **唯一**的文件名、标题或别名。

歧义会被刻意判定为解析失败：如果有两篇笔记都叫 `intro`，这条链接会被报告为
失效，而不是随便猜一个。具体发生在哪一步见 [[engine-boot]]。

---
title: 卡片为什么是纯文本
id: cards-are-text
tags: [卡片, 设计]
icon: 🃏
links: [card-format]
---

一张卡片就是一段有名字的知识。把卡组保存为普通 Markdown 文件，意味着它们
diff 干净、能在 git 中合并，并且在制造它们的工具消失之后依然可读。

没有数据库、没有索引文件、也没有需要手工维护的 id——除非你自己写一个，
否则卡片的 id 就是它的标题。

---
title: 卡片文件格式
id: card-format
tags: [卡片, 参考]
icon: 📐
---

一个文件就是一个卡组。每张卡片以自己的 YAML 块开头：

```md
---
title: 启动流程
id: engine-boot
tags: [引擎, 运行时]
links: [guides/getting-started]
---

正文 Markdown，和别处一样可以写 [[双链]]。
```

只有当 `---` 单独成行、前面是一个空行、在若干行内闭合、能解析为 YAML 并且
声明了 `title` 或 `id` 时，它才会开启一张新卡片。其余情况——分隔线、表格、
看起来像 frontmatter 的正文——都保持为正文。卡片正文里的水平分隔线请用 `***`。

---
title: 主题就是自定义属性
id: theme-tokens
tags: [主题, CSS]
icon: 🎨
---

Tailwind v4 的工具类都从主题变量中读取取值，因此只要在 `:root` 上重新声明
`--color-neutral-*`、`--color-white`、`--radius-*` 和 `--font-body`，就能一次性
给所有既有组件换色。

整个主题系统就是这么回事：一个预设是一条中性色阶加上若干默认值，而选择器
所做的只是重新生成那段 CSS 并缓存下来，供下次访问使用。

也正因如此，一整套配色可以直接写在 `config.ts` 里——它不需要被编译进任何
东西，只需要变成十一行 `--color-neutral-*` 声明。
