# Binlog Rescue 设计文档

## 一、背景与问题

### 问题场景
当 Master 发生 Failover 时，如果 Slave 和 Master 之间存在较大的复制延迟，会导致：
- Master 已提交的事务在新 Master 上不存在
- 产生**数据丢失**和**主从不一致**问题
- 影响数据完整性和业务连续性

### 核心挑战
1. **数据丢失风险**: 旧 Master 挂掉后，未同步的事务如何找回
2. **存储访问**: 旧 Master Pod 挂掉后，如何访问其 binlog 文件
3. **数据一致性**: 如何将缺失的事务安全地应用到新 Master
4. **业务中断**: 如何在 Rescue 过程中保护新 Master 不被写入

## 二、解决方案

### 核心思路
利用 **K8s + 分布式块存储(SPBS/LocalShare) + Binlog 解析** 实现数据挽救：
1. 通过存储卷持久化特性,即使 Pod 挂掉,binlog 文件依然可访问
2. 启动独立的 Rescue Pod 挂载旧 Master 的存储卷
3. 解析旧 Master 的 binlog,提取未同步的事务
4. 将缺失的事务应用到新 Master,恢复数据一致性


## 三、整体流程

### 流程概览
```
Failover 触发 → 检查配置 → 创建 Rescue 任务 → 启动 Rescue Pod → 
解析 Binlog → 应用事务 → 回调通知 → 验证完成 → 清理资源
```

### 详细步骤

#### 1. 获取故障上下文
- 通过 Orchestrator Hook 获取故障信息
- 提取 SourceHost (旧 Master) 和 TargetHost (新 Master) 信息
- 获取故障时刻的 binlog 坐标 (File + Position)

**关键数据**:
- `SourceInstanceHost/Port`: 旧 Master 的地址
- `TargetInstanceHost/Port`: 新 Master 的地址  
- `SuccessorExecCoordinates`: 继任者的执行位点 (如 `mysql-bin.000123:456789`)

#### 2. 初始化 HA 上下文
- 从集群元数据中加载 old-master 和 new-master 实例信息
- 验证集群拓扑和实例状态
- 准备后续操作所需的上下文数据

#### 3. 检查 Rescue 配置
判断是否满足 Rescue 条件:
- **全局开关**: `RescueGlobalEnable` 必须开启
- **集群级配置**: `BinlogRescueEnable` 必须为 1
- **存储类型**: 必须是 SPBS 或 LocalShare (支持卷挂载)
- **Reconciliation**: 是否自动应用 SQL (`BinlogReconciliationEnable`)

#### 4. 保护新 Master
**设计考虑**: 在 Rescue 过程中,新 Master 必须保持只读状态,防止:
- 新写入的数据与 Rescue 的数据产生冲突
- GTID 集合出现不连续或重叠
- 数据一致性被破坏

**实现**:
- 如果 `BinlogReconciliationEnable=1`,则执行 `SET GLOBAL read_only=ON`
- 使用 defer 机制确保最终一定会解除只读: `defer SetNewMasterReadOnlyOff()`

#### 5. 创建 Rescue 任务记录
在元数据库中创建任务追踪记录:

**核心字段**:
```go
type HaSpbsRescueJob struct {
    RecoveryUID    string   // 唯一任务 ID
    ClusterUUID    string   // 集群标识
    ClusterName    string   // 集群名称
    
    SourceHost     string   // 旧 Master 地址
    SourcePort     int64    // 旧 Master 端口
    TargetHost     string   // 新 Master 地址
    TargetPort     int64    // 新 Master 端口
    
    BinlogFile     string   // 起始 binlog 文件名
    BinlogPos      string   // 起始 binlog 位置
    
    RescueStatus   string   // 任务状态: operating/completed/failed
    RescueErrorMsg string   // 错误信息
    
    // 执行结果 (回调时更新)
    RescueParsedGtid        string   // 解析的 GTID 集合
    RescueDeltaGtid         string   // 增量 GTID 集合
    RescueDeltaBinlogInByte int64    // 增量 binlog 字节数
    RescueTimes             string   // 各阶段耗时统计
}
```

- `RescueStatus` 初始为 `operating`,由回调更新为 `completed/failed`
- `BinlogFile/Pos` 记录从哪个位点开始 Rescue

#### 6. 准备 Rescue Pod 配置

**加载运行时配置**:
- Rescue Pod 镜像 (`RescueImage`)
- 资源限制 (CPU/Memory Limits & Requests)
- Webhook 回调地址 (`RescueResultWebhook`)
- Binlog 目录路径 (`MysqlBinlogDir`)
- 超时时间、日志级别等

**构建任务参数**:
- 从旧 Master 的 Host 信息中提取 `ContainerID` (用于卷挂载)
- 生成唯一的 `RescueUID` (例如: `k8s-binlog-rescue-abc123`)
- 设置源/目标实例的连接信息
- 配置 Reconciliation 行为 (是否自动应用 SQL)

**存储类型差异**:
- **LocalShare**: 共享存储,直接访问 binlog 目录
- **SPBS**: 远程块存储,需要指定 `volumeMountType`:
  - `Clone`: 创建卷快照
  - `ForceClone`: 强制克隆 (即使原卷在使用中)

#### 7. 通过 DBCP 创建 OpsJob

**设计架构**:
```
dbaas-ha (控制面) → gRPC → DBCP (编排层) → K8s API → Rescue Pod (执行层)
```
**CreateOpsJob 请求结构**:
```go
CreateOpsJobRequest {
    OpsJobName: "k8s-binlog-rescue-xxxxx",  // 任务唯一标识
    
    Spec: {
        // ===== Target: 定位资源 =====
        Target: {
            Type:           OBJECT_TYPE_DB_INSTANCE,     // 资源类型
            DbClusterUuid:  task.ClusterUUID,            // 确定 K8s Namespace
            DbInstanceName: task.PodName,                // 旧 Master 的 ContainerID (用于卷挂载)
        },
        
        // ===== Action: 执行动作 =====
        Action: {
            Type: OPS_JOB_ACTION_TYPE_TEMPLATE,          // 使用模板创建
            Template: {
                Name: "rescueSPBS" | "rescueLocalShare", // 根据存储类型选择模板
                Args: {
                    // Pod 基本配置
                    image:      "rescue-image:v1.0.0",
                    pullPolicy: "Always",
                    command:    "rescue recover-linux --rescue_uid=xxx ...",
                    
                    // 资源配置
                    resources: {
                        limits:   {cpu: "2", memory: "2G"},
                        requests: {cpu: "1", memory: "1G"},
                    },
                    
                    // SPBS 特有参数
                    volumeMountType: "Clone" | "ForceClone",  // 卷克隆方式
                    
                    // 其他配置
                    shouldTolerateResourceTaints: true,
                },
            },
        },
        
        // ===== Options: 任务选项 =====
        Options: {
            Timeout: 300s,                               // 任务超时时间
            Notifications: [                             // 回调通知配置
                {
                    When: JOB_COMPLETE,                  // 完成时触发
                    Type: WEBHOOK,                       // Webhook 方式
                    Webhook: {
                        Endpoint: "https://xxx/webhook", // 回调地址
                        Headers: {"Token": "xxx"},       // 认证信息
                        RetryOptions: {                  // 重试策略
                            Policy: ON_FAILURE,
                            BackoffLimit: 3,
                        },
                    },
                },
            ],
        },
    },
}
```

**Target 字段详解**:
- `DbClusterUuid`:  根据此 UUID 确定 K8s Namespace 和集群配置
- `DbInstanceName`: 指向**旧 Master** 的 ContainerID,用于:
  - 找到旧 Master 的存储卷 (PVC/SPBS Volume)
  - 确定 Pod 调度策略 (亲和性)
  
** 注意**: Target 指向旧 Master,但 Rescue 的目标是新 Master,tagret不参与任何逻辑操作，只做审计。
**读取数据**: 从旧 Master 的存储卷读取 binlog，仿照flashback的实现去做数据恢复，不过这里不用去主上show binary logs然后读取了 而是可以直接使用存储卷挂载的方式去读取。
**应用数据**: 连接新 Master 执  行 SQL

#### 8. DBCP 创建 Rescue Pod

**DBCP 执行流程**:
1. **解析模板**: 根据 `rescueSPBS` 或 `rescueLocalShare` 获取 Pod 模板
2. **渲染配置**: 用 Args 参数填充模板变量,生成 Pod Spec
3. **挂载存储**: 
   - SPBS: 通过 CSI 驱动克隆旧 Master 的卷
   - LocalShare: 挂载共享存储或 hostPath
4. **创建 Pod**: 调用 K8s API 创建 Pod
5. **监控状态**: 持续监控 Pod 执行状态

**Pod 配置示例** (伪代码):
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: k8s-binlog-rescue-abc123
  namespace: db-prod-cluster           # 从 ClusterUuid 解析
spec:
  containers:
  - name: rescue
    image: rescue-image:v1.0.0
    command: ["/app/rescue"]
    args:
      - "recover-linux"
      - "--rescue_uid=k8s-binlog-rescue-abc123"
      - "--source_host=10.0.0.1"
      - "--target_host=10.0.0.2"       # 新 Master
      - "--binlog_file=mysql-bin.000123"
      - "--binlog_pos=456789"
      - "--auto_rescue_enable=true"
    volumeMounts:
    - name: old-master-binlog
      mountPath: /data/mysql_log        # 旧 Master 的 binlog 目录
      readOnly: true
  volumes:
  - name: old-master-binlog
    # SPBS 方式: CSI 卷克隆
    csi:
      driver: spbs.csi.driver
      volumeAttributes:
        sourceVolume: pvc-old-master-binlog
        cloneType: Clone
```

#### 9. Rescue Pod 执行

**执行逻辑**:
1. **挂载验证**: 检查 binlog 目录是否成功挂载
2. **Binlog 解析**:
   - 从指定的 File + Position 开始读取 binlog
   - 解析出所有事务和 GTID
   - 计算增量 GTID 集合 (Delta GTID)
3. **元数据查询**:
   - 连接**新 Master**
   - 查询 `information_schema.columns` 获取表结构
   - 用于构造 SQL 时的列信息
4. **事务提取**:
   - 根据新 Master 的表结构重建 SQL 语句
   - 过滤掉系统事务和已执行的事务
5. **DDL 检测**:
   - **关键设计**: 如果发现 DDL (ALTER/DROP/CREATE),直接报错退出
   - **原因**: DDL 可能导致数据不一致,需要人工介入
6. **SQL 应用** (如果 `auto_rescue_enable=true`):
   - 连接新 Master 执行提取的 SQL
   - 事务级别应用,保证原子性
7. **结果上报**:
   - 生成执行报告 (成功/失败、GTID、耗时)
   - 可选:将 SQL 导出到 S3 供审计

**与 Flashback 的差异**:
| 特性 | Flashback | Rescue |
|------|-----------|--------|
| **表结构来源** | 历史时刻 | 新 Master 当前 |
| **DDL 处理** | 尝试兼容 | 直接报错 |
| **使用场景** | 误操作回滚 | Failover 数据恢复 |

**技术实现上的关联**:

Binlog Rescue 与 [Flashback 数据回滚设计](./flashback数据回滚设计.md)在底层实现上有诸多相似之处,两者都依赖于对 binlog 的解析和 SQL 重建能力:

**共享的核心技术栈**:
1. **Binlog 解析引擎**: 两者都使用 `binlogsyncer` 从指定位点读取和解析 binlog 事件
2. **表结构缓存 (TDC)**: 通过查询 `information_schema.columns` 和 `show index` 获取表结构,存储在内存 map 中
3. **SQL 重建逻辑**: 根据 ROWS_EVENT 和表结构,生成对应的 INSERT/UPDATE/DELETE 语句
4. **事务边界处理**: 识别 BEGIN/COMMIT/XID_EVENT 来确定事务范围
5. **GTID 支持**: 支持基于 GTID 和基于位点两种同步方式

**关键区别**:

| 维度 | Flashback | Rescue |
|------|-----------|--------|
| **数据流向** | 读取旧 Master binlog → 生成回滚 SQL → 存储到 S3 | 读取旧 Master binlog → 生成补偿 SQL → 直接应用到新 Master |
| **执行模式** | 异步批处理,人工审核后执行 | 自动实时应用(可选) |
| **存储方式** | leveldb 本地存储(backward) 或 文件(forward) | 内存处理 + 直接执行 |
| **表结构来源** | 历史某个时刻的表结构 | 新 Master 的当前表结构 |
| **调度方式** | Manager + 独立 Pod | DBCP OpsJob + Rescue Pod |
| **上下文** | 平台发起的数据回滚请求 | HA Failover 触发的数据补偿 |

**代码复用与差异化**:

在实际实现中,Rescue 复用了 Flashback 的很多底层组件,但针对 HA 场景做了如下优化:

```go
// Flashback: 使用 leveldb 存储用于逆序
type Recorder struct {
    db *leveldb.DB  // 本地持久化存储
}

// Rescue: 直接在内存中处理,减少 I/O
type RescueExecutor struct {
    buffer []string  // 内存缓冲区
    conn   *sql.DB   // 新 Master 连接
}
```

如果需要了解 binlog 解析、SQL 重建、事务处理等底层实现细节,可以参考 [Flashback 数据回滚设计文档](./flashback数据回滚设计.md)。该文档详细描述了:
- 如何从 binlog 位点开始增量读取事件
- 如何处理 GTID/QUERY/TABLE_MAP/ROWS_EVENT 等各类事件
- 如何根据表结构生成 SQL 的 WHERE 条件(主键/唯一索引/全列)
- 如何实现 backward 模式的事务逆序输出

这些技术细节在 Rescue 场景中同样适用,只是最终的输出方式和应用策略有所不同。

## 四、回调与状态同步机制

### 设计背景
Rescue 是**异步长时任务**,可能持续数分钟。为了避免阻塞 HA 切换流程,采用:
- **异步执行**: dbaas-ha 发起后立即返回,不等待完成
- **主动回调**: Rescue Pod 完成后,DBCP 通过 Webhook 主动通知 dbaas-ha
- **轮询检查**: dbaas-ha 周期性查询数据库,检测状态变化
- **超时保护**: 设置超时时间,防止无限等待

### 回调配置 (ComposeNotification)

在创建 OpsJob 时,dbaas-ha 向 DBCP 传递回调配置:
- **触发时机**: 任务完成时 (JOB_COMPLETE)
- **通知方式**: Webhook HTTP POST
- **回调地址**: dbaas-ha 的 webhook 端点
- **认证信息**: Token、Job-UUID、Request-ID
- **重试策略**: 失败时自动重试,最多 N 次,使用指数退避

**设计要点**:
- 回调失败不影响任务执行结果
- 通过 RecoveryUID 关联任务
- 支持多种回调类型 (`apply_sql` / `parse_binlog`)

### 回调数据结构
```go
type ReqSpbsBinlogRescueResult struct {
    RecoveryUID         string           // 任务 ID
    RescueResult        bool             // 成功/失败
    RescueMessage       string           // 错误信息
    RescuePod           string           // 执行 Pod 名称
    RescueServer        string           // 服务器地址
    RescueTimes         map[string]int64 // 各阶段耗时
    RescueApplyTicket   string           // 应用工单
    RescueSQLS3Endpoint string           // SQL S3 地址
    RescueParsedGtid    string           // 解析的 GTID
    RescueDeltaGtid     string           // 增量 GTID
    RescueDeltaBinlogInByte int64        // binlog 字节数
    CallbackType        string           // "apply_sql" 或 "parse_binlog"
    // ... 其他字段
}
```

**回调流程:**

a) **Rescue Pod 执行完成后:**
   - DBCP 监控到 Pod 状态变为 Completed 或 Failed
   - 根据预先配置的 Notification 触发 Webhook 回调

b) **发送 HTTP 回调:**
   - POST 请求到配置的 webhook 端点
   - Headers 包含认证 Token、Job-UUID、X-Request-Id
   - Body 包含执行结果、GTID 信息、耗时统计等

c) **dbaas-ha HTTP Handler 接收:**
   - 路由注册 webhook 端点用于接收回调
   - 绑定请求参数到 ReqSpbsBinlogRescueResult 结构体
   - 调用处理函数 getSpbsBinlogRescueResultHandler

d) **ReceiveSpbsBinlogRescueResult 处理回调:**
   - 验证 CallbackType 是否为 "apply_sql"(只处理应用 SQL 的回调)
   - 根据 RecoveryUID 从数据库查找对应的 rescue 任务记录
   - 根据 RescueResult 更新任务状态为 "completed" 或 "failed"
   - 更新任务详细信息:错误消息、Pod 名称、执行耗时、解析的 GTID、增量 GTID、binlog 字节数等
   - 将更新后的任务记录保存到数据库

e) **WaitRescueDone 轮询检查状态:**
   - 设置超时时间为配置的 reconciliation timeout + 10 秒
   - 在超时前循环检查:
     - 从数据库读取任务状态(该状态由回调更新)
     - 如果状态为 "operating",等待 2 秒后继续轮询
     - 如果状态为 "completed",返回成功
     - 如果状态为 "failed",返回失败
   - 超时后返回错误

### 回调处理流程

**a) Rescue Pod 执行完成**:
- Pod 退出,Exit Code 0 (成功) 或 非 0 (失败)
- DBCP 监控到 Pod 状态变为 Completed/Failed
- 触发预配置的 Notification

**b) DBCP 发送回调**:
- 构造 HTTP POST 请求
- Headers 包含认证 Token 和任务标识
- Body 包含执行结果、GTID、耗时等详细信息
- 如果失败,按重试策略自动重试

**c) dbaas-ha 接收回调**:
- HTTP Handler 路由到对应的处理函数
- 解析请求参数到 `ReqSpbsBinlogRescueResult` 结构体
- 验证 `CallbackType` (只处理 `apply_sql` 类型)

**d) 更新任务状态**:
- 根据 `RecoveryUID` 查询数据库中的任务记录
- 更新 `RescueStatus`: `operating` → `completed/failed`
- 更新执行详情: GTID、耗时、错误信息等
- 持久化到 `dbaas_ha_spbs_rescue_job_tab` 表

**e) 轮询检测**:
- `WaitRescueDone()` 每 2 秒查询一次数据库
- 检查 `RescueStatus` 字段:
  - `operating`: 继续等待
  - `completed`: 返回成功
  - `failed`: 返回失败
- 超时 (timeout + 10s) 后返回超时错误

### 状态同步设计

**为什么需要轮询 + 回调?**
```
只用回调: 回调失败则无法感知完成 → 需要轮询兜底
只用轮询: 响应延迟高,浪费资源     → 需要回调加速
```

**组合方案**:
1. **正常情况**: 回调立即通知 → 下次轮询立即发现 → 快速返回
2. **回调失败**: 轮询持续检查 → 最终发现或超时 → 保底机制
3. **超时保护**: 无论如何,超时后强制返回 → 避免死锁

### 时序图
```
T0: dbaas-ha 发起 StartBinlogRescue()
    ↓
T1: DBCP 创建 Rescue Pod
    ↓
T2: Pod 开始执行 (operating)
    │
    ├──► dbaas-ha: WaitRescueDone() 启动
    │    每 2s 查询: SELECT * FROM rescue_job WHERE recovery_uid=xxx
    │    status = 'operating' → 继续等待
    │
T3: Pod 执行完成 (Exit Code 0)
    ↓
T4: DBCP 检测 Pod Completed
    ↓
T5: DBCP 发送 Webhook 回调
    POST /webhook/spbs_binlog_rescue_result
    Body: {rescue_result: true, rescue_parsed_gtid: "xxx", ...}
    ↓
T6: dbaas-ha 接收回调
    ReceiveSpbsBinlogRescueResult()
    ↓
T7: 更新数据库
    UPDATE rescue_job SET status='completed', rescue_parsed_gtid='xxx' ...
    ↓
T8: WaitRescueDone() 下次轮询
    SELECT * FROM rescue_job
    status = 'completed' → 返回成功!
    ↓
T9: 解除新 Master 只读
    SET GLOBAL read_only=OFF
    ↓
T10: 添加清理任务
     定时删除 Rescue Pod (5 分钟后)
```

## 五、清理与收尾

### 1. 解除新 Master 只读
- 检查 Rescue 是否成功完成
- 执行 `SET GLOBAL read_only=OFF`
- 通过 defer 机制保证一定执行

### 2. 打印任务详情
- 从数据库加载最终的任务记录
- 记录到日志中供审计
- 包含: GTID 集合、执行耗时、binlog 字节数等

### 3. 添加清理任务
- 创建 CronTask,定时删除 Rescue Pod
- 默认 5 分钟后执行 (可配置)
- 避免占用集群资源

**清理任务参数**:
```go
type DeleteLambdaParam struct {
    DeleteTime  int64   // 删除时间戳
    RecoveryUID string  // 关联的任务 ID
    LambdaName  string  // Pod 名称
    Zone        string  // 可用区
    ClusterUUID string  // 集群 UUID
}
```
