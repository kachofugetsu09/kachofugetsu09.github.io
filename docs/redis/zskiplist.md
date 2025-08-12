# Redis 跳表 (Skip List) 详解

## 数据结构定义

每一个skiplist的node的结构体如下：
```c
typedef struct zskiplistNode {
    sds ele;                    // 元素值
    double score;               // 分数
    struct zskiplistNode *backward;  // 后向指针，指向前一个节点
    struct zskiplistLevel {
        struct zskiplistNode *forward;  // 前向指针，指向下一个节点
        unsigned long span;             // 跨度，表示到下一个节点在level0上跨越的节点数
    } level[];                  // 层级数组
} zskiplistNode;
```

**重要概念**：
- `ele`：存储的元素值
- `score`：节点的分数，用于排序
- `backward`：后向指针，只在level 0存在，用于反向遍历
- `forward`：前向指针，指向下一个节点
- `span`：**跨度，表示从当前节点的某一层到下一个节点在level 0上跨越了多少个节点**

跳表的主结构：
```c
typedef struct zskiplist {
    struct zskiplistNode *header, *tail;  // 头尾指针
    unsigned long length;                  // 节点数量
    int level;                            // 当前最高层级
} zskiplist;
```

## 初始化过程

```c
zskiplist *zslCreate(void) {
    int j;
    zskiplist *zsl;

    zsl = zmalloc(sizeof(*zsl));
    zsl->level = 1;
    zsl->length = 0;
    zsl->header = zslCreateNode(ZSKIPLIST_MAXLEVEL,0,NULL);
    for (j = 0; j < ZSKIPLIST_MAXLEVEL; j++) {
        zsl->header->level[j].forward = NULL;
        zsl->header->level[j].span = 0;
    }
    zsl->header->backward = NULL;
    zsl->tail = NULL;
    return zsl;
}
```

**初始化特点**：
- `ZSKIPLIST_MAXLEVEL = 32`，预分配32层
- 创建一个虚拟头节点，拥有32层结构
- 所有层的`forward = NULL`，`span = 0`
- 这是一个空的跳表

**初始状态**：
```
Level 31: [HEADER] -> NULL
Level 30: [HEADER] -> NULL
   ...
Level 1:  [HEADER] -> NULL
Level 0:  [HEADER] -> NULL
```

## 插入操作详解

插入新节点使用以下函数：

会维护一个update数组，这个数组的作用是记录在每一层当中，新节点的前一个节点。也就是在插入的时候需要更新的节点，它需要调整自己的forward指针以及对应的span。以及一个rank数组，这个数组的作用是记录在每一层当中，到达插入位置时累计跨越的节点数量。

**核心概念**：
- `update[i]`：记录在第i层中，新节点的前一个节点（需要更新其forward指针的节点）
- `rank[i]`：记录在第i层中，到达插入位置时累计的排名（跨越的节点数）

**核心流程**：
1. 从最高层开始向下搜索，找到每一层中新节点应该插入的位置
2. 在每一层中，找到第一个score大于插入score的节点，或score相等但ele大于插入ele的节点
3. 记录每一层的前驱节点到update数组，记录累计排名到rank数组
4. 生成新节点的随机层高
5. 更新所有相关的forward指针和span值

```c
zskiplistNode *zslInsert(zskiplist *zsl, double score, sds ele) {
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    unsigned long rank[ZSKIPLIST_MAXLEVEL];
    int i, level;

    serverAssert(!isnan(score));
    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        /* store rank that is crossed to reach the insert position */
        rank[i] = i == (zsl->level-1) ? 0 : rank[i+1];
        while (x->level[i].forward &&
                (x->level[i].forward->score < score ||
                    (x->level[i].forward->score == score &&
                    sdscmp(x->level[i].forward->ele,ele) < 0)))
        {
            rank[i] += x->level[i].span;
            x = x->level[i].forward;
        }
        update[i] = x;
    }
    level = zslRandomLevel();
    if (level > zsl->level) {
        for (i = zsl->level; i < level; i++) {
            rank[i] = 0;
            update[i] = zsl->header;
            update[i]->level[i].span = zsl->length;
        }
        zsl->level = level;
    }
    x = zslCreateNode(level,score,ele);
    for (i = 0; i < level; i++) {
        x->level[i].forward = update[i]->level[i].forward;
        update[i]->level[i].forward = x;

        /* update span covered by update[i] as x is inserted here */
        x->level[i].span = update[i]->level[i].span - (rank[0] - rank[i]);
        update[i]->level[i].span = (rank[0] - rank[i]) + 1;
    }

    /* increment span for untouched levels */
    for (i = level; i < zsl->level; i++) {
        update[i]->level[i].span++;
    }

    x->backward = (update[0] == zsl->header) ? NULL : update[0];
    if (x->level[0].forward)
        x->level[0].forward->backward = x;
    else
        zsl->tail = x;
    zsl->length++;
    return x;
}
```

## 实例演示

###  span 和 rank 的核心概念

- **span（跨度）**：表示从当前节点的某一层到下一个节点在 level 0 上跨越了多少个节点
- **rank（排名）**：表示在查找过程中累计经过的节点数量

###  完整插入过程示例

#### 第一步：插入节点 B(score=2, level=2)

**插入前**：
```
Level 1: [HEADER] -> NULL
Level 0: [HEADER] -> NULL
```

**查找过程**：
- `rank[1] = 0, rank[0] = 0`
- `update[1] = HEADER, update[0] = HEADER`

**插入后**：
```
Level 1: [HEADER] -> [B] -> NULL     (HEADER的span=1)
Level 0: [HEADER] -> [B] -> NULL     (HEADER的span=1)
```

#### 第二步：插入节点 C(score=3, level=1)

**查找过程**：
- Level 1: HEADER -> B（B.score=2 < 3，继续） -> NULL，`rank[1] = 1, update[1] = B`
- Level 0: B -> NULL（到达末尾），`rank[0] = 1, update[0] = B`

**插入后**：
```
Level 1: [HEADER] -> [B] -----------> NULL     (HEADER的span=1, B的span=1)
Level 0: [HEADER] -> [B] -> [C] -> NULL       (HEADER的span=1, B的span=1)
```

插入C后，Level 1中B的span需要更新为2，因为从B到下一个节点（NULL）在level 0上跨越了2个节点（B和C）：

```
Level 1: [HEADER] -> [B] -----------> NULL     (HEADER的span=1, B的span=2)
Level 0: [HEADER] -> [B] -> [C] -> NULL       (HEADER的span=1, B的span=1)
```

#### 第三步：插入节点 D(score=4, level=1)

**查找过程**：
- Level 1: HEADER -> B（B.score=2 < 4，继续） -> NULL，`rank[1] = 1, update[1] = B`  
- Level 0: B -> C（C.score=3 < 4，继续） -> NULL，`rank[0] = 2, update[0] = C`

**span 更新计算**：
- C的新span = (rank[0] - rank[0]) + 1 = (2 - 2) + 1 = 1
- D的span = C原span - (rank[0] - rank[0]) = 1 - (2 - 2) = 1
- B的span需要+1（因为底层多了一个节点）：2 + 1 = 3

**插入后**：
```
Level 1: [HEADER] -> [B] -----------------> NULL     (HEADER的span=1, B的span=3)
Level 0: [HEADER] -> [B] -> [C] -> [D] -> NULL       (所有span都=1)
```

#### 第四步：插入节点 E(score=5, level=3)

**查找过程**：
- Level 2: 不存在，从Level 1开始
- Level 1: HEADER -> B（B.score=2 < 5，继续） -> NULL，`rank[1] = 1, update[1] = B`
- Level 0: B -> C -> D（D.score=4 < 5，继续） -> NULL，`rank[0] = 3, update[0] = D`

**span 更新计算**：

对于 **level 0**（update[0] = D）：
```c
// E 的 span = D 原来的 span - (rank[0] - rank[0]) = 1 - 0 = 1
x->level[0].span = 1 - (3 - 3) = 1;
// D 的新 span = (rank[0] - rank[0]) + 1 = 1  
update[0]->level[0].span = (3 - 3) + 1 = 1;
```

对于 **level 1**（update[1] = B）：
```c
// E 的 span = B 原来的 span - (rank[0] - rank[1]) = 3 - 2 = 1
x->level[1].span = 3 - (3 - 1) = 1;
// B 的新 span = (rank[0] - rank[1]) + 1 = 3
update[1]->level[1].span = (3 - 1) + 1 = 3;
```

对于 **level 2**（新层，update[2] = HEADER）：
```c
// E 的 span = HEADER 原来的 span - (rank[0] - rank[2]) = 3 - 3 = 0，但实际是1
x->level[2].span = 3 - (3 - 0) = 0; // 这里需要特殊处理为1
// HEADER 的新 span = (rank[0] - rank[2]) + 1 = 4
update[2]->level[2].span = (3 - 0) + 1 = 4;
```

**最终结果**：
```
Level 2: [HEADER] -----------------> [E] -> NULL    (HEADER的span=4)
Level 1: [HEADER] -> [B] -----------> [E] -> NULL    (HEADER的span=1, B的span=3, E的span=1)
Level 0: [HEADER] -> [B] -> [C] -> [D] -> [E] -> NULL (各span都=1)
```

## 查找操作详解

### 查找某个值的排名

```c
unsigned long zslGetRank(zskiplist *zsl, double score, sds ele) {
    zskiplistNode *x;
    unsigned long rank = 0;
    int i;

    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        while (x->level[i].forward &&
            (x->level[i].forward->score < score ||
                (x->level[i].forward->score == score &&
                sdscmp(x->level[i].forward->ele,ele) <= 0))) {
            rank += x->level[i].span;
            x = x->level[i].forward;
        }

        /* x might be equal to zsl->header, so test if obj is non-NULL */
        if (x->ele && x->score == score && sdscmp(x->ele,ele) == 0) {
            return rank;
        }
    }
    return 0;
}
```

**查找排名过程详解**：

使用之前构建的跳表结构查找C(score=3)的排名：
```
Level 2: [HEADER] -----------------> [E] -> NULL    (HEADER的span=4)
Level 1: [HEADER] -> [B] -----------> [E] -> NULL    (HEADER的span=1, B的span=3)
Level 0: [HEADER] -> [B] -> [C] -> [D] -> [E] -> NULL (各span都=1)
```

**查找过程**：
1. **Level 2**: 从HEADER开始，rank=0
   - E.score=5 > 3，不能前进，停在HEADER
   
2. **Level 1**: 继续从HEADER开始
   - B.score=2 < 3，可以前进，rank += 1，移动到B
   - E.score=5 > 3，不能继续前进，停在B
   
3. **Level 0**: 继续从B开始
   - C.score=3 <= 3（条件中是<=），可以前进，rank += 1，移动到C
   - 检查C是否就是目标（C.score=3且ele匹配），找到目标，返回rank=2

**核心原理**：
- `rank` 累计已经跨越的节点数量
- 在每一层从当前位置继续向前查找，直到找不到满足条件的节点
- 当找到目标节点时，当前的rank就是该节点的排名

### 查找某个排名的值

```c
zskiplistNode *zslGetElementByRankFromNode(zskiplistNode *start_node, int start_level, unsigned long rank) {
    zskiplistNode *x;
    unsigned long traversed = 0;
    int i;

    x = start_node;
    for (i = start_level; i >= 0; i--) {
        while (x->level[i].forward && (traversed + x->level[i].span) <= rank)
        {
            traversed += x->level[i].span;
            x = x->level[i].forward;
        }
        if (traversed == rank) {
            return x;
        }
    }
    return NULL;
}

zskiplistNode *zslGetElementByRank(zskiplist *zsl, unsigned long rank) {
    return zslGetElementByRankFromNode(zsl->header, zsl->level - 1, rank);
}
```

**查找排名过程详解**：

使用之前构建的跳表结构查找排名为3的节点（即节点D）：
```
Level 2: [HEADER] -----------------> [E] -> NULL    (HEADER的span=4)
Level 1: [HEADER] -> [B] -----------> [E] -> NULL    (HEADER的span=1, B的span=3)
Level 0: [HEADER] -> [B] -> [C] -> [D] -> [E] -> NULL (各span都=1)
```

**查找过程**：
1. **Level 2**: 从HEADER开始，traversed=0
   - HEADER->level[2].span = 4，traversed + 4 = 4 > 3，不能前进
   
2. **Level 1**: 继续从HEADER开始
   - HEADER->level[1].span = 1，traversed + 1 = 1 <= 3，前进到B，traversed = 1
   - B->level[1].span = 3，traversed + 3 = 4 > 3，不能继续前进
   
3. **Level 0**: 继续从B开始
   - B->level[0].span = 1，traversed + 1 = 2 <= 3，前进到C，traversed = 2
   - C->level[0].span = 1，traversed + 1 = 3 <= 3，前进到D，traversed = 3
   - traversed == rank(3)，找到目标节点D

**核心原理**：
- `traversed` 累计已经跨越的节点数量
- 在每一层找到最远可达的位置，但不超过目标排名
- 当 `traversed == rank` 时，当前节点就是目标节点

