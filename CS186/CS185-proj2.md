这篇文章是对于CS186的proj2的总结和实现思路。

# Task 1: LeafNode::fromBytes
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
