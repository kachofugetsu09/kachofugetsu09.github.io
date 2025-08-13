# Rust 当中的闭包

闭包是一个 Java 当中没有的内容。它是一种匿名函数，可以捕获自己所在定义域当中的变量而不传入这个变量。
在java当中方法当中的方法也可以捕捉外部的变量，但是是有代价的，就是这个捕捉的变量需要是一个有效final。


### 修改值的闭包情况

```rust
fn main() {
    work(26);
}

fn work(plan: u32) {
    let mut num_of_water_cups = 1; 

    let mut drink_water = move |num: u32| {
        num_of_water_cups += num;
        num_of_water_cups 
    };

    if plan < 25 {
        println!("plan<25");
    } else {
        println!("plan>=25");

        // 第一次调用闭包
        let r1 = drink_water(3);
        println!("After first drinking, num_of_water_cups is: {}", r1);

        // 第二次调用闭包
        let r2 = drink_water(2);
        println!("After second drinking, num_of_water_cups is: {}", r2);
        
        // println!(num_of_water_cups);
    }
}
```

运行后结果是：

```
plan>=25
After first drinking, num_of_water_cups is: 4
After second drinking, num_of_water_cups is: 6
```

添加了 `move` 后，会把 `num_of_water_cups` 这个变量的所有权放入到这个小闭包当中了，也就是说在外部我们已经不能访问它了。我们可以通过在闭包当中返回这个变量，来实时获取这个变量当前结果。

第一次，我们加入了 3，然后在闭包当中的这个变量 1 + 3 变成了 4。
第二次我们再加入 2，从刚才的 4 再加 2，变成了 6。

这个变量被保存在了闭包的定义域当中，从大作用域进入了小作用域，我们可以通过在闭包当中返回它的值的方式来获取它的实时情况。

## 不修改值的闭包情况

```rust
fn main() {
    work(26);
}

fn work(plan: u32) {
    let num_of_water_cups = 1; 

    let drink_water = |num: u32| {
        println!("num_of_water_cups ={} in closure and num is {}", num_of_water_cups, num);
        num
    };

    if plan < 25 {
        println!("plan<25");
    } else {
        println!("plan>=25");
        drink_water(3);
        drink_water(4);
        println!("{}", num_of_water_cups);
    }
}
```

在这个情境下得到的输出结果是：

```
plan>=25
num_of_water_cups =1 in closure and num is 3
num_of_water_cups =1 in closure and num is 4
1
```

可以看到在闭包当中我们是没有传入 `num_of_water_cups` 这个变量的，但是通过闭包可以捕获外部也就是闭包所在定义域变量的特性，在闭包内部成功打印了外部的 `num_of_water_cups` 这个变量。

## 闭包的三种 Trait：Fn、FnMut 和 FnOnce

这两种不同的闭包行为，在 Rust 的类型系统里分别对应三个特殊的 trait：

### Fn trait

对应上面的第二个例子。闭包只对捕获的变量进行不可变借用（`&`）。它可以在任何地方被多次调用。上面的第二个闭包实现了 `Fn` trait。

```rust
fn main() {
    let x = 5;
    
    // 这个闭包实现了 Fn trait
    let closure = |y| x + y;
    
    // 可以多次调用
    println!("{}", closure(1)); // 6
    println!("{}", closure(2)); // 7
    
    // x 仍然可以在外部访问
    println!("x is still: {}", x); // 5
}
```

### FnMut trait

对应第一个例子中没有 `move` 的情况。闭包对捕获的变量进行可变借用（`&mut`）。它能修改外部变量，但由于借用规则，必须将闭包本身声明为 `mut`，并且不能有其他的借用同时存在。

```rust
fn main() {
    let mut x = 5;
    
    // 这个闭包实现了 FnMut trait
    let mut closure = |y| {
        x += y;
        x
    };
    
    println!("{}", closure(1)); // 6
    println!("{}", closure(2)); // 8
    
    // x 在闭包调用完成后仍然可以访问
    println!("x is now: {}", x); // 8
}
```

### FnOnce trait

对应第一个例子中有 `move` 的情况。闭包会获取捕获变量的所有权，因此只能被调用一次。上面的第一个 `move` 闭包实现了 `FnOnce` trait。

虽然上面的例子中多次调用了它，那是因为 `u32` 实现了 `Copy` trait，所以每次 `move` 过去的是一个拷贝，而不是所有权转移。如果捕获的是一个 `String`，那么闭包就真的只能被调用一次了：

```rust
fn main() {
    let s = String::from("hello");
    
    // 这个闭包实现了 FnOnce trait（因为 String 没有实现 Copy）
    let closure = move |suffix: &str| {
        format!("{} {}", s, suffix) // s 的所有权被移动到闭包中
    };
    
    println!("{}", closure("world")); // "hello world"
    
    // 下面这行会编译错误，因为闭包只能调用一次
    // println!("{}", closure("rust"));
    
    // s 在外部也不能再访问了
    // println!("{}", s); // 编译错误
}
```
