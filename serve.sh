#!/bin/bash

# 启动本地开发服务器脚本

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}启动本地开发服务器...${NC}"
echo
echo -e "${YELLOW}请在浏览器中访问: http://localhost:8000${NC}"
echo -e "${YELLOW}按 Ctrl+C 停止服务器${NC}"
echo

# 检查是否安装了Python
if command -v python3 &> /dev/null; then
    echo -e "${GREEN}使用Python3启动服务器...${NC}"
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo -e "${GREEN}使用Python启动服务器...${NC}"
    python -m http.server 8000
# 检查是否安装了Node.js
elif command -v node &> /dev/null; then
    echo -e "${GREEN}使用Node.js启动服务器...${NC}"
    if ! command -v http-server &> /dev/null; then
        echo "正在安装http-server..."
        npm install -g http-server
    fi
    http-server -p 8000
else
    echo -e "${RED}错误: 需要安装Python或Node.js才能启动本地服务器${NC}"
    echo
    echo -e "${BLUE}安装选项:${NC}"
    echo "1. Python: https://www.python.org/downloads/"
    echo "2. Node.js: https://nodejs.org/"
    exit 1
fi
