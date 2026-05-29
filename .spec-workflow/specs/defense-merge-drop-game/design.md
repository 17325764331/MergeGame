# 技术设计文档（Design）

## 1. 概述

本文档定义 `defense-merge-drop-game` 的前端技术方案。目标是在纯前端环境下实现“掉落合成武器装备”玩法，满足需求文档中的用户故事与 EARS 验收标准。

- 技术形态：静态网页应用（HTML/CSS/JavaScript）
- 运行环境：现代浏览器（桌面 + 移动）
- 数据存储：`localStorage`
- 部署方式：本地打开或静态托管

## 2. 设计目标

- 上手快：单指/鼠标即可完成完整游玩循环。
- 体验稳：碰撞与合成判定可预测，避免“看起来碰到了却不合成”。
- 难度中等：默认 12 级装备链，后期空间压力明显但可通过策略缓解。
- 可维护：配置化等级表与国防值表，后续可调平衡而不改核心引擎。

## 3. 系统架构

### 3.1 模块划分

1. `GameEngine`（游戏主循环）
   - 管理状态机（准备中/进行中/结束）
   - 驱动渲染更新与输入处理

2. `PhysicsWorld`（简化物理与碰撞）
   - 管理掉落、重力、边界、速度衰减
   - 计算圆形碰撞与静止判定

3. `MergeSystem`（合成系统）
   - 识别同等级碰撞
   - 执行实体移除与升级实体生成
   - 触发视觉反馈

4. `DefenseValueSystem`（计分系统）
   - 根据合成等级累加“国防值”
   - 维护局内当前值与历史最高值

5. `Persistence`（持久化）
   - 读写 `localStorage`
   - 存储不可用时降级到内存

6. `UI Layer`（界面层）
   - 显示当前待投放装备、当前国防值、最高国防值
   - 展示游戏结束遮罩、新游戏按钮、提示信息

### 3.2 状态流转

- `idle`：等待开始或准备新局
- `running`：正常投放、碰撞、合成
- `game_over`：达到溢出条件，禁止投放

事件流：
`输入投放 -> 创建实体 -> 物理更新 -> 碰撞检测 -> 合成/计分 -> UI 刷新 -> 结束检测`

## 4. 数据模型

### 4.1 装备等级配置（核心配置表）

```ts
interface WeaponTierConfig {
  tier: number;              // 1~12
  id: string;                // wood-stick, knife ...
  name: string;              // 展示名
  radius: number;            // 碰撞半径（像素）
  color: string;             // UI/粒子主色
  defenseGain: number;       // 合成到本级时增加国防值
}
```

默认 12 级（示例）：
1 木棍 / 2 小刀 / 3 短剑 / 4 长剑 / 5 盾牌战具 / 6 火枪 / 7 步枪 / 8 机枪 / 9 火箭筒 / 10 坦克 / 11 战斗机 / 12 核武器

### 4.2 游戏实体

```ts
interface WeaponEntity {
  entityId: string;
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isSettled: boolean;
}
```

### 4.3 全局状态

```ts
interface GameState {
  phase: 'idle' | 'running' | 'game_over';
  entities: WeaponEntity[];
  nextTier: number;
  defenseValue: number;
  bestDefenseValue: number;
  keepAliveTimerMs: number;  // 溢出缓冲计时
}
```

## 5. 核心算法设计

### 5.1 掉落与碰撞

- 采用固定时间步（如 `1/60` 秒）更新。
- 基于圆形碰撞（中心距小于或等于半径和）。
- 边界处理：左右墙反弹衰减，底部停止。
- 稳定策略：低速阈值下标记 `isSettled`，减少抖动。

### 5.2 合成判定

- 仅当两实体 `tier` 相同且均处于可合成状态时触发。
- 每个物理帧内，同一实体最多参与一次合成（防连锁重复消费）。
- 合成结果在两者中点附近生成 `tier + 1` 实体。
- 若已是最高级（12），不再升级，仅保留最高级实体。

### 5.3 国防值计算

采用配置驱动，默认建议指数成长（中等偏爽感）：

- 合成到 `tier n` 时：`gain(n) = round(10 * 1.8^(n-1))`
- `DefenseValueSystem` 每次合成累加 `gain(n)`
- 若 `defenseValue > bestDefenseValue`，立即刷新并持久化

> 最终公式在实现前可按试玩数据微调。

### 5.4 失败判定

- 设容器顶部警戒线 `warningY`。
- 若任一实体顶部超过警戒线并持续超过 `overflowGraceMs`（如 1200ms），判定失败。
- 进入 `game_over` 后禁止继续投放。

## 6. UI/交互设计

### 6.1 布局

- 顶部信息区：当前国防值、历史最高国防值、新游戏按钮
- 中央游戏区：容器 + 掉落轨道 + 警戒线
- 状态层：开始提示、结束弹层、关键反馈文本

### 6.2 输入

- 桌面端：鼠标移动确定落点，点击投放
- 移动端：触摸滑动确定落点，抬手投放

### 6.3 反馈

- 合成闪光/缩放反馈
- 国防值数字跳增动效
- 达成新高时短提示（如“国防新纪录！”）

## 7. 本地存储设计

- `bestDefenseValue`：键名 `defenseMerge.bestDefenseValue`
- 读取失败或写入失败：捕获异常并降级到内存变量
- 仅保存最高值，不保存局内进度（首版）

## 8. 性能与兼容性

- 目标帧率：50~60 FPS
- 策略：
  - 限制最大实体数量（软上限提示）
  - 优化碰撞遍历（首版 O(n²)，后续可网格优化）
  - 仅在状态变更时更新部分 UI
- 兼容：Chrome / Edge / Safari 近两年版本

## 9. 风险与应对

- 物理不稳定导致穿模：增加最小分离修正与速度上限。
- 合成时机不一致：统一在单帧收集碰撞、批处理合成。
- 难度偏离预期：暴露配置（半径、掉落分布、增分系数）用于平衡。

## 10. 与需求的映射

- US-01/US-02：由 `Input + PhysicsWorld + MergeSystem` 实现
- US-03：由等级配置中的 `radius` 递增规则实现
- US-04：由 `DefenseValueSystem + Persistence` 实现
- US-05：由状态机与结束判定流程实现

## 11. 实施边界（本阶段不做）

- 联网排行榜
- 道具系统
- 多语言系统
- 复杂 3D 渲染
