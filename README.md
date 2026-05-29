# Defense Merge Drop

一个纯前端的武器装备掉落合成游戏，玩法类似合成大西瓜。玩家通过投放装备、碰撞合成更高级装备来获得“国防值”。游戏支持本地最高分记录和当前局进度保存。

## 功能特性

- 12 级武器装备合成链
- Canvas 物理掉落与碰撞
- 相同装备接触后立即合成
- 单投锁机制：上一件装备落稳或合成完成后才能继续投放
- 国防值计分系统
- 最高国防值本地保存
- 当前局进度本地缓存，刷新或关闭后可继续
- 游戏溢出失败判定
- 移动端触控支持
- 自定义 PNG 武器素材渲染
- 淡色紫蓝渐变游戏背景

## 项目结构

```text
MergeGame/
├── index.html
├── styles.css
├── game.js
├── README.md
└── assets/
    └── source/
        ├── 1.png
        ├── 2.png
        ├── ...
        └── 12.png
```

## 素材说明

游戏会按装备等级自动读取以下图片：

```text
assets/source/1.png
assets/source/2.png
...
assets/source/12.png
```

对应关系：

- `1.png`：第 1 级装备
- `2.png`：第 2 级装备
- ...
- `12.png`：第 12 级装备

如果图片加载失败，游戏会自动回退为圆形绘制，不会影响运行。

建议素材格式：

- PNG
- 透明背景
- 正方形比例
- 主体居中
- 推荐尺寸：`512x512` 或 `1024x1024`

## 本地运行

虽然项目是纯前端 HTML/CSS/JS，但建议通过本地 HTTP 服务访问，避免浏览器 `file://` 安全策略导致资源加载异常。

在项目目录执行：

```bash
python -m http.server 5500
```

如果 Windows 上 `python` 不可用，可以尝试：

```bash
py -m http.server 5500
```

然后在浏览器打开：

```text
http://127.0.0.1:5500/
```

## 数据缓存

游戏使用浏览器 `localStorage` 保存数据。

保存内容：

- 最高国防值
- 当前局国防值
- 场上装备位置、速度、等级
- 当前装备与下一件装备
- 游戏状态

使用的 key：

```text
defenseMerge.bestDefenseValue
defenseMerge.currentGameState
```

点击“新游戏”会清除当前局进度，但会保留最高国防值。

## 发布到 GitHub Pages

### 1. 创建 GitHub 仓库

在 GitHub 上创建一个新仓库，例如：

```text
MergeGame
```

### 2. 推送代码到 GitHub

在项目目录执行：

```bash
git init
git add .
git commit -m "Initial defense merge game"
git branch -M main
git remote add origin https://github.com/你的用户名/MergeGame.git
git push -u origin main
```

如果你已经有仓库，只需要执行：

```bash
git add .
git commit -m "Update defense merge game"
git push
```

### 3. 开启 GitHub Pages

进入 GitHub 仓库页面：

```text
Settings -> Pages
```

然后设置：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/root`

保存后等待几十秒到几分钟。

### 4. 访问游戏

GitHub Pages 地址通常是：

```text
https://你的用户名.github.io/MergeGame/
```

例如：

```text
https://example.github.io/MergeGame/
```

## 注意事项

- 仓库名会影响访问路径。
- 如果图片不显示，检查 `assets/source/1.png` 到 `12.png` 是否已经提交到 GitHub。
- GitHub Pages 更新可能有缓存，发布后如果没变化，可以等待一会儿或强制刷新浏览器。
- 本项目不需要后端服务，不需要数据库。

## 技术栈

- HTML5
- CSS3
- JavaScript
- Canvas 2D API
- localStorage

## License

仅供学习和个人项目使用。
