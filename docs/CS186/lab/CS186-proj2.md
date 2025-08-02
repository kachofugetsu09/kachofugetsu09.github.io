# CS186 Project 2 实现指南

这篇文章是对于CS186的proj2的总结和实现思路。

## Task 1: `LeafNode::fromBytes`
在这个任务中，我们需要实现`LeafNode::fromBytes`函数，这个函数就是一个反序列化，我们只需要参考`LeafNode::toBytes`的实现即可。我们需要从字节数组中读取数据，并将其转换为`LeafNode`对象。

首先我们分析一下`LeafNode::toBytes`的实现，它将`LeafNode`对象的各个字段转换为字节数组。
```java
@Override
    public byte[] toBytes() {
        // All sizes are in bytes.
        int isLeafSize = 1;
        int siblingSize = Long.BYTES;
        int lenSize = Integer.BYTES;
        int keySize = metadata.getKeySchema().getSizeInBytes();
        int ridSize = RecordId.getSizeInBytes();
        int entriesSize = (keySize + ridSize) * keys.size();
        int size = isLeafSize + siblingSize + lenSize + entriesSize;

        ByteBuffer buf = ByteBuffer.allocate(size);
        buf.put((byte) 1);
        buf.putLong(rightSibling.orElse(-1L));
        buf.putInt(keys.size());
        for (int i = 0; i < keys.size(); ++i) {
            buf.put(keys.get(i).toBytes());
            buf.put(rids.get(i).toBytes());
        }
        return buf.array();
    }
```
我们来看核心实现部分，首先他会记录一个int 看是否是叶子节点，然后是右兄弟节点的Long值，接着是当前节点存的keys的数量，然后是一个循环输入，
他会循环输入每一个key和他对应的recordID。
我们所需要做的就是一个反向操作，先读取一个字节看是否是叶子节点，然后读取右兄弟节点的Long值，接着读取keys的熟练个，然后一个一个读出来就好了。


以下是我们要完成的函数的签名
```java
public static LeafNode fromBytes(BPlusTreeMetadata metadata, BufferManager bufferManager,
                                     LockContext treeContext, long pageNum) 
```
这是我们最后要返回的LeafNode的对应构造方法。
```java
private LeafNode(BPlusTreeMetadata metadata, BufferManager bufferManager, Page page,
                     List<DataBox> keys,
                     List<RecordId> rids, Optional<Long> rightSibling, LockContext treeContext) {
    }
```

可以看到传入的值没有page,没有keys 没有rids 没有rightsibling。
而传入的值里面的pageNum不再LeafNode的构造方法里面，我们看看有没有办法获得Page。
发现可以用bufferManager的`fetchPage`方法来获取Page。
而Page当中有对应的buffer,我们直接从这个Page当中获取。
然后按照以下步骤进行读取
1. 先读取一个字节 叶子节点标志位
2. 读取右兄弟节点的Long值
3. 读取key的数量
4. 循环读取key和对应的record弄到一个列表里
5. 构建LeafNode对象并返回

以下为实现
```java
public static LeafNode fromBytes(BPlusTreeMetadata metadata, BufferManager bufferManager,
                                     LockContext treeContext, long pageNum) {
        Page page = bufferManager.fetchPage(treeContext, pageNum);
        Buffer buf = page.getBuffer();
        buf.get(); //isLeaf
        long sibling = buf.getLong();
        Optional<Long> rightSibling = sibling == -1L? Optional.empty() : Optional.of(sibling);
        int n = buf.getInt();

        List<DataBox> keys = new ArrayList<>();
        List<RecordId> rids = new ArrayList<>();

        for (int i = 0; i < n; ++i) {
            keys.add(DataBox.fromBytes(buf, metadata.getKeySchema()));
            rids.add(RecordId.fromBytes(buf));
        }

        LeafNode leafNode = new LeafNode(metadata,
                bufferManager,page,
                keys,rids,rightSibling, treeContext);

        return leafNode;
    }
```
这里可能需要讲以下`Optional`的用法，`Optional`是一个容器对象，它可以包含一个非空值或者为空。
我们在这里使用它来表示右兄弟节点可能不存在的情况。
可以理解为`Optional<Long>`是一个可能包含`Long`值的容器，如果没有右兄弟节点，则它为空。

做一下测试,
> 1测试已通过 总计1个测试，33毫秒。

以上，最简单的`Task1`实现。

---

## Task 2: `get`, `getLeftmostLeaf`, `put`, `remove`
这是本proj中最为困难的部分。
要求是在`LeaftNode`,`InnerNode`和`BPlusTree`中实现这些方法。
其中`getLeftmostLeaf`只需要`LeafNode`和`InnerNode`实现即可。

首先我们来理解以下这三者的关系

BPlusNode就是B+树上的节点，他是一个抽象类，
而LeaftNode分别代表了两种不同的情况，一个是最底部存着Record的叶子节点，另一个是存着指向其他节点的InnerNode。

首先我们来实现最简单的部分，也就是`getLeftmostLeaf`方法。

对于叶子节点来说，`getLeftmostLeaf`方法就是返回自己，因为自己就是最左边的叶子节点，所以直接返回`this`即可。
而对于innerNode来说，`getLeftmostLeaf`方法需要递归地找到最左边的叶子节点。找到child当中的0,然后继续执行`child.getLeftmostLeaf()`即可。
```java
public LeafNode getLeftmostLeaf() {
        assert(!children.isEmpty());
        BPlusNode leftmostChild = getChild(0);
        return leftmostChild.getLeftmostLeaf();
    }
```

接着，我们来实现`get`方法。
在innerNode当中，我们首先通过`numLessThanEqual`方法找到第一个小于等于key的child，
然后递归调用。
这里为什么是`numLessThanEqual`而不是`numLessThan`呢？
根据B+树的语义：key >= keys[i] 的数据应该去 children[i+1]，所以我们需要找到有多少个key <= 当前查找的key。

以下为代码实现
```java

public LeafNode get(DataBox key) {
        assert (key != null);

        
        int i = numLessThanEqual(key, keys);
        
        // 获取子节点
        long childPageNum = children.get(i);
        BPlusNode childNode = BPlusNode.fromBytes(metadata, bufferManager, treeContext, childPageNum);
        
        // 递归调用
        return childNode.get(key);
    }
```
接着，对于叶子节点来说，`get`方法无论查找什么值都是在返回他自己 所以直接return`this`即可。
然后我们去BPlusTree当中实现提供给外部的`get`方法。
```java
 public Optional<RecordId> get(DataBox key) {
        typecheck(key);
        // TODO(proj4_integration): Update the following line
        LockUtil.ensureSufficientLockHeld(lockContext, LockType.NL);

        LeafNode leafNode = root.get(key);
        return leafNode.getKey(key);
    }
```

首先我们通过innerNode的get找到对应的叶子节点，然后在叶子节点上调用`getKey`方法来获取对应的RecordId。

以上get完成。

接下来我们实现最难的部分，也就是`put`方法。

接下来我们需要好好想一想`put`方法的逻辑。
其实就是
1. 首先找到插入的位置
2. 插入key和record的集合当中
3. 判断是否需要分裂
4. 如果不需要分裂，直接返回
5. 如果需要分裂，进行分裂，生成新的右节点的keys和rids，
6. 截断当前溢出节点的keys和rids，创建一个新的右节点，指向新的右节点。（sync当前更改）

BPlusNode当中的注释写道：
如果插入键值对 $(k, r)$ 不会导致节点 $n$ 溢出，则返回 `Optional.empty()`。

如果插入键值对 $(k, r)$ 导致节点 $n$ 溢出，则 $n$ 会被分裂成左右两个节点，并返回一个键值对 $(split\_key, right\_node\_page\_num)$。其中 $right\_node\_page\_num$ 是新创建的右节点的页号，而 $split\_key$ 的值取决于 $n$ 是内部节点还是叶子节点。

我们按照这个规则实现以下叶子节点
```java
@Override
    public Optional<Pair<DataBox, Long>> put(DataBox key, RecordId rid) {
        assert (key != null);
        assert (rid != null);
        
        // 检查key是否已经存在
        int existingIndex = keys.indexOf(key);
        if (existingIndex != -1) {
            throw new BPlusTreeException("Duplicate key: " + key);
        }
        
        // 找到插入位置：第一个大于key的位置
        int insertIndex = InnerNode.numLessThan(key, keys);
        
        // 插入新的(key, rid)对
        keys.add(insertIndex, key);
        rids.add(insertIndex, rid);
        

        
        // 检查是否需要分裂
        if (keys.size() <= 2 * metadata.getOrder()) {
            // 没有溢出，不需要分裂
            sync();
            return Optional.empty();
        }
        
        // 需要分裂，左节点保留前d个entry，右节点包含后d+1个entry
        int d = metadata.getOrder();
        
        // 创建右节点的keys和rids
        List<DataBox> rightKeys = new ArrayList<>(keys.subList(d, keys.size()));
        List<RecordId> rightRids = new ArrayList<>(rids.subList(d, rids.size()));
        
        // 更新左节点（当前节点）的keys和rids
        keys = new ArrayList<>(keys.subList(0, d));
        rids = new ArrayList<>(rids.subList(0, d));
        
        // 创建新的右节点，右节点的rightSibling是当前节点的rightSibling
        LeafNode rightNode = new LeafNode(metadata, bufferManager, rightKeys, rightRids, rightSibling, treeContext);
        
        // 更新当前节点的rightSibling指向新的右节点
        rightSibling = Optional.of(rightNode.getPage().getPageNum());
        
        // 同步当前节点的更改
        sync();
        
        // 返回分裂key（右节点的第一个key）和右节点的页号
        DataBox splitKey = rightKeys.get(0);
        return Optional.of(new Pair<>(splitKey, rightNode.getPage().getPageNum()));
    }
```
对于innerNode,它本身就是一个需要递归的节点,虽然逻辑是类似的,但是实现要更为复杂一点.
步骤首先是
1. 找到应该插入到哪个子节点
2. 递归调用插入到子节点的`put`方法
3. 检查子节点有没有分裂
4. 如果子节点没有分裂,直接返回
5. 如果子节点分裂了,插入新的child指针.

注意这里的插入位置 key应该插入到i,指针插入到i+1的位置.
原因是对于innerNode来说,结构是 指针 key 指针 key 指针 这个格式 key是一个分隔符,指针指向具体的子节点。

6. 如果插入新的child指针后分裂了,把中间的key推到父节点上,同样创建一个新的右节点,然后更新,sync保存.
```java
    @Override
    public Optional<Pair<DataBox, Long>> put(DataBox key, RecordId rid) {
        assert (key != null);
        
        // 找到应该插入到哪个子节点
        int i = numLessThanEqual(key, keys);
        
        // 递归插入到子节点
        long childPageNum = children.get(i);
        BPlusNode childNode = BPlusNode.fromBytes(metadata, bufferManager, treeContext, childPageNum);
        Optional<Pair<DataBox, Long>> splitResult = childNode.put(key, rid);
        
        // 如果子节点没有分裂，则不需要更新当前节点
        if (!splitResult.isPresent()) {
            return Optional.empty();
        }
        
        // 子节点分裂了，需要插入新的key和child pointer
        DataBox newKeyFromChild = splitResult.get().getFirst();
        long newChildPageNum = splitResult.get().getSecond();

        // 插入分裂产生的新key到keys数组的位置i
        // 这个key将作为原子节点和新分裂节点之间的分界线
        keys.add(i, newKeyFromChild);
        
        // 插入新分裂出来的子节点到children数组的位置i+1
        // 因为children数组比keys数组多一个元素，新的子节点应该插在原子节点的右边
        children.add(i + 1, newChildPageNum);
        
        // 检查当前节点是否需要分裂
        if (keys.size() <= 2 * metadata.getOrder()) {
            // 当前节点没有溢出，不需要分裂
            sync();
            return Optional.empty();
        }
        
        // 当前节点溢出，需要分裂
        // 对于内部节点：前d个key留在左节点，后d个key移到右节点，中间的key上升
        int d = metadata.getOrder();
        
        // 中间的key将被推到父节点
        DataBox splitKey = keys.get(d);
        
        // 创建右节点的keys和children
        List<DataBox> rightKeys = new ArrayList<>(keys.subList(d + 1, keys.size()));
        List<Long> rightChildren = new ArrayList<>(children.subList(d + 1, children.size()));
        
        // 更新左节点（当前节点）的keys和children
        keys = new ArrayList<>(keys.subList(0, d));
        children = new ArrayList<>(children.subList(0, d + 1));
        
        // 创建新的右节点
        InnerNode rightNode = new InnerNode(metadata, bufferManager, rightKeys, rightChildren, treeContext);
        
        sync();
        
        // 返回分裂key和右节点的页号
        return Optional.of(new Pair<>(splitKey, rightNode.getPage().getPageNum()));
    }

```
对于BPlusTree来说,可以拿到底下的innerNode有没有分裂,如果分裂了,那么就创建一个新的根节点,用updateRoot方式更新根节点.
```java
public void put(DataBox key, RecordId rid) {
        typecheck(key);
        // TODO(proj4_integration): Update the following line
        LockUtil.ensureSufficientLockHeld(lockContext, LockType.NL);

        
        Optional<Pair<DataBox, Long>> splitResult = root.put(key, rid);
        
        // 如果根节点分裂了，需要创建新的根节点
        if (splitResult.isPresent()) {
            DataBox splitKey = splitResult.get().getFirst();
            long newChildPageNum = splitResult.get().getSecond();
            
            // 创建新的根节点，包含原根节点和新分裂出的节点
            List<DataBox> newRootKeys = new ArrayList<>();
            newRootKeys.add(splitKey);
            
            List<Long> newRootChildren = new ArrayList<>();
            newRootChildren.add(root.getPage().getPageNum());
            newRootChildren.add(newChildPageNum);
             // 使用updateRoot方法更新根节点
            updateRoot(new InnerNode(metadata, bufferManager, newRootKeys, newRootChildren, lockContext));
        }
    }
```

这样最难的get方法就完成了。

最后我们来完成remove方法，在这个实现当中remove是惰性删除的，也就是说他不会强制去合并满足到达一半的要求。节省了不少时间。

remove要求：
`n.remove(k)` 会从以 `n` 为根的子树中删除键 `k` 及其对应的记录 ID；如果键 `k` 不在该子树中，则不执行任何操作。
**删除操作不应重新平衡树。** 简单地删除键及其对应的记录 ID 即可。例如，对上述示例树运行 `inner.remove(2)` 将生成以下树。

BPlsuTree 当中直接写 `root.remove(key)`即可。

在InnerNode里面我们递归查找要删除的位置然后递归调用。
```java
 @Override
    public void remove(DataBox key) {
        // TODO(proj2): implement
        assert(key != null);

        long childPageNum = children.get(numLessThanEqual(key, keys));
        BPlusNode childNode = BPlusNode.fromBytes(metadata, bufferManager, treeContext, childPageNum);
        childNode.remove(key);

        sync();

        return;
    }
```

最后在LeafNode里面我们直接删除就行。
```java
    @Override
    public void remove(DataBox key) {
        assert(key != null);

        int existingIndex = keys.indexOf(key);
        if (existingIndex == -1) {
            throw new BPlusTreeException("Key not found: " + key);
        }
        keys.remove(existingIndex);
        rids.remove(existingIndex);
        sync();


        return;
    }
```

就此 Task2完成，但是这里我们不能直接测试，因为是过不了的，完成Task3的测试我们才可以过。

---

## Task 3: Scans

我们最终目的是完成`scanAll`和`scanGreaterEqual`方法。
在这个过程中我们要先完成迭代器，`BPlusTreeIterator`。

其实这个迭代器很好想，我们想一下叶子节点的结构就知道了，他就是右边是兄弟节点，然后自己里面存了几个值。
我们的逻辑就是，当迭代完了自己里面的值，迭代兄弟节点的值。

因此里面只需要存当前节点，在当前节点遍历了的数量
```java
private class BPlusTreeIterator implements Iterator<RecordId> {
        private LeafNode currentNode;
        private int currentIndex;

        public BPlusTreeIterator(LeafNode startNode, int startIndex) 
            this.currentNode = startNode;
            this.currentIndex = startIndex;
        } 

        @Override
        public boolean hasNext() {
            // 如果当前节点还有更多记录
            if (currentNode != null && currentIndex < currentNode.getRids().size()) {
                return true;
            }
            
            // 如果当前节点没有更多记录，检查是否有右兄弟节点
            if (currentNode != null && currentNode.getRightSibling().isPresent()) {
                return true;
            }
            
            return false;
        }

        @Override
        public RecordId next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            
            // 如果当前节点还有记录，返回当前记录
            if (currentIndex < currentNode.getRids().size()) {
                return currentNode.getRids().get(currentIndex++);
            }
            
            // 移动到右兄弟节点
            if (currentNode.getRightSibling().isPresent()) {
                currentNode = currentNode.getRightSibling().get();
                currentIndex = 0;
                return currentNode.getRids().get(currentIndex++);
            }
            
            throw new NoSuchElementException();
        }
    }
```

scanAll方法就是返回一个迭代器，指向最左边的叶子节点
那我们直接getLeftmostLeaf即可。
```java
public Iterator<RecordId> scanAll() {
        // TODO(proj4_integration): Update the following line
        LockUtil.ensureSufficientLockHeld(lockContext, LockType.NL);

        LeafNode leftmostLeaf = root.getLeftmostLeaf();
        if(leftmostLeaf != null && !leftmostLeaf.getKeys().isEmpty()){
            return new BPlusTreeIterator(leftmostLeaf, 0);
        }

        return Collections.emptyIterator();
    }
```

对应的，scanGreaterEqual方法需要找到第一个大于等于key的叶子节点，然后返回一个迭代器。
```java
   public Iterator<RecordId> scanGreaterEqual(DataBox key) {
        typecheck(key);
        // TODO(proj4_integration): Update the following line
        LockUtil.ensureSufficientLockHeld(lockContext, LockType.NL);

        LeafNode leafNode = root.get(key);
        if(leafNode != null){
            int index = leafNode.getKeys().size(); // 默认设为末尾，表示没找到
            for(int i = 0; i < leafNode.getKeys().size(); i++){
                if(leafNode.getKeys().get(i).compareTo(key) >= 0){
                    index = i;
                    break;
                }
            }
            
            // 如果在当前叶子节点中没找到 >= key 的值，需要移动到下一个叶子节点
            if(index == leafNode.getKeys().size()) {
                if(leafNode.getRightSibling().isPresent()) {
                    return new BPlusTreeIterator(leafNode.getRightSibling().get(), 0);
                } else {
                    return Collections.emptyIterator();
                }
            }
            
            return new BPlusTreeIterator(leafNode, index);
        }

        return Collections.emptyIterator();
    }
```

---

## Task 4: Bulk Load
与任务2中的方法类似，你需要在 `LeafNode`、`InnerNode` 和 `BPlusTree` 三个类中实现 `bulkLoad` 方法。由于批量加载是一个修改操作，你需要调用 `sync()` 方法。请务必仔细阅读 `BPlusNode::bulkLoad` 中的说明，以确保正确地分裂节点。

那我们就听话，先去看`BPlusNode::bulkLoad`的说明。
> n.bulkLoad(data, fillFactor) 批量加载数据中的键值对 $(k, r)$ 到树中，并使用给定的填充因子。
> 此方法与 n.put 非常相似，但有以下几点不同：
>1. **叶子节点**不会填充到 $2d+1$ 然后分裂，而是填充到比 $fillFactor$ 多一个记录，然后通过创建一个只包含一个记录的右兄弟节点来“分裂”（使原始节点保持所需的填充因子）。
>2. **内部节点**应重复尝试批量加载最右侧的子节点，直到内部节点已满（在这种情况下应进行分裂）或者没有更多数据。
> **fillFactor 仅用于确定叶子节点的填充程度**（不适用于内部节点），并且计算应向上取整，即当 $d=5$ 且 $fillFactor=0.75$ 时，叶子节点应填充 $8/10$。
>测试时，你可以假设 $0 < fillFactor \le 1$；超出此范围的填充因子将导致未定义行为（你可以随意处理这些情况）。


我们来翻一下他的意思，就是对leafnode来说 我们填充到 2d+1 *fillFactor然后向上取整，然后创建一个右节点，这就是leafNode的逻辑。
我们来实现一下。就是对照者翻译一下。
```java
 public Optional<Pair<DataBox, Long>> bulkLoad(Iterator<Pair<DataBox, RecordId>> data,
            float fillFactor) {
        int targetFill = (int) Math.ceil(fillFactor * 2 * metadata.getOrder());
        
        // 先填充当前节点到目标数量
        while (data.hasNext() && keys.size() < targetFill) {
            Pair<DataBox, RecordId> currentData = data.next();
            keys.add(currentData.getFirst());
            rids.add(currentData.getSecond());
        }
        
        // 如果还有数据，说明需要创建右兄弟节点来处理剩余数据
        if (data.hasNext()) {
            // 获取下一个数据项来作为分裂key
            Pair<DataBox, RecordId> nextEntry = data.next();
            DataBox splitKey = nextEntry.getFirst();
            
            // 创建空的右兄弟节点，先添加这一个entry
            List<DataBox> rightKeys = new ArrayList<>();
            List<RecordId> rightRids = new ArrayList<>();
            rightKeys.add(nextEntry.getFirst());
            rightRids.add(nextEntry.getSecond());
            
            // 创建右兄弟节点
            LeafNode rightNode = new LeafNode(metadata, bufferManager, rightKeys, rightRids, rightSibling, treeContext);
            
            // 更新当前节点的右兄弟指针
            rightSibling = Optional.of(rightNode.getPage().getPageNum());
            
            // 同步当前节点
            sync();
            
            // 返回分裂信息：使用第一个entry的key作为分裂key
            return Optional.of(new Pair<>(splitKey, rightNode.getPage().getPageNum()));
        }
        
        // 如果没有剩余数据，同步当前节点并返回空
        sync();
        return Optional.empty();
    }
```

然后对于innerNode来说，就是批量加载最右侧的数据，直到已满，然后要处理一下分裂
```java
public Optional<Pair<DataBox, Long>> bulkLoad(Iterator<Pair<DataBox, RecordId>> data,
            float fillFactor) {
        
        while (data.hasNext()) {
            // 获取最右边的子节点
            int rightmostChildIndex = children.size() - 1;
            long rightmostChildPageNum = children.get(rightmostChildIndex);
            BPlusNode rightmostChild = BPlusNode.fromBytes(metadata, bufferManager, treeContext, rightmostChildPageNum);
            
            // 尝试向最右边的子节点批量加载数据
            Optional<Pair<DataBox, Long>> splitResult = rightmostChild.bulkLoad(data, fillFactor);
            
            // 如果子节点没有分裂，说明数据已经全部加载完毕
            if (!splitResult.isPresent()) {
                break;
            }
            
            // 子节点分裂了，需要将分裂结果添加到当前内部节点
            DataBox splitKey = splitResult.get().getFirst();
            long newChildPageNum = splitResult.get().getSecond();
            
            // 添加新的 key 和 child pointer
            keys.add(splitKey);
            children.add(newChildPageNum);
            
            // 检查当前内部节点是否需要分裂
            if (keys.size() > 2 * metadata.getOrder()) {
                // 当前节点溢出，需要分裂
                int d = metadata.getOrder();
                
                // 中间的key将被推到父节点
                DataBox pushUpKey = keys.get(d);
                
                // 创建右节点的keys和children
                List<DataBox> rightKeys = new ArrayList<>(keys.subList(d + 1, keys.size()));
                List<Long> rightChildren = new ArrayList<>(children.subList(d + 1, children.size()));
                
                // 更新左节点（当前节点）的keys和children
                keys = new ArrayList<>(keys.subList(0, d));
                children = new ArrayList<>(children.subList(0, d + 1));
                
                // 创建新的右节点
                InnerNode rightNode = new InnerNode(metadata, bufferManager, rightKeys, rightChildren, treeContext);
                
                sync();
                
                // 返回分裂信息
                return Optional.of(new Pair<>(pushUpKey, rightNode.getPage().getPageNum()));
            }
        }
        
        // 同步当前节点
        sync();
        return Optional.empty();
    }
```

最后我们实现以下BPlusTree当中的`bulkLoad`方法,注意这个bulkLoad只应该在空树上进行，然后就调用根节点的bulkLoad,看一下要不要创建新的根节点，类似于put方法。
```java
public void bulkLoad(Iterator<Pair<DataBox, RecordId>> data, float fillFactor) {
        // TODO(proj4_integration): Update the following line
        LockUtil.ensureSufficientLockHeld(lockContext, LockType.NL);

        // 检查树是否为空 - bulkLoad 只能在空树上进行
        // 空树的特征是根节点是一个空的叶子节点
        if (!(root instanceof LeafNode) || !((LeafNode) root).getKeys().isEmpty()) {
            throw new BPlusTreeException("bulkLoad can only be called on an empty tree");
        }
        
        // 调用根节点的 bulkLoad 方法，循环直到所有数据都被处理
        while (data.hasNext()) {
            Optional<Pair<DataBox, Long>> splitResult = root.bulkLoad(data, fillFactor);
            
            // 如果根节点分裂了，需要创建新的根节点
            if (splitResult.isPresent()) {
                DataBox splitKey = splitResult.get().getFirst();
                long newChildPageNum = splitResult.get().getSecond();
                
                // 创建新的根节点，包含原根节点和新分裂出的节点
                List<DataBox> newRootKeys = new ArrayList<>();
                newRootKeys.add(splitKey);
                
                List<Long> newRootChildren = new ArrayList<>();
                newRootChildren.add(root.getPage().getPageNum());
                newRootChildren.add(newChildPageNum);
                
                // 使用updateRoot方法更新根节点
                updateRoot(new InnerNode(metadata, bufferManager, newRootKeys, newRootChildren, lockContext));
            }
        }

    }

```

这样我们就完成了总计四个任务。然后我们做一下测试。都在index这个test包下面。
```✔26测试已通过 总计26个测试，749毫秒。```

这个proj的难点在于，我们不应该想太多，对于某一个节点进行某一个方法，他应该只关注自身的行为，而不是调整所有的节点状态，通过返回值的方式让别人进行对应的操作，自己只需要做好自己的本职工作就好。我们只应该关注局部的状态，通过返回值来传递信息，通过递归来进行协作。