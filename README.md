该项目用于实现一个基于Django REST Framework的密码管理平台，具有以下主要功能：
1. 密码存储：用户可以注册、登录并存储他们的各种密码（如网站密码、数据库密码等）。
2. 多因素认证（MFA）：每个用户可以启用基于时间的一次性密码（TOTP），在登录时需要提供动态生成的验证码。
3. 密码自动填充：当用户在支持自动填充的网站上（如Google Chrome）输入用户名时，平台会自动检测并填充相应的密码。
4. 密码同步：用户可以将密码同步到其他设备（如手机），确保无论在哪台设备上，用户的密码都是最新的。
5. 隐私保护：平台注重用户隐私安全，采用了先进的加密技术和严格的数据访问控制。
整体结构如下：
. backend/ - 后端服务 (Django REST Framework)
这是整个平台的核心，负责处理所有的数据存储、用户认证和业务逻辑。它是一个基于Python和Django框架构建的API服务。

manage.py: Django项目的命令行管理工具，用于启动服务、数据库迁移等。
requirements.txt: 列出了后端服务所需的所有Python依赖库，如Django, djangorestframework, pyotp等。
password_manager/: Django项目的核心配置目录。
settings.py: 项目的主配置文件，定义了数据库连接、中间件、应用列表等。
urls.py: 项目的主路由文件，将URL路径分发到各个应用。
api/: 这是我们编写的核心业务应用。
models.py: 定义了数据模型，如User（用户）和Credential（密码凭据）。
views.py: 包含了API的业务逻辑，如用户登录、凭据的增删改查、TOTP生成等。
serializers.py: 负责将models.py中复杂的模型数据转换为API可以轻松传输的JSON格式。
urls.py: api应用的子路由文件，定义了所有API端点的具体路径（如 /api/credentials/, /api/token/）。
admin.py: 配置了Django自带的后台管理界面，方便管理员直接操作数据。
encryption.py: 存放了服务端用于加密MFA密钥的逻辑。
2. config/ - 配置文件
这个目录用于存放敏感的或环境相关的配置信息，以便与代码分离。

database.ini: 存储了数据库的连接信息（用户名、密码、地址等），settings.py会读取这个文件来连接数据库，避免了将敏感信息硬编码在代码中。
3. extension/ - 浏览器插件
这是用户直接交互的前端部分，作为一个浏览器插件存在。它负责在用户浏览网页时自动填充密码，并提供一个弹出窗口来管理凭据。

manifest.json: 插件的“身份证”，定义了插件的名称、版本、权限、脚本等元数据。
popup.html & popup.js: 构成了用户点击插件图标时看到的弹出窗口的界面和交互逻辑（如登录、登出、查看密码列表）。
background.js: 插件的“大脑”，一个在后台持续运行的服务脚本。它负责处理与后端API的通信、数据的加解密、本地缓存（离线模式）以及响应其他脚本的请求。这是我们实现“混合模式”的核心所在。
content.js: “注入”到用户浏览的网页中的脚本。它负责检测页面上的登录框，并根据background.js提供的数据实现自动填充和行内下拉菜单功能。
crypto.js: （虽然我们最终未使用文件，但其功能已由background.js中的Web Crypto API替代）负责前端的加密解密逻辑，确保用户主密码和凭据在本地的安全性。

安装步骤：
容器构建：
docker build -t password-manager-backend .
运行：
docker run -d --rm -p 8000:8000 -v "%cd%/config:/app/config" -e ADMIN_USER=admin -e ADMIN_PASSWORD=password --name pm-backend password-manager-backend

虚拟机：