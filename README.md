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
