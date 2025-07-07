# 密码管理器技术说明文档

## 1. 项目概述

本项目是一个功能完备的密码管理平台，由一个安全的后端服务和一个便捷的浏览器插件组成。它旨在为用户提供一个安全、可靠、跨平台的密码存储和自动填充解决方案。

- **后端服务**: 基于Python Django框架构建，负责用户认证、数据加密存储、API接口等核心功能。
- **浏览器插件**: 一个Chrome浏览器扩展，负责与用户交互、自动填充密码、与后端服务通信等。

## 2. 系统架构

项目采用经典的客户端/服务端（C/S）架构。

  <!-- Placeholder for a real diagram -->

### 2.1. 后端 (Backend)

- **技术栈**:
  - **Python 3.9**
  - **Django & Django REST Framework**: 构建健壮的RESTful API。
  - **Gunicorn**: 生产级的WSGI服务器。
  - **MySQL**: 通过`mysql-connector-python`连接的关系型数据库。
  - **Simple JWT**: 用于基于JSON Web Token的无状态认证。
  - **pyotp**: 生成基于时间的一次性密码（TOTP/MFA）。
  - **whitenoise**: 高效地处理静态文件。
- **部署**:
  - 通过 **Docker** 进行容器化部署，确保了环境的一致性和可移植性。
  - `Dockerfile` 定义了镜像的构建过程。
  - `entrypoint.sh` 脚本负责容器启动时的初始化操作（数据库迁移、静态文件收集）。

### 2.2. 浏览器插件 (Extension)

- **技术栈**:
  - **HTML5, CSS3, JavaScript (ES6+)**
  - **Chrome Extension Manifest V3**: 最新的插件清单规范。
- **核心组件**:
  - **`background.js` (Service Worker)**: 插件的后台核心，处理所有核心逻辑，如API通信、加密解密、状态管理等。
  - **`popup.js`**: 插件弹出窗口的交互逻辑，如登录、解锁、显示密码列表等。
  - **`content.js`**: 注入到网页中的脚本，负责检测登录表单并实现自动填充。
  - **`options.js`**: 插件的选项页面，允许用户配置后端API地址。

## 3. 后端详解

### 3.1. API Endpoints

主要的API端点定义在 `api/urls.py` 中：

- `/api/token/`: 用户登录，获取JWT。
- `/api/token/refresh/`: 刷新JWT。
- `/api/credentials/`:
  - `GET`: 获取当前用户的所有凭证。
  - `POST`: 创建一个新的凭证。
- `/api/credentials/<id>/`:
  - `GET`, `PUT`, `DELETE`: 操作单个凭证。
- `/api/credentials/<id>/totp/`: 获取指定凭证的实时TOTP码。

### 3.2. 数据库模型

核心数据模型是 `api/models.py` 中的 `Credential`：

- `user`: 外键，关联到Django的User模型。
- `website_url`: 网站地址。
- `username`: 用户名。
- `password`: **加密后**的密码。
- `mfa_secret`: **加密后**的MFA密钥。
- `created_at`, `updated_at`: 时间戳。

### 3.3. 安全与加密

- **认证**: 使用JWT进行无状态认证。用户登录后获得一个access token，后续所有请求都需在HTTP Header中携带此token。
- **密码加密**:
  - 用户首次登录时，使用其主密码通过`SHA-256`派生出一个会话密钥（Session Key），该密钥**仅存在于内存中**。
  - 所有凭证数据（密码、MFA密钥）在存入数据库前，都使用这个会话密钥通过 **AES-GCM** 算法进行加密。
  - 数据库中存储的是密文，即使数据库泄露，没有用户的主密码也无法解密数据。

## 4. 浏览器插件详解

### 4.1. 核心流程

- **首次登录**: 用户在插件弹窗中输入用户名和主密码，`background.js`向后端`/api/token/`发起请求。成功后，获取JWT并从后端同步所有加密凭证，然后使用主密码派生的会e话密钥解密后缓存在内存中。
- **离线解锁**: 如果用户已登录过，插件本地会存有加密的凭证库。用户只需输入主密码，`background.js`即可在本地完成解密并解锁，无需联网。
- **自动填充**: `content.js`在网页上检测到用户名或密码输入框时，会通知`background.js`。`background.js`根据当前网址查找匹配的凭证，并通过`content.js`在页面上显示一个下拉列表供用户选择，选择后即可自动填充。
- **MFA/TOTP**: `content.js`在登录后检测到MFA输入框时，会自动向`background.js`请求对应网站的TOTP码，`background.js`再向后端请求实时TOTP码并自动填充。

### 4.2. 插件权限 (`manifest.json`)

- `storage`: 用于存储JWT、加密的凭证库以及用户配置。
- `activeTab` & `scripting`: 允许`content.js`在当前激活的标签页上运行，以实现自动填充。
- `alarms`: 用于设置定时任务，如定期与后端同步数据。

## 5. 安装与部署指南

### 5.1. 前提条件

- **Docker**: 确保您的系统已安装并正在运行Docker。
- **MySQL数据库**: 需要一个可用的MySQL数据库实例。

### 5.2. 配置

1.  **数据库配置**:
    - 复制或重命名 `config/database.ini.example` 为 `config/database.ini`。
    - 修改文件内容，填入您的MySQL数据库信息。
    - **重要**: `HOST` 必须设置为 `host.docker.internal`，以便Docker容器可以访问到您电脑上的数据库。

2.  **默认管理员配置 (可选)**:
    - 在 `docker run` 命令中，您可以修改 `-e ADMIN_USER=...` 和 `-e ADMIN_PASSWORD=...` 的值来设置首次启动时创建的默认管理员用户名和密码。

### 5.3. 启动后端服务

在项目根目录下，打开终端并执行以下命令：

1.  **构建镜像**:
    ```bash
    docker build -t password-manager-backend .
    ```
2.  **运行容器**:
    ```bash
    docker run -d --rm -p 8000:8000 -v "%cd%/config:/app/config" -e ADMIN_USER=admin -e ADMIN_PASSWORD=password --name pm-backend password-manager-backend
    ```
    服务将在 `http://127.0.0.1:8000` 上可用。

### 5.4. 安装浏览器插件

1.  打开Chrome浏览器，进入 `chrome://extensions`。
2.  打开右上角的“**开发者模式**”。
3.  点击“**加载已解压的扩展程序**”，然后选择本项目的 `extension` 文件夹。
4.  插件安装成功后，右键点击插件图标，选择“**选项**”，填入您的后端地址（例如 `http://127.0.0.1:8000/api`）并保存。

## 6. 使用说明 (User Guide)

### 6.1. 首次登录与初始化

1.  **访问后端管理页面**: 打开浏览器，访问 `http://127.0.0.1:8000/admin/`。
2.  **登录管理员账户**: 使用您在 `docker run` 命令中设置的 `ADMIN_USER` 和 `ADMIN_PASSWORD` 登录。
3.  **添加凭证 (可选)**: 您可以在Admin后台手动为您的账户添加、修改或删除网站的登录凭证。这是管理所有数据的中心。

### 6.2. 使用浏览器插件

1.  **登录插件**:
    - 点击浏览器工具栏上的插件图标。
    - 输入您在Admin后台创建的**普通用户**的用户名和主密码。
    - 插件会连接后端，同步并加密存储您的所有凭证。

2.  **自动填充密码**:
    - 当您访问一个已保存凭证的网站时（例如 `github.com`），点击用户名输入框。
    - 插件会自动在输入框下方显示一个包含匹配用户名的下拉菜单。
    - 点击您想使用的用户名，插件会自动填充用户名和密码。

3.  **处理MFA/TOTP**:
    - 如果您登录的网站需要MFA（两步验证）码，插件会在您提交用户名密码后，自动检测MFA输入框。
    - 检测到后，它会自动从后端获取实时的6位TOTP码并填充到输入框中，在某些情况下还会自动提交表单，实现一键登录。

4.  **手动复制TOTP码**:
    - 在插件弹窗的主界面，对于设置了MFA的凭证，会有一个“Copy Code”按钮。
    - 点击此按钮，可以将当前的TOTP码复制到剪贴板，方便您手动粘贴。

5.  **锁定与解锁**:
    - 点击插件弹窗中的“Logout & Lock”按钮，插件会清除内存中的密钥并锁定。您的数据仍然安全地加密存储在本地。
    - 再次点击插件图标，会进入“解锁”模式。您只需输入您的主密码（无需用户名），即可快速解锁并恢复使用。
