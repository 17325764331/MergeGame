(() => {
  const CANVAS_WIDTH = 420;
  const CANVAS_HEIGHT = 620;
  const STEP_SECONDS = 1 / 60;

  const WEAPON_TIERS = Object.freeze([
    { tier: 1, id: "wood-stick", name: "木棍", radius: 18, color: "#9f7b50", defenseGain: 10 },
    { tier: 2, id: "knife", name: "小刀", radius: 21, color: "#c2d0df", defenseGain: 18 },
    { tier: 3, id: "short-sword", name: "短剑", radius: 24, color: "#9bb9d5", defenseGain: 32 },
    { tier: 4, id: "long-sword", name: "长剑", radius: 29, color: "#86a9d4", defenseGain: 58 },
    { tier: 5, id: "shield-kit", name: "盾牌战具", radius: 33, color: "#7aa8b9", defenseGain: 105 },
    { tier: 6, id: "musket", name: "火枪", radius: 38, color: "#7f8db0", defenseGain: 189 },
    { tier: 7, id: "rifle", name: "步枪", radius: 42, color: "#6f9bc9", defenseGain: 340 },
    { tier: 8, id: "machine-gun", name: "机枪", radius: 47, color: "#5b87bf", defenseGain: 612 },
    { tier: 9, id: "rocket-launcher", name: "火箭筒", radius: 53, color: "#5a7bb0", defenseGain: 1102 },
    { tier: 10, id: "tank", name: "坦克", radius: 60, color: "#5a8f7a", defenseGain: 1984 },
    { tier: 11, id: "fighter-jet", name: "战斗机", radius: 69, color: "#5f7a98", defenseGain: 3571 },
    { tier: 12, id: "nuclear", name: "核武器", radius: 42, color: "#d89b52", defenseGain: 6428 },
  ]);
  const SPAWN_POOL = [1, 1, 1, 2, 2, 3];
  const GRAVITY = 1500;
  const AIR_DAMPING = 0.998;
  const WALL_RESTITUTION = 0.2;
  const FLOOR_RESTITUTION = 0.1;
  const SETTLED_SPEED = 34;
  const FLOOR_FRICTION = 0.92;
  const MERGE_FLASH_DURATION = 0.2;
  const DROP_UNLOCK_DELAY = 0.08;
  const BEST_DEFENSE_VALUE_KEY = "defenseMerge.bestDefenseValue";
  const GAME_STATE_KEY = "defenseMerge.currentGameState";
  const SAVE_INTERVAL_SECONDS = 0.35;
  const WEAPON_SPRITE_BASE_PATH = "assets/source";
  const WARNING_LINE_Y = 92;
  const OVERFLOW_GRACE_SECONDS = 1.2;
  const MAX_ENTITIES = 120;

  const Phase = Object.freeze({
    IDLE: "idle",
    RUNNING: "running",
    GAME_OVER: "game_over",
  });

  const dom = {
    canvas: document.getElementById("game-canvas"),
    lane: document.getElementById("drop-lane"),
    message: document.getElementById("message"),
    newGameBtn: document.getElementById("new-game"),
    overlay: document.getElementById("status-overlay"),
    overlayText: document.getElementById("status-text"),
    overlayNewGameBtn: document.getElementById("overlay-new-game"),
    defenseValue: document.getElementById("defense-value"),
    bestDefenseValue: document.getElementById("best-defense-value"),
  };

  const ctx = dom.canvas.getContext("2d");
  const weaponSprites = new Map();
  let state = createInitialState();
  let rafId = 0;
  let previousTime = 0;
  let accumulator = 0;

  init();

  function init() {
    preloadWeaponSprites();
    state = loadGameState() ?? state;
    bindEvents();
    resizeCanvas();
    render(state);
    startLoop();
  }

  function preloadWeaponSprites() {
    for (const tierConfig of WEAPON_TIERS) {
      const image = new Image();
      const spriteState = {
        image,
        loaded: false,
      };
      image.onload = () => {
        spriteState.loaded = true;
      };
      image.onerror = () => {
        spriteState.loaded = false;
      };
      image.src = `${WEAPON_SPRITE_BASE_PATH}/${tierConfig.tier}.png`;
      weaponSprites.set(tierConfig.tier, spriteState);
    }
  }

  function evaluateGameOver(dt) {
    const overflowing = state.entities.some((entity) => {
      if (entity.id === state.activeDropId) {
        return false;
      }

      const lowSpeed = Math.abs(entity.vx) < SETTLED_SPEED && Math.abs(entity.vy) < SETTLED_SPEED;
      return entity.y - entity.r < WARNING_LINE_Y && (entity.isSettled || lowSpeed);
    });
    if (overflowing) {
      state.overflowTimer += dt;
      if (state.overflowTimer >= OVERFLOW_GRACE_SECONDS) {
        state.phase = Phase.GAME_OVER;
        announce("容器已溢出，点击新游戏继续挑战");
      }
      return;
    }

    state.overflowTimer = 0;
  }

  function resolveMerges() {
    const consumed = new Set();
    const mergeEvents = [];

    for (let i = 0; i < state.entities.length; i += 1) {
      const a = state.entities[i];
      if (consumed.has(a.id)) {
        continue;
      }
      for (let j = i + 1; j < state.entities.length; j += 1) {
        const b = state.entities[j];
        if (consumed.has(b.id)) {
          continue;
        }
        if (a.tier !== b.tier || a.tier >= WEAPON_TIERS.length) {
          continue;
        }

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance > a.r + b.r) {
          continue;
        }

        consumed.add(a.id);
        consumed.add(b.id);
        mergeEvents.push({ a, b, toTier: a.tier + 1 });
        break;
      }
    }

    if (mergeEvents.length === 0) {
      return;
    }

    state.entities = state.entities.filter((entity) => !consumed.has(entity.id));
    for (const event of mergeEvents) {
      const toConfig = getTierConfig(event.toTier);
      const x = (event.a.x + event.b.x) / 2;
      const y = (event.a.y + event.b.y) / 2;
      const mergedEntityId = `${Date.now()}-${Math.random()}`;
      state.entities.push({
        id: mergedEntityId,
        tier: toConfig.tier,
        name: toConfig.name,
        x,
        y,
        r: toConfig.radius,
        color: toConfig.color,
        vx: (event.a.vx + event.b.vx) * 0.35,
        vy: -40,
        isSettled: false,
      });
      state.mergeEffects.push({ x, y, radius: toConfig.radius, life: MERGE_FLASH_DURATION });
      if (event.a.id === state.activeDropId || event.b.id === state.activeDropId) {
        state.activeDropId = mergedEntityId;
        state.dropUnlockTimer = 0;
      }
      addDefenseValue(toConfig.defenseGain);
      saveGameState();
      announce(`合成成功：${event.a.name} -> ${toConfig.name}`);
    }
  }

  function updateMergeEffects(dt) {
    state.mergeEffects = state.mergeEffects
      .map((effect) => ({ ...effect, life: effect.life - dt }))
      .filter((effect) => effect.life > 0);
  }

  function bindEvents() {
    window.addEventListener("resize", resizeCanvas);
    dom.newGameBtn.addEventListener("click", startNewGame);
    dom.overlayNewGameBtn.addEventListener("click", startNewGame);

    dom.canvas.addEventListener("pointermove", (event) => {
      const position = getPointerPosition(event);
      state.dropAimX = clamp(position.x, 0, CANVAS_WIDTH);
    });

    dom.canvas.addEventListener("pointerdown", (event) => {
      if (state.phase === Phase.GAME_OVER) {
        return;
      }
      if (state.phase === Phase.IDLE) {
        state.phase = Phase.RUNNING;
      }
      const position = getPointerPosition(event);
      state.dropAimX = clamp(position.x, 0, CANVAS_WIDTH);
    });

    dom.canvas.addEventListener("pointerup", () => {
      if (state.phase === Phase.GAME_OVER) {
        return;
      }
      if (state.phase === Phase.IDLE) {
        state.phase = Phase.RUNNING;
      }
      queueDrop(state.dropAimX ?? CANVAS_WIDTH / 2);
    });
  }

  function startLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    previousTime = performance.now();
    const tick = (time) => {
      const frameSeconds = Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      accumulator += frameSeconds;

      while (accumulator >= STEP_SECONDS) {
        update(STEP_SECONDS);
        accumulator -= STEP_SECONDS;
      }

      render(state);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function update(dt) {
    if (state.phase !== Phase.RUNNING) {
      return;
    }

    state.elapsedSeconds += dt;
    processQueuedDrops();
    simulatePhysics(dt);
    updateDropLock(dt);
    evaluateGameOver(dt);
    updateAutoSave(dt);
  }

  function queueDrop(x) {
    const currentConfig = getTierConfig(state.currentDropTier);

    if (!canDropNext()) {
      announce("请等待上一件装备落稳或合成完成");
      return;
    }

    if (state.entities.length >= MAX_ENTITIES) {
      announce("场景实体过多，暂停投放以保障流畅性");
      state.pendingDropX = null;
      return;
    }

    state.pendingDropX = clamp(x, 0, CANVAS_WIDTH);
    announce(`已记录投放位置：${Math.round(state.pendingDropX)}，当前待投放：${currentConfig.name}`);
  }

  function processQueuedDrops() {
    if (state.pendingDropX === null) {
      return;
    }

    const currentConfig = getTierConfig(state.currentDropTier);
    const entityId = `${Date.now()}-${state.entities.length}`;

    state.entities.push({
      id: entityId,
      tier: currentConfig.tier,
      name: currentConfig.name,
      x: state.pendingDropX,
      y: currentConfig.radius + 4,
      r: currentConfig.radius,
      color: currentConfig.color,
      vx: 0,
      vy: 0,
      isSettled: false,
    });
    state.activeDropId = entityId;
    state.dropUnlockTimer = 0;
    state.currentDropTier = state.nextDropTier;
    state.nextDropTier = pickRandomSpawnTier();
    state.pendingDropX = null;
    saveGameState();
  }

  function simulatePhysics(dt) {
    for (const entity of state.entities) {
      if (entity.isSettled) {
        entity.vx *= FLOOR_FRICTION;
      }
      entity.vx *= AIR_DAMPING;
      entity.vy += GRAVITY * dt;
      entity.x += entity.vx * dt;
      entity.y += entity.vy * dt;
      resolveWorldBounds(entity);
    }

    resolveMerges();
    resolveEntityCollisions();
    resolveMerges();
    updateMergeEffects(dt);
    updateSettledStates();
  }

  function resolveWorldBounds(entity) {
    if (entity.x - entity.r < 0) {
      entity.x = entity.r;
      entity.vx = Math.abs(entity.vx) * WALL_RESTITUTION;
      entity.isSettled = false;
    } else if (entity.x + entity.r > CANVAS_WIDTH) {
      entity.x = CANVAS_WIDTH - entity.r;
      entity.vx = -Math.abs(entity.vx) * WALL_RESTITUTION;
      entity.isSettled = false;
    }

    if (entity.y + entity.r > CANVAS_HEIGHT) {
      entity.y = CANVAS_HEIGHT - entity.r;
      entity.vy = -Math.abs(entity.vy) * FLOOR_RESTITUTION;
      entity.vx *= FLOOR_FRICTION;
      if (Math.abs(entity.vy) < SETTLED_SPEED) {
        entity.vy = 0;
      }
    }
  }

  function resolveEntityCollisions() {
    for (let i = 0; i < state.entities.length; i += 1) {
      const a = state.entities[i];
      for (let j = i + 1; j < state.entities.length; j += 1) {
        const b = state.entities[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        let distance = Math.hypot(dx, dy);

        if (distance === 0) {
          distance = 0.01;
        }
        if (distance >= minDist) {
          continue;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDist - distance;
        const correction = overlap * 0.5;

        a.x -= nx * correction;
        a.y -= ny * correction;
        b.x += nx * correction;
        b.y += ny * correction;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const separatingVelocity = rvx * nx + rvy * ny;
        if (separatingVelocity > 0) {
          continue;
        }

        const impulse = (-(1 + 0.18) * separatingVelocity) / 2;
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;

        a.vx -= impulseX;
        a.vy -= impulseY;
        b.vx += impulseX;
        b.vy += impulseY;
        a.isSettled = false;
        b.isSettled = false;
      }
    }
  }

  function updateSettledStates() {
    for (const entity of state.entities) {
      const touchingFloor = entity.y + entity.r >= CANVAS_HEIGHT - 0.5;
      const lowSpeed = Math.abs(entity.vx) < SETTLED_SPEED && Math.abs(entity.vy) < SETTLED_SPEED;
      entity.isSettled = touchingFloor && lowSpeed;
      if (entity.isSettled) {
        entity.vx *= FLOOR_FRICTION;
        entity.vy = 0;
      }
    }
  }

  function updateDropLock(dt) {
    if (!state.activeDropId) {
      return;
    }

    const activeEntity = state.entities.find((entity) => entity.id === state.activeDropId);
    const lockResolved = !activeEntity || isDropReadyForNext(activeEntity);
    if (!lockResolved) {
      state.dropUnlockTimer = 0;
      return;
    }

    state.dropUnlockTimer += dt;
    if (state.dropUnlockTimer >= DROP_UNLOCK_DELAY && state.mergeEffects.length === 0) {
      state.activeDropId = null;
      state.dropUnlockTimer = 0;
      announce(`可以投放下一件：${getTierConfig(state.currentDropTier).name}`);
    }
  }

  function isDropReadyForNext(entity) {
    return isEntitySupported(entity);
  }

  function isEntitySupported(entity) {
    if (entity.y + entity.r >= CANVAS_HEIGHT - 1) {
      return true;
    }

    return state.entities.some((other) => {
      if (other.id === entity.id) {
        return false;
      }

      const dx = other.x - entity.x;
      const dy = other.y - entity.y;
      const distance = Math.hypot(dx, dy);
      const touching = distance <= entity.r + other.r + 2;
      const below = other.y > entity.y;
      return touching && below;
    });
  }

  function render(currentState) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawArenaBackground();

    if (currentState.phase !== Phase.GAME_OVER) {
      const aimX = clamp(currentState.dropAimX ?? CANVAS_WIDTH / 2, 0, CANVAS_WIDTH);
      const aimTier = getTierConfig(currentState.currentDropTier);
      ctx.beginPath();
      ctx.moveTo(aimX, 0);
      ctx.lineTo(aimX, WARNING_LINE_Y - 4);
      ctx.strokeStyle = "rgba(145, 227, 191, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(aimX, 24, aimTier.radius, 0, Math.PI * 2);
      if (!drawWeaponSprite(currentState.currentDropTier, aimX, 24, aimTier.radius, 0.8)) {
        ctx.fillStyle = `${aimTier.color}bb`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.moveTo(0, WARNING_LINE_Y);
    ctx.lineTo(CANVAS_WIDTH, WARNING_LINE_Y);
    ctx.strokeStyle = "rgba(255, 108, 108, 0.75)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const entity of currentState.entities) {
      const spriteDrawn = drawWeaponSprite(entity.tier, entity.x, entity.y, entity.r, 1);
      if (!spriteDrawn) {
        ctx.beginPath();
        ctx.arc(entity.x, entity.y, entity.r, 0, Math.PI * 2);
        ctx.fillStyle = entity.color;
        ctx.fill();
        ctx.strokeStyle = "#9ef4d5";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#eff8ff";
        ctx.font = "11px 'Segoe UI'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(entity.tier), entity.x, entity.y);
      }
    }

    for (const effect of currentState.mergeEffects) {
      const progress = effect.life / MERGE_FLASH_DURATION;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * (1.1 + (1 - progress) * 1.2), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 236, 171, ${progress.toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    dom.defenseValue.textContent = String(currentState.defenseValue);
    dom.bestDefenseValue.textContent = String(currentState.bestDefenseValue);

    if (currentState.phase === Phase.GAME_OVER) {
      dom.overlayNewGameBtn.textContent = "开始新游戏";
      showOverlay(`游戏结束，国防值：${currentState.defenseValue}`);
    } else if (currentState.phase === Phase.IDLE) {
      dom.overlayNewGameBtn.textContent = "开始游戏";
      showOverlay("点击容器开始投放");
      dom.overlayText.textContent = `点击容器开始投放（当前：${getTierConfig(currentState.currentDropTier).name}）`;
    } else {
      hideOverlay();
    }

    dom.lane.textContent = `当前：${getTierConfig(currentState.currentDropTier).name}  |  下一件：${getTierConfig(currentState.nextDropTier).name}`;

    if (currentState.phase === Phase.RUNNING && currentState.overflowTimer > 0) {
      announce(`警告：装备接近溢出 (${Math.max(0, OVERFLOW_GRACE_SECONDS - currentState.overflowTimer).toFixed(1)}s)`);
    }
  }

  function drawArenaBackground() {
    const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#eef6ff");
    gradient.addColorStop(0.34, "#b9d6ff");
    gradient.addColorStop(0.68, "#9d8cff");
    gradient.addColorStop(1, "#5f50c9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const topGlow = ctx.createRadialGradient(CANVAS_WIDTH * 0.25, CANVAS_HEIGHT * 0.12, 0, CANVAS_WIDTH * 0.25, CANVAS_HEIGHT * 0.12, 220);
    topGlow.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    topGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const purpleGlow = ctx.createRadialGradient(CANVAS_WIDTH * 0.62, CANVAS_HEIGHT * 0.88, 0, CANVAS_WIDTH * 0.62, CANVAS_HEIGHT * 0.88, 300);
    purpleGlow.addColorStop(0, "rgba(190, 96, 255, 0.26)");
    purpleGlow.addColorStop(1, "rgba(190, 96, 255, 0)");
    ctx.fillStyle = purpleGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "rgba(20, 20, 62, 0.16)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  function startNewGame() {
    clearGameState();
    state = createInitialState();
    state.phase = Phase.RUNNING;
    hideOverlay();
    announce("已开始新游戏，拖动瞄准后松手投放");
  }

  function createInitialState() {
    return {
      phase: Phase.IDLE,
      elapsedSeconds: 0,
      entities: [],
      mergeEffects: [],
      pendingDropX: null,
      activeDropId: null,
      dropUnlockTimer: 0,
      currentDropTier: pickRandomSpawnTier(),
      nextDropTier: pickRandomSpawnTier(),
      defenseValue: 0,
      bestDefenseValue: getBestDefenseValue(),
      overflowTimer: 0,
      dropAimX: CANVAS_WIDTH / 2,
      saveTimer: 0,
    };
  }

  function showOverlay(text) {
    dom.overlay.hidden = false;
    dom.overlayText.textContent = text;
    dom.overlay.dataset.gameOver = state.phase === Phase.GAME_OVER ? "1" : "0";
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
    dom.overlay.dataset.gameOver = "0";
  }

  function announce(text) {
    dom.message.textContent = text;
  }

  function getPointerPosition(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    return {
      x: (event.clientX - rect.left) * scaleX,
    };
  }

  function resizeCanvas() {
    const panelWidth = dom.canvas.clientWidth;
    dom.lane.style.backgroundPositionX = `${Math.floor(panelWidth / 2)}px 0px`;
  }

  function getTierConfig(tier) {
    return WEAPON_TIERS[tier - 1] ?? WEAPON_TIERS[0];
  }

  function canDropNext() {
    return state.pendingDropX === null && state.activeDropId === null;
  }

  function drawWeaponSprite(tier, x, y, radius, opacity = 1) {
    const sprite = weaponSprites.get(tier);
    if (!sprite || !sprite.loaded || !sprite.image?.naturalWidth) {
      return false;
    }

    const size = radius * 2;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sprite.image, x - radius, y - radius, size, size);
    ctx.restore();
    return true;
  }

  function pickRandomSpawnTier() {
    return SPAWN_POOL[Math.floor(Math.random() * SPAWN_POOL.length)];
  }

  function addDefenseValue(gain) {
    state.defenseValue += gain;
    if (state.defenseValue > state.bestDefenseValue) {
      state.bestDefenseValue = state.defenseValue;
      saveBestDefenseValue(state.bestDefenseValue);
      announce(`国防新纪录：${state.bestDefenseValue}`);
    }
  }

  function getBestDefenseValue() {
    try {
      const raw = localStorage.getItem(BEST_DEFENSE_VALUE_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  function saveBestDefenseValue(value) {
    try {
      localStorage.setItem(BEST_DEFENSE_VALUE_KEY, String(value));
      state.storageAvailable = true;
    } catch {
      state.storageAvailable = false;
    }
  }

  function updateAutoSave(dt) {
    state.saveTimer += dt;
    if (state.saveTimer < SAVE_INTERVAL_SECONDS) {
      return;
    }

    state.saveTimer = 0;
    saveGameState();
  }

  function saveGameState() {
    try {
      const snapshot = {
        phase: state.phase,
        elapsedSeconds: state.elapsedSeconds,
        entities: state.entities,
        mergeEffects: state.mergeEffects,
        pendingDropX: state.pendingDropX,
        activeDropId: state.activeDropId,
        dropUnlockTimer: state.dropUnlockTimer,
        currentDropTier: state.currentDropTier,
        nextDropTier: state.nextDropTier,
        defenseValue: state.defenseValue,
        bestDefenseValue: state.bestDefenseValue,
        overflowTimer: state.overflowTimer,
        dropAimX: state.dropAimX,
      };
      localStorage.setItem(GAME_STATE_KEY, JSON.stringify(snapshot));
      state.storageAvailable = true;
    } catch {
      state.storageAvailable = false;
    }
  }

  function loadGameState() {
    try {
      const raw = localStorage.getItem(GAME_STATE_KEY);
      if (!raw) {
        return null;
      }

      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.entities)) {
        return null;
      }

      const restored = {
        ...createInitialState(),
        ...saved,
        phase: saved.phase === Phase.GAME_OVER ? Phase.GAME_OVER : Phase.RUNNING,
        bestDefenseValue: Math.max(getBestDefenseValue(), Number(saved.bestDefenseValue) || 0),
        saveTimer: 0,
      };

      restored.entities = saved.entities
        .filter((entity) => Number.isFinite(entity.x) && Number.isFinite(entity.y) && Number.isFinite(entity.tier))
        .map((entity) => {
          const config = getTierConfig(entity.tier);
          return {
            id: entity.id || `${Date.now()}-${Math.random()}`,
            tier: config.tier,
            name: config.name,
            x: entity.x,
            y: entity.y,
            r: config.radius,
            color: config.color,
            vx: Number.isFinite(entity.vx) ? entity.vx : 0,
            vy: Number.isFinite(entity.vy) ? entity.vy : 0,
            isSettled: Boolean(entity.isSettled),
          };
        });

      restored.mergeEffects = Array.isArray(saved.mergeEffects) ? saved.mergeEffects : [];
      return restored;
    } catch {
      return null;
    }
  }

  function clearGameState() {
    try {
      localStorage.removeItem(GAME_STATE_KEY);
      state.storageAvailable = true;
    } catch {
      state.storageAvailable = false;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
