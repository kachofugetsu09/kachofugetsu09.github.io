@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM 新建文章脚本 (Windows版本)
REM 使用方法: new-article.bat <分类> <文章标题>
REM 例如: new-article.bat tech "JavaScript学习笔记"

if "%~1"=="" goto :show_help
if "%~1"=="-h" goto :show_help
if "%~1"=="--help" goto :show_help
if "%~2"=="" goto :show_help

set "CATEGORY=%~1"
set "TITLE=%~2"

REM 验证分类
if not "%CATEGORY%"=="tech" if not "%CATEGORY%"=="interview" (
    echo [91m错误: 分类必须是 'tech' 或 'interview'[0m
    exit /b 1
)

REM 生成文件名（添加当前日期）
for /f "tokens=1-3 delims=/- " %%a in ('date /t') do (
    set "CURRENT_DATE=%%c.%%a.%%b"
)
set "FILENAME=%TITLE% %CURRENT_DATE%.md"
set "FILEPATH=%CATEGORY%\%FILENAME%"

REM 检查文件是否已存在
if exist "%FILEPATH%" (
    echo [93m警告: 文件已存在: %FILEPATH%[0m
    set /p "REPLY=是否覆盖? (y/N): "
    if /i not "!REPLY!"=="y" (
        echo [94m操作已取消[0m
        exit /b 0
    )
)

REM 创建分类目录（如果不存在）
if not exist "%CATEGORY%" mkdir "%CATEGORY%"

REM 获取当前时间
for /f "tokens=1-2 delims= " %%a in ('time /t') do set "CURRENT_TIME=%%a"

REM 生成文章模板
(
echo # %TITLE%
echo.
echo ^> 创建时间: %DATE% %CURRENT_TIME%
echo ^> 分类: %CATEGORY%
echo.
echo ## 概述
echo.
echo 在这里写文章概述...
echo.
echo ## 内容
echo.
echo ### 主要内容
echo.
echo 在这里开始写你的文章内容...
echo.
echo ### 代码示例
echo.
echo ```javascript
echo // 示例代码
echo console.log('Hello, World!'^);
echo ```
echo.
echo ### 重点总结
echo.
echo - 重点1
echo - 重点2
echo - 重点3
echo.
echo ## 参考资料
echo.
echo - [参考链接1](https://example.com^)
echo - [参考链接2](https://example.com^)
echo.
echo ---
echo.
echo *最后更新: %DATE%*
) > "%FILEPATH%"

echo [92m✅ 文章创建成功![0m
echo 文件路径: [94m%FILEPATH%[0m
echo.

REM 询问是否重新构建
set /p "REPLY=是否立即重新构建网站配置? (y/N): "
if /i "!REPLY!"=="y" (
    echo [93m正在重新构建...[0m
    node build.js
    if !errorlevel! equ 0 (
        echo [92m✅ 构建完成![0m
        echo.
        echo [94m下一步操作:[0m
        echo 1. 编辑文章内容: %FILEPATH%
        echo 2. 提交到Git: git add . ^&^& git commit -m "Add: %TITLE%"
        echo 3. 推送到GitHub: git push
    ) else (
        echo [91m❌ 构建失败，请检查错误信息[0m
        exit /b 1
    )
) else (
    echo [93m提醒: 记得在完成文章后运行 'node build.js' 重新构建配置[0m
)

REM 询问是否打开编辑器
where code >nul 2>nul
if !errorlevel! equ 0 (
    set /p "REPLY=是否用VS Code打开文章进行编辑? (y/N): "
    if /i "!REPLY!"=="y" (
        code "%FILEPATH%"
    )
)

exit /b 0

:show_help
echo [94m博客文章创建工具[0m
echo.
echo 使用方法:
echo   new-article.bat ^<分类^> ^<文章标题^>
echo.
echo 参数说明:
echo   分类      : tech 或 interview
echo   文章标题  : 文章的标题（建议用英文或拼音）
echo.
echo 示例:
echo   new-article.bat tech "JavaScript学习笔记"
echo   new-article.bat interview "面试题总结"
echo.
echo 选项:
echo   -h, --help    显示此帮助信息
exit /b 0
