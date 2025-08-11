在Java当中，迭代器可以很随便的使用，比如说使用`next()`、`hasNext()`方法，不需要任何顾虑。

但是在Rust当中，迭代器是有多种类型的。
这个情况的产生原因也是和Rust的所有权相关。
对迭代器元素的使用和具体的变量相关一样，也要分为不可变引用迭代器、可变引用迭代器和所有权迭代器。
和Java不同的是，当我们使用迭代器的时候我们需要思考到底我们需要的是一个不可变引用，一个可变引用，还是对应变量的整个所有权。

## 迭代器trait

```rust
pub trait Iterator {
    type Item;

    fn next(&mut self) -> Option<Self::Item>;

    // 此处省略了方法的默认实现
}
```

`Item`是迭代器的元素类型，`next()`方法返回一个`Option`类型的值，表示下一个元素，如果没有更多元素，则返回`None`。

## 不可变引用迭代器

我们可以使用`iter()`方法来获取一个不可变引用的迭代器，这个迭代器会返回对集合中元素的不可变引用。

```rust
fn iterator_test(){
    let a = vec![1,2,3,4,5];
    let b = a.iter();
    for num in b{
        println!("Number: {}", num);
    }
    
    a.get(0).map(|x| println!("First element: {}", x));
}
```

通过这个方式我们可以获取`b`这一个不可变引用的迭代器，它是一个`&i32`类型的迭代器，我们在迭代器当中打印完所有的值后，仍然可以获取里面的变量，因为不可变引用的特性。
在最后这里做了一个闭包处理，会在日后的文章中做对应的讲解。

## 可变引用迭代器

我们可以使用`iter_mut()`方法来获取一个可变引用的迭代器，这个迭代器会返回对集合中元素的可变引用。

```rust
fn iterator_change(){
    let mut a = vec![1,2,3,4,5];
    let mut b = a.iter_mut();
    for num in b{
        *num *=2;
    }
    a.get(0).map(|x| println!("First element: {}", x));
}
```

通过这个方法我们拿到`num`这个`&mut i32`类型的迭代器，通过`*`解引用可以修改迭代器中的元素。
在迭代器结束后，我们仍然可以拿到迭代器的元素。这是因为全程我们使用的都是可变引用，理应可以修改值而不夺取所有权。

## 所有权迭代器

所有权迭代器的使用方法就比较多了，我们可以使用`into_iter()`方法来获取一个所有权迭代器，这个迭代器会返回集合中元素的所有权。

比如说下面这段代码，我们求和打印。

```rust
fn iterator_consume(){
    let a = vec![1,2,3,4,5];
    let mut sum: i32 = 0;
    
    for num in a.into_iter(){
        sum += num;
    }
    println!("Sum of elements: {}", sum);
    // a.get(0).map(|x| println!("First element: {}", x));
}
```

无法再获取到原来的vector `a`，因为使用了`into_iter()`，这会消耗掉原有的vector。整个`a`都变得不可用了。
`a.into_iter()`会直接消耗掉整个`a`变量，变成一个迭代器，迭代器的元素类型是`i32`，而不是`&i32`或者`&mut i32`。不关心到底我迭代了几个，只要使用了`into_iter()`，整个`a`就完全消失了。

## 迭代器的链式调用

与Java的流式操作类似，Rust的迭代器支持链式调用，这意味着你可以使用函数式编程的风格来处理对应的数据。

### map方法

```rust
fn iterator_map(){
    let a = vec![1,2,3,4,5];
    let b: Vec<_> = a.iter().map(|&x| x * 2).collect();
    println!("Doubled numbers: {:?}", b);
}
```

通过`map()`中的闭包，我们可以对每一个元素进行处理，最后通过`collect()`方法将迭代器转换为一个新的集合。

### filter方法

```rust
fn iterator_filter(){
    let a = vec![1,2,3,4,5];
    let b: Vec<_> = a.iter().filter(|&&x| x % 2 == 0).collect();
    println!("Even numbers: {:?}", b);
}
```

通过`filter()`中的闭包，我们可以筛选出符合条件的元素，最后通过`collect()`方法将迭代器转换为一个新的集合。

### find方法

```rust
fn iterator_find(){
    let a = vec![10,20,30,40];
    let first_bigger_than_25 = a.iter().find(|&&num| num > 25);
    if let Some(num) = first_bigger_than_25 {
        println!("The first number which is bigger than 25 is {}", num);
        // num 这里是&i32
    } else {
        println!("No number bigger than 25 found");
    }
}
```

这里需要注意的是，比如说在上面的代码当中，我们闭包当中的是`&&i32`，为什么？
首先通过`iter()`我们获得到了一个`&i32`类型，通过`find()`方法，变成了`&&i32`，这里这个写法会直接解两次引用，直接用解完引用的`i32`和`25`进行比较。

```rust
let first_over_25 = a.iter().find(|x| **x > 25);
```

上面这种写法和我们上面代码块中的写法是等价的。只不过看起来丑了一点。