如果说 LLM 是 agent 的大脑，那么 tool 就是它真正接触世界的手脚。

没有 tool，模型大多只能“说”；有了 tool，它才能：

- 搜索和检索信息
- 读写文件
- 调用 API
- 执行代码
- 修改外部系统状态

但也正因为如此，**tool 既是能力放大器，也是风险放大器。**

过去很多文章会把 “tool design” 和 “tool abuse prevention” 分开讨论：前者关心怎么让模型更会用工具，后者关心怎么阻止无限循环、乱调工具、越权操作。

我现在更倾向于把它们放在一起看，因为从工程上讲，它们其实是同一件事：

> **一个好工具，不只是“模型容易调用”，还必须“模型很难误用、滥用、越权调用”。**

这篇文章会把两件事合并起来，从论文和大厂工程实践出发，回答三个问题：

- tool use 为什么是 agent 能力的核心？
- 什么样的工具设计，能显著提升效果？
- 从架构上，怎么把 tool abuse 风险压到可控？

## 1. 为什么 tool use 这么重要

### 1.1 从 “会说” 到 “会做”

LLM 原生最强的是语言建模，但现实任务往往需要：

- 访问最新信息
- 操作外部系统
- 做精确计算
- 运行程序
- 在长流程中保持状态

这也是为什么早期几篇经典论文几乎都把“工具”当成 agent 能力跃迁的关键：

- **ReAct**：把 reasoning 和 acting 交替起来，让模型边想边调用外部动作
- **Toolformer**：探索让模型自监督学习何时调用工具
- **Gorilla**：把 API 使用能力系统化，强调模型连接外部 API 的实用性
- **API-Bank**：把“工具增强 LLM”的能力评测做成更系统的 benchmark

如果把这几篇放在一起看，会发现一个很清晰的趋势：

> LLM 的上限，不只取决于模型本身，还取决于它能否在合适的时候、以合适的方式、调用合适的工具。

### 1.2 tool use 带来的不是单点能力，而是系统能力

很多人把 tool 看成“外挂函数”，但在 agent 里，tool 更像系统能力接口。

一旦引入工具，系统会发生三个变化：

- **信息边界变化**：模型不再只依赖上下文，而是能从外部持续取数
- **行动边界变化**：模型不再只输出文本，而是能触发副作用
- **责任边界变化**：错误不再只是“答错”，而可能是“执行错”

也就是说，从引入 tool 的那一刻开始，你在设计的就不再只是 prompt，而是一个 **带权限、带状态、带副作用的执行系统**。

这也是为什么后面“设计好工具”和“防止工具滥用”必须一起讨论。

## 2. 好的 tool design，首先不是多，而是清晰

在实际工程里，最容易犯的错误之一就是：给模型暴露太多工具、太多参数、太多重叠能力，然后期待它自己选对。

Anthropic 在 `Writing tools for agents` 这类工程实践里反复强调的一点就是：**工具设计要像 API 设计，而不是像把内部能力全量裸露出去。**

### 2.1 工具应该少而锋利，不要一堆重叠能力

一个糟糕的工具集通常长这样：

- `search_web`
- `search_web_v2`
- `web_lookup`
- `web_query`
- `google_search`
- `find_information`

对人类来说都很难分清，更别说模型。

更好的做法是：

- 工具数量控制在必要范围
- 每个工具职责单一
- 名称能反映真实动作
- 参数能表达边界，而不是表达所有可能性

工具设计的目标不是“覆盖所有未来需求”，而是“让模型在当前任务里不容易选错”。

### 2.2 名称、描述、参数，其实就是模型的操作界面

对 tool use 来说，`name`、`description`、`input_schema` 并不是装饰字段，而是模型真正理解工具的主要入口。

这意味着：

- 工具名要动词化、明确化
- 描述里要写“什么时候用 / 不该什么时候用”
- 参数名要反映业务语义，不要只追求简短
- schema 只表达结构还不够，最好补 usage examples

比如 `create_ticket` 这类工具，如果只给 JSON Schema，模型通常只能知道字段合法性，却不一定知道：

- 什么情况下应该填 `priority`
- 日期格式应该怎样写
- 什么任务不需要 `assignee`
- 哪些字段对 feature request 并不关键

所以实践里非常有效的一招是：**除了 schema，再给少量高质量调用示例。**

这点和 Anthropic、OpenAI 的官方建议都一致：结构约束解决“格式正确”，示例和描述解决“使用习惯正确”。

### 2.3 把复杂动作收敛成高层语义接口

另一个常见坑是把工具暴露得过低层：

- `open_file`
- `read_chunk`
- `write_chunk`
- `move_cursor`
- `append_line`

如果任务只是“更新配置文件”，这种低层接口会强迫模型自己做大量中间控制，既费 token，又容易出错。

更好的模式往往是：

- `update_config`
- `create_pull_request`
- `send_approval_email`
- `query_customer_orders`

也就是让工具尽量表达 **完整业务动作**，而不是暴露原子机械步骤。

这么做有两个好处：

- 能减少多步链式调用错误
- 能把约束和校验集中到工具实现层

从安全角度看，这也很重要：**高层语义工具通常比低层通用工具更容易做权限控制。**

## 3. 大厂工程实践里，tool design 正在往“按需、可控、可观察”演化

### 3.1 Anthropic：不要把几十个工具一次性塞进上下文

Anthropic 在 `Advanced tool use` 相关实践里很强调一个点：**工具不一定要 upfront 全量加载。**

当系统里有很多工具时，直接把所有定义塞进上下文会带来三个问题：

- token 开销很高
- 模型选择混乱
- 重叠工具更容易被误用

更优的方式是先做工具检索，再按需加载少量候选工具。也就是类似：

1. 先用一个轻量机制搜索最相关的工具
2. 只把少数命中的工具定义放进上下文
3. 再由模型在这些工具里选择和调用

这个思路很像 RAG，只不过检索对象从“知识”变成了“工具”。

它的收益不只是省 token，更关键的是：**缩小模型的动作空间。**

动作空间越小，调用错误和滥用的概率通常也越低。

### 3.2 Anthropic：在复杂任务里，programmatic tool use 往往优于硬拆成很多轮 JSON 调用

Anthropic 另一条很重要的实践是：对复杂工作流，可以让模型生成程序，再由程序去组织工具调用，而不是强迫模型每一步都手写一条工具调用 JSON。

这类思路背后的逻辑是：

- 条件分支、循环、重试、缓存这类控制流，本来就是代码更擅长
- 模型负责规划和生成逻辑
- 执行环境负责严格运行和约束逻辑

这比“全靠对话轮次维持状态”更稳，也更节省上下文。

但这条路的前提是：**代码执行环境必须被严格沙箱化。**

否则“programmatic tool use” 很容易直接升级成“programmatic tool abuse”。

### 3.3 Anthropic MCP / code execution：强能力工具一定要建立在沙箱和边界之上

Anthropic 的 `Code execution tool` 和 MCP 相关实践一个很鲜明的特点是：

- 不把代码执行当作普通文本补全
- 而是把它放进隔离执行环境
- 并强调资源、网络、文件访问等边界

这背后的工程哲学很值得借鉴：

> **越强的工具，越不能只靠 prompt 约束，必须靠执行环境约束。**

也就是说：

- Shell 不该默认拥有宿主机全部权限
- 代码执行不该默认能访问任意网络和密钥
- MCP server 不该默认暴露所有后端能力
- 文件系统不该默认全目录可写

如果这些边界不存在，那么模型只要一次判断失误，后果就会非常重。

### 3.4 OpenAI：tool calling 的关键不是“模型能生成函数参数”，而是“系统要保留授权权”

OpenAI 在 function calling / tools / agents 相关官方文档中反复强调的一点是：

- 模型生成的是调用建议
- 开发者系统必须做 server-side validation
- 工具执行前必须检查参数、权限、上下文

这其实非常关键，因为它把角色分清楚了：

- **模型负责提议**
- **系统负责授权**

如果把这个顺序反过来，变成“模型决定调用什么，系统直接照做”，那 tool use 就会天然滑向滥用和越权。

所以一个成熟的 tool 系统，真正的核心从来不是 “function calling JSON 长什么样”，而是：

- 允许哪些工具
- 允许谁在什么条件下调用
- 参数可接受范围是什么
- 哪些动作必须二次确认

## 4. tool abuse 不是边缘问题，而是 tool design 的一部分

一旦 agent 可以调用工具，最典型的风险通常不是“不会用”，而是“用过头”“用错地方”“用错权限”。

这些风险大概分成四类。

### 4.1 无限循环和空转

这是最常见、也最容易被忽视的一类：

- 一直重复调用同一个搜索工具
- 在两个工具之间来回切换
- 因为工具失败而无休止重试
- token 和时间都在消耗，但状态没有推进

这类问题很多时候不是“模型坏掉了”，而是系统没有给它明确的终止条件和预算边界。

### 4.2 低价值高频调用

比如：

- 明明缓存里有数据，却反复查
- 明明一次聚合接口能完成，却拆成很多小调用
- 明明问题已经足够回答，却继续搜更多资料

这类滥用会让系统成本飙升，也会增加错误暴露面。

### 4.3 权限升级和副作用失控

更危险的是：

- 用读取到的不可信内容去驱动写操作
- 把摘要任务升级成发信、改库、下单
- 让低风险任务无意间触发高风险工具

这里真正的问题不是“模型调用了工具”，而是 **模型把不该触发副作用的输入，转成了高权限动作。**

### 4.4 间接注入驱动的工具误用

在 agent 时代，prompt injection 和 tool abuse 往往是一体两面。

例如：

- 恶意网页诱导模型调用 `send_email`
- RAG 文档里埋指令，诱导 agent 修改数据库
- 工具返回内容本身继续污染后续决策

所以很多 “tool abuse prevention” 的核心，其实就是：

> **不要让不可信内容直接影响高权限工具调用。**

## 5. 论文和 benchmark 给出的启发：好 agent 不是更会调工具，而是更会受约束地调工具

### 5.1 ReAct、Toolformer、Gorilla、API-Bank：证明了工具的价值，也暴露了选择和执行问题

这些经典工作重要，不只是因为它们证明了工具增强 LLM 很有用，还因为它们共同暴露出几个现实问题：

- 什么时候该调工具，什么时候不该调
- 多个工具里该选哪一个
- 工具结果回流后如何继续推理
- 出错后怎么恢复而不是发散

也就是说，**“会调工具” 从一开始就包含一个隐含问题：怎么防止错误调用累积成系统风险。**

### 5.2 AgentDojo、Task Shield：评测重点已经从“会不会调”变成“会不会安全地调”

到了 2025 年之后，像 **AgentDojo**、**Task Shield** 这类工作开始更明确地关注：

- 现实环境里的 prompt injection
- tool misuse / unsafe action
- 任务级别的安全评测
- 工具调用前后的防护机制

这类工作很重要，因为它们说明学界和工业界的关注点正在迁移：

> 真正难的不是让模型“学会调用工具”，而是让它在开放环境里“持续、稳定、受控地调用工具”。

## 6. 从架构角度，tool abuse prevention 最有效的不是检测，而是约束

很多讨论喜欢把防滥用理解成“识别坏行为”，比如：

- 看 CoT 是否在重复
- 看最近几次调用是否相似
- 检测是否出现循环图

这些方法不是没用，但它们更像补丁，而不是根治。

从系统设计角度，更可靠的做法通常是下面几类。

### 6.1 先做预算约束：不给系统无限试错空间

这是第一道防线，而且几乎永远值得做：

- 每轮最大工具调用次数
- 每个任务总 token 预算
- 每种工具单独的调用上限
- 最大 wall-clock time
- 最大失败重试次数

如果一个系统在预算上没有上限，那它不是“智能”，而是“不设防”。

### 6.2 工具必须有状态前置条件，而不是谁都能随时调

比如：

- `send_email` 只能在 `draft_ready=true` 后调用
- `submit_order` 只能在 `user_confirmed=true` 后调用
- `delete_record` 必须带 revision / version check
- `write_memory` 只能写结构化摘要，不能写原始自由文本指令

这类设计的价值在于：即便模型一时判断错了，也未必能越过系统状态机。

也就是说，**把工具调用从“自然语言冲动”降级成“状态机允许的动作”。**

### 6.3 读和写分离，低权限和高权限分离

最重要的安全原则之一就是：

- 能读世界的，不要默认能改世界
- 能看不可信内容的，不要默认能调用高风险工具
- 能规划的，不要默认能执行

一种比较稳的分层方式是：

- **Reader**：读取网页、文档、邮件、检索结果
- **Planner**：产出结构化 action proposal
- **Policy Layer**：检查权限、参数、来源、风险等级
- **Executor**：执行通过审核的工具调用

这样即便 Reader 被间接注入影响，也不意味着攻击者就直接拿到了写操作能力。

### 6.4 高风险工具默认人工确认或二次授权

这一点非常朴素，但非常有效。

需要二次确认的典型动作包括：

- 发邮件、发消息
- 付款、报销、下单
- 删除或覆盖数据
- 修改权限、配置、密钥
- 执行 shell / code / deployment

工程上一个很实用的原则是：

> **低价值高频动作自动化，高价值低频动作审批化。**

不要把所有工具都追求成“一步到位的全自动”。

### 6.5 provenance / taint tracking：让系统知道哪些结论被不可信内容影响过

这是未来几年我认为会越来越重要的一条线。

当 agent 消费很多外部内容时，系统最好知道：

- 哪段内容来自用户
- 哪段来自网页或 RAG
- 哪段来自内部数据库
- 哪段是模型自己生成的中间结论
- 哪些计划或参数被不可信内容影响过

一旦有了这些信号，就可以做更合理的策略：

- 被 taint 的内容不能直接驱动 `write` / `pay` / `send`
- 来自外部文档的文本只能用于回答，不能自动升级成系统指令
- 工具返回结果进入长期记忆前要做净化

这和 prompt injection 防御本质上是同一个问题：**防止数据越级变成指令。**

### 6.6 关键工具实现幂等、可回滚、可审计

即使前面的约束都做了，也要假设系统迟早会犯错。

所以高价值工具最好具备：

- 幂等键（避免重复提交）
- dry-run 模式
- 审计日志
- 参数和结果留痕
- 回滚和撤销能力

这类工程能力平时不显山不露水，但一旦 agent 真开始接入生产系统，它们比多写十条 prompt 规则更重要。

## 7. 一个更稳的工具系统长什么样

如果把论文和大厂实践压缩成一个比较稳的蓝图，我会建议这样设计。

### 第 1 层：Tool registry

职责：

- 统一管理工具元数据
- 保留 owner、权限、风险级别、输入输出 schema
- 支持 tags / capability 搜索

关键要求：

- 不把所有工具定义一次性暴露给模型
- 支持按需检索和按需加载

### 第 2 层：Tool selection

职责：

- 先决定“需不需要工具”
- 再决定“该用哪几个工具”

关键要求：

- 尽量缩小候选集合
- 避免重叠工具同时暴露
- 对高风险工具加额外门槛

### 第 3 层：Action proposal

由模型输出结构化意图，例如：

- 调哪个工具
- 参数是什么
- 为什么需要这个动作
- 风险等级预估

注意这里仍然只是 **proposal**，不是直接执行命令。

### 第 4 层：Policy enforcement

这是很多 demo 系统最缺的一层。

这里应该做：

- schema validation
- server-side parameter validation
- 权限与资源范围检查
- taint / provenance 检查
- 风险分级
- 是否需要人工确认

如果没有这层，function calling 只是把“字符串 prompt”升级成了“结构化 prompt”，但风险本质没变。

### 第 5 层：Sandboxed execution

真正执行动作的地方必须隔离：

- 代码执行要有沙箱
- Shell 要有限定作用域
- 文件系统要有限定目录
- 网络访问要最小化
- 密钥暴露要按工具粒度控制

越是通用、强力的工具，越要在这里加边界。

### 第 6 层：Observation and recovery

最后还要补上：

- tracing
- 调用日志
- 异常检测
- rate limit
- budget exhaustion stop
- rollback / kill switch

一个 production-ready 的 tool system，往往不是赢在“最聪明”，而是赢在“出错时还能停下来、看得见、拉得回来”。


如果只把 “tool abuse prevention” 理解成：

- 检测循环
- 检测重复调用
- 奖励模型学会停止

那视角还是偏窄了。

这些方法可以作为局部优化，但更上位的问题其实是：

1. 为什么模型有机会无限试错？
2. 为什么它能读到不可信内容后还继续拥有高权限？
3. 为什么工具调用没有被状态机、策略层、预算系统拦住？

换句话说，**真正好的防滥用不是“更聪明地发现错误”，而是“让错误更难发生、发生后更难扩大”。**

## 参考资料

下面这些资料最值得顺着读，能把“工具能力”与“工具安全”连起来看：

- Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models* (2023)  
  https://arxiv.org/abs/2210.03629
- Schick et al., *Toolformer: Language Models Can Teach Themselves to Use Tools* (2023)  
  https://arxiv.org/abs/2302.04761
- Patil et al., *Gorilla: Large Language Model Connected with Massive APIs* (2023)  
  https://arxiv.org/abs/2305.15334
- Li et al., *API-Bank: A Comprehensive Benchmark for Tool-Augmented LLMs* (2023)  
  https://arxiv.org/abs/2304.08244
- Wang et al., *AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents* (2025)  
  https://arxiv.org/abs/2506.13327
- Kim et al., *Task Shield: Safeguarding Agentic AI with Task-Aligned Detection of Prompt Injection Attacks* (2025)  
  https://arxiv.org/abs/2506.08838
- Anthropic, *Advanced tool use*  
  https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- Anthropic, *Writing tools for agents*  
  https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, *Code execution tool*  
  https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/code-execution-tool
- Anthropic, *Model Context Protocol (MCP)*  
  https://docs.anthropic.com/en/docs/agents-and-tools/mcp
- OpenAI, *Function calling / Tools guide*  
  https://platform.openai.com/docs/guides/function-calling
- OpenAI, *Building agents*  
  https://openai.com/index/building-agents/

如果把整篇文章压缩成一句话，那就是：

> **好的工具设计，不只是让模型更容易调用工具，而是让系统在模型判断失误、被注入、或陷入空转时，仍然能把损害限制在一个很小的范围内。**
