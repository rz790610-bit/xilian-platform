@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
:: 西联智能平台 - 一键部署脚本 (Windows)
:: XiLian Intelligent Platform - One-Click Deploy Script
:: ============================================================

:: 设置颜色
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

:: 打印横幅
echo.
echo %BLUE%╔══════════════════════════════════════════════════════════════╗%NC%
echo %BLUE%║                                                              ║%NC%
echo %BLUE%║           西联智能平台 - 本地化一键部署                      ║%NC%
echo %BLUE%║       XiLian Intelligent Platform - Local Deployment         ║%NC%
echo %BLUE%║                                                              ║%NC%
echo %BLUE%╚══════════════════════════════════════════════════════════════╝%NC%
echo.

:: 获取脚本目录
set "SCRIPT_DIR=%~dp0"
set "DEPLOY_DIR=%SCRIPT_DIR%.."
set "DOCKER_DIR=%DEPLOY_DIR%\docker"
set "CONFIG_DIR=%DEPLOY_DIR%\config"

:: 处理命令参数
if "%1"=="" goto :deploy
if "%1"=="deploy" goto :deploy
if "%1"=="start" goto :start
if "%1"=="stop" goto :stop
if "%1"=="restart" goto :restart
if "%1"=="status" goto :status
if "%1"=="logs" goto :logs
if "%1"=="cleanup" goto :cleanup
if "%1"=="help" goto :help
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help

echo %RED%[ERROR]%NC% 未知命令: %1
goto :help

:check_docker
echo %BLUE%[INFO]%NC% 检查系统依赖...

:: 检查 Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Docker 未安装，请先安装 Docker Desktop
    echo %BLUE%[INFO]%NC% 下载地址: https://www.docker.com/products/docker-desktop
    exit /b 1
)
for /f "tokens=*" %%i in ('docker --version') do echo %GREEN%[SUCCESS]%NC% Docker 已安装: %%i

:: 检查 Docker Compose
docker compose version >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Docker Compose 未安装
    exit /b 1
)
for /f "tokens=*" %%i in ('docker compose version --short') do echo %GREEN%[SUCCESS]%NC% Docker Compose 已安装: %%i

:: 检查 Docker 服务
docker info >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Docker 服务未运行，请启动 Docker Desktop
    exit /b 1
)
echo %GREEN%[SUCCESS]%NC% Docker 服务运行正常
exit /b 0

:init_config
echo %BLUE%[INFO]%NC% 初始化配置文件...

:: 检查配置文件
if not exist "%CONFIG_DIR%\.env" (
    if exist "%CONFIG_DIR%\env.template" (
        echo %BLUE%[INFO]%NC% 从模板创建 .env 配置文件...
        copy "%CONFIG_DIR%\env.template" "%CONFIG_DIR%\.env" >nul
        echo %YELLOW%[WARN]%NC% 请编辑 %CONFIG_DIR%\.env 文件，修改默认密码和配置
    ) else (
        echo %RED%[ERROR]%NC% 找不到配置模板文件
        exit /b 1
    )
)

:: 创建必要的目录
if not exist "%DOCKER_DIR%\init\mysql" mkdir "%DOCKER_DIR%\init\mysql"
if not exist "%DOCKER_DIR%\init\clickhouse" mkdir "%DOCKER_DIR%\init\clickhouse"
if not exist "%DOCKER_DIR%\config\grafana\provisioning\datasources" mkdir "%DOCKER_DIR%\config\grafana\provisioning\datasources"
if not exist "%DOCKER_DIR%\config\grafana\provisioning\dashboards" mkdir "%DOCKER_DIR%\config\grafana\provisioning\dashboards"
if not exist "%DOCKER_DIR%\config\grafana\dashboards" mkdir "%DOCKER_DIR%\config\grafana\dashboards"
if not exist "%DOCKER_DIR%\config\nginx\ssl" mkdir "%DOCKER_DIR%\config\nginx\ssl"

echo %GREEN%[SUCCESS]%NC% 配置初始化完成
exit /b 0

:deploy
call :check_docker
if errorlevel 1 exit /b 1

call :init_config
if errorlevel 1 exit /b 1

echo %BLUE%[INFO]%NC% 启动服务...
cd /d "%DOCKER_DIR%"

echo %BLUE%[INFO]%NC% 拉取 Docker 镜像...
docker compose pull

echo %BLUE%[INFO]%NC% 构建应用镜像...
docker compose build

echo %BLUE%[INFO]%NC% 启动所有服务...
docker compose up -d

echo %GREEN%[SUCCESS]%NC% 服务启动完成

call :wait_for_services
call :show_status
goto :eof

:start
call :check_docker
if errorlevel 1 exit /b 1

call :init_config
if errorlevel 1 exit /b 1

echo %BLUE%[INFO]%NC% 启动服务...
cd /d "%DOCKER_DIR%"
docker compose up -d

echo %GREEN%[SUCCESS]%NC% 服务启动完成
call :wait_for_services
call :show_status
goto :eof

:stop
call :check_docker
if errorlevel 1 exit /b 1

echo %BLUE%[INFO]%NC% 停止服务...
cd /d "%DOCKER_DIR%"
docker compose down

echo %GREEN%[SUCCESS]%NC% 服务已停止
goto :eof

:restart
call :stop
call :start
goto :eof

:status
call :check_docker
if errorlevel 1 exit /b 1

call :show_status
goto :eof

:logs
call :check_docker
if errorlevel 1 exit /b 1

cd /d "%DOCKER_DIR%"
if "%2"=="" (
    docker compose logs -f
) else (
    docker compose logs -f %2
)
goto :eof

:cleanup
echo %YELLOW%[WARN]%NC% 此操作将删除所有数据卷，是否继续？(Y/N)
set /p confirm=
if /i "%confirm%"=="Y" (
    echo %BLUE%[INFO]%NC% 清理数据...
    cd /d "%DOCKER_DIR%"
    docker compose down -v
    echo %GREEN%[SUCCESS]%NC% 数据清理完成
) else (
    echo %BLUE%[INFO]%NC% 取消清理
)
goto :eof

:wait_for_services
echo %BLUE%[INFO]%NC% 等待服务就绪...
set attempts=0
:wait_loop
if %attempts% geq 30 (
    echo.
    echo %YELLOW%[WARN]%NC% 服务启动超时，请检查日志
    goto :eof
)
curl -s http://localhost:3000/health >nul 2>&1
if errorlevel 1 (
    set /a attempts+=1
    echo|set /p=.
    timeout /t 2 /nobreak >nul
    goto :wait_loop
)
echo.
echo %GREEN%[SUCCESS]%NC% 应用服务已就绪
goto :eof

:show_status
echo.
echo %BLUE%[INFO]%NC% 服务状态:
echo.
cd /d "%DOCKER_DIR%"
docker compose ps
echo.
echo %BLUE%[INFO]%NC% 访问地址:
echo   - 主应用:     http://localhost:3000
echo   - Grafana:    http://localhost:3001
echo   - Prometheus: http://localhost:9090
echo.
echo %BLUE%[INFO]%NC% 默认账号:
echo   - Grafana:    admin / admin123
echo.
goto :eof

:help
echo.
echo 用法: %~nx0 [命令]
echo.
echo 命令:
echo   deploy    部署并启动所有服务 (默认)
echo   start     启动服务
echo   stop      停止服务
echo   restart   重启服务
echo   status    查看服务状态
echo   logs      查看日志 (可选: logs [服务名])
echo   cleanup   清理所有数据
echo   help      显示此帮助信息
echo.
goto :eof
