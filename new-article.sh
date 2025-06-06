#!/bin/bash

# 新建文章脚本
# 使用方法: ./new-article.sh <分类> <文章标题>
# 例如: ./new-article.sh tech "JavaScript学习笔记"

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 帮助信息
show_help() {
    echo -e "${BLUE}博客文章创建工具${NC}"
    echo
    echo "使用方法:"
    echo "  ./new-article.sh <分类> <文章标题>"
    echo
    echo "参数说明:"
    echo "  分类      : tech 或 interview"
    echo "  文章标题  : 文章的标题（建议用英文或拼音）"
    echo
    echo "示例:"
    echo "  ./new-article.sh tech \"JavaScript学习笔记\""
    echo "  ./new-article.sh interview \"面试题总结\""
    echo
    echo "选项:"
    echo "  -h, --help    显示此帮助信息"
}

# 检查参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ $# -eq 0 ]; then
    show_help
    exit 0
fi

if [ $# -ne 2 ]; then
    echo -e "${RED}错误: 参数数量不正确${NC}"
    echo
    show_help
    exit 1
fi

CATEGORY="$1"
TITLE="$2"

# 验证分类
if [ "$CATEGORY" != "tech" ] && [ "$CATEGORY" != "interview" ]; then
    echo -e "${RED}错误: 分类必须是 'tech' 或 'interview'${NC}"
    exit 1
fi

# 生成文件名（添加当前日期）
CURRENT_DATE=$(date +"%Y.%m.%d")
FILENAME="${TITLE} ${CURRENT_DATE}.md"
FILEPATH="${CATEGORY}/${FILENAME}"

# 检查文件是否已存在
if [ -f "$FILEPATH" ]; then
    echo -e "${YELLOW}警告: 文件已存在: $FILEPATH${NC}"
    read -p "是否覆盖? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}操作已取消${NC}"
        exit 0
    fi
fi

# 创建分类目录（如果不存在）
mkdir -p "$CATEGORY"

# 生成文章模板
TEMPLATE="# $TITLE

> 创建时间: $(date '+%Y年%m月%d日 %H:%M:%S')
> 分类: $CATEGORY

## 概述

在这里写文章概述...

## 内容

### 主要内容

在这里开始写你的文章内容...

### 代码示例

\`\`\`javascript
// 示例代码
console.log('Hello, World!');
\`\`\`

### 重点总结

- 重点1
- 重点2
- 重点3

## 参考资料

- [参考链接1](https://example.com)
- [参考链接2](https://example.com)

---

*最后更新: $(date '+%Y年%m月%d日')*
"

# 写入文件
echo "$TEMPLATE" > "$FILEPATH"

echo -e "${GREEN}✅ 文章创建成功!${NC}"
echo -e "文件路径: ${BLUE}$FILEPATH${NC}"
echo

# 询问是否重新构建
read -p "是否立即重新构建网站配置? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}正在重新构建...${NC}"
    if node build.js; then
        echo -e "${GREEN}✅ 构建完成!${NC}"
        echo
        echo -e "${BLUE}下一步操作:${NC}"
        echo "1. 编辑文章内容: $FILEPATH"
        echo "2. 提交到Git: git add . && git commit -m \"Add: $TITLE\""
        echo "3. 推送到GitHub: git push"
    else
        echo -e "${RED}❌ 构建失败，请检查错误信息${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}提醒: 记得在完成文章后运行 'node build.js' 重新构建配置${NC}"
fi

# 询问是否打开编辑器
if command -v code &> /dev/null; then
    read -p "是否用VS Code打开文章进行编辑? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        code "$FILEPATH"
    fi
fi
