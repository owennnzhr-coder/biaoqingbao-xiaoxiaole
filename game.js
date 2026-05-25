const BOARD_SIZE = 8;
const INITIAL_TIME = 50;
const MAX_STAGE = 15;
const TARGETS = [700, 1500, 2500, 3800, 5400, 7300, 9500, 12200, 15300, 18900, 23000, 27800, 33300, 39600, 46800];
const TIME_BONUS_BY_STAGE = [6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4, 3, 3];
const STORAGE_KEY = "football-match3-arcade-records";
const TOOL_LIMITS = { breaker: 2, shuffle: 2 };
const OBSTACLE_STAGE_START = 5;
const OBSTACLE_TYPES = [
  { key: "mist", name: "误", src: "./assets/1775559574_tNWq70VZ.png" },
  { key: "touch", name: "触", src: "./assets/1775559595_M3GrikRM.png" }
];
const ITEM_TYPES = [
  { key: "ball", code: "BAL", name: "DOGE", src: "./assets/1628560960_zZ1St7pY.png" },
  { key: "boot", code: "BOT", name: "WRONG", src: "./assets/1775894339_nozaGayD.PNG" },
  { key: "glove", code: "GLV", name: "COACH", src: "./assets/1777084240_rHxRUFs8.png" },
  { key: "cup", code: "CUP", name: "ACE", src: "./assets/1756110511_3fPcwWN6.png" },
  { key: "card", code: "CRD", name: "ANGER", src: "./assets/1570604777_e0Oe8bI6.png" },
  { key: "whistle", code: "WST", name: "BOSS", src: "./assets/1744011004_Kqxufw5l.png" }
];
const SPECIAL_LABELS = {
  row: "横扫",
  col: "纵扫",
  bomb: "爆裂",
  color: "全清"
};
const BROADCASTS = {
  match: ["Sharp Pass", "Good Build-Up", "Midfield Win"],
  chain: ["Counter Attack", "Quick One-Two", "Pressure Wave"],
  special: ["Power Shot", "Tactical Burst", "VAR Override"],
  stage: ["Stage Cleared", "Target Broken", "Crowd Roars"],
  fail: ["Full Time", "Clock Expired", "Pressure Too High"],
  victory: ["Champion Run", "15 Stages Cleared", "Perfect Night"]
};

const ui = {
  board: document.getElementById("board"),
  boardPanel: document.querySelector(".board-panel"),
  boardFrame: document.querySelector(".board-frame"),
  playfieldWrap: document.getElementById("playfieldWrap"),
  boardOverlay: document.getElementById("boardOverlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayDescription: document.getElementById("overlayDescription"),
  startButton: document.getElementById("startButton"),
  timerText: document.getElementById("timerText"),
  stageText: document.getElementById("stageText"),
  targetText: document.getElementById("targetText"),
  scoreText: document.getElementById("scoreText"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  stageNotice: document.getElementById("stageNotice"),
  comboMeterText: document.getElementById("comboMeterText"),
  comboFill: document.getElementById("comboFill"),
  comboNotice: document.getElementById("comboNotice"),
  bestScoreText: document.getElementById("bestScoreText"),
  bestStageText: document.getElementById("bestStageText"),
  stageToast: document.getElementById("stageToast"),
  stageToastKicker: document.getElementById("stageToastKicker"),
  stageToastTitle: document.getElementById("stageToastTitle"),
  stageToastCopy: document.getElementById("stageToastCopy"),
  toolBreaker: document.getElementById("toolBreaker"),
  toolShuffle: document.getElementById("toolShuffle"),
  toolBreakerCount: document.getElementById("toolBreakerCount"),
  toolShuffleCount: document.getElementById("toolShuffleCount")
};

const state = {
  board: [],
  selected: null,
  preview: null,
  swapping: null,
  gesture: null,
  bufferedAction: null,
  lockInput: true,
  running: false,
  gameOver: false,
  score: 0,
  timeLeft: INITIAL_TIME,
  stage: 1,
  chain: 0,
  comboHeat: 0,
  timerId: null,
  stageToastTimerId: null,
  activeTarget: TARGETS[0],
  achievedFinal: false,
  endlessMode: false,
  records: loadRecords(),
  previousPositions: new Map(),
  toolUses: { breaker: 0, shuffle: 0 },
  stageProgressTask: null,
  shuffleReveal: false,
  scaleRafId: null,
  lastPlayfieldScale: 1,
  boardCellSpan: 48
};

function loadRecords() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { bestScore: 0, bestStage: 1 };
    }
    const parsed = JSON.parse(raw);
    return {
      bestScore: Number(parsed.bestScore) || 0,
      bestStage: Number(parsed.bestStage) || 1
    };
  } catch {
    return { bestScore: 0, bestStage: 1 };
  }
}

function saveRecords() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function schedulePlayfieldScaleUpdate() {
  if (state.scaleRafId) {
    return;
  }
  state.scaleRafId = window.requestAnimationFrame(() => {
    state.scaleRafId = null;
    updatePlayfieldScale();
  });
}

function updatePlayfieldScale() {
  if (!ui.playfieldWrap || !ui.boardPanel) {
    return;
  }

  const panelRect = ui.boardPanel.getBoundingClientRect();
  const frameRect = ui.boardFrame.getBoundingClientRect();
  const wrap = ui.playfieldWrap;
  const previousScale = state.lastPlayfieldScale || 1;

  wrap.style.setProperty("--playfield-scale", "1");

  const naturalWidth = wrap.offsetWidth;
  const naturalHeight = wrap.offsetHeight;
  if (!naturalWidth || !naturalHeight) {
    return;
  }

  const availableWidth = Math.max(0, frameRect.width - 4);
  const availableHeight = Math.max(0, panelRect.height - (frameRect.top - panelRect.top) - 4);
  const widthScale = availableWidth / naturalWidth;
  const heightScale = availableHeight / naturalHeight;
  const scale = Math.max(1, Math.min(widthScale, heightScale, 1.04));

  if (Math.abs(scale - previousScale) < 0.005) {
    wrap.style.setProperty("--playfield-scale", previousScale.toFixed(3));
    return;
  }

  state.lastPlayfieldScale = scale;
  wrap.style.setProperty("--playfield-scale", scale.toFixed(3));
  refreshBoardCellSpan();
}

function refreshBoardCellSpan() {
  const cell = ui.board.querySelector(".cell");
  if (!cell) {
    return;
  }
  const rect = cell.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    state.boardCellSpan = Math.min(rect.width, rect.height);
  }
}

function randomItemType() {
  return ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)].key;
}

function getStageTarget(stage) {
  if (stage <= TARGETS.length) {
    return TARGETS[stage - 1];
  }

  let target = TARGETS[TARGETS.length - 1];
  for (let level = TARGETS.length + 1; level <= stage; level += 1) {
    const endlessIndex = level - TARGETS.length;
    target += 8400 + endlessIndex * 1800 + Math.floor(endlessIndex ** 1.22 * 360);
  }
  return target;
}

function getPreviousStageTarget(stage) {
  if (stage <= 1) {
    return 0;
  }
  return getStageTarget(stage - 1);
}

function getTimeBonusForStage(stage) {
  if (stage <= MAX_STAGE) {
    return TIME_BONUS_BY_STAGE[stage - 2] || 3;
  }
  if (stage === MAX_STAGE + 1) {
    return 8;
  }
  if (stage <= MAX_STAGE + 4) {
    return 3;
  }
  if (stage <= MAX_STAGE + 10) {
    return 2;
  }
  return 1;
}

function getArmorStrengthForStage(stage) {
  if (stage >= MAX_STAGE + 8) {
    return 3;
  }
  if (stage >= 9) {
    return 2;
  }
  return 1;
}

function getStageLabel() {
  if (state.endlessMode) {
    return `无尽 ${state.stage - MAX_STAGE}`;
  }
  return `第 ${state.stage} 阶段`;
}

function createTile(type = randomItemType(), special = null) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    special,
    bornAtTop: false,
    armor: 0,
    blockerType: null
  };
}

function maybeAddSpecial(tile, stage = state.stage) {
  if (!tile || tile.special) {
    return tile;
  }
  if (stage < 4) {
    return tile;
  }
  const roll = Math.random();
  const thresholds = stage <= MAX_STAGE
    ? { row: 0.025, col: 0.02, bomb: 0.006, color: 0.002 }
    : { row: 0.03, col: 0.025, bomb: 0.009, color: 0.003 };
  let special = null;
  if (roll < thresholds.color) {
    special = "color";
  } else if (roll < thresholds.color + thresholds.bomb) {
    special = "bomb";
  } else if (roll < thresholds.color + thresholds.bomb + thresholds.row) {
    special = Math.random() < 0.5 ? "row" : "col";
  }
  if (special) {
    tile.special = special;
  }
  return tile;
}

function obstacleChanceForStage(stage) {
  if (stage < OBSTACLE_STAGE_START) {
    return 0;
  }
  if (stage <= MAX_STAGE) {
    return Math.min(0.22, 0.05 + (stage - OBSTACLE_STAGE_START) * 0.016);
  }
  return Math.min(0.34, 0.18 + (stage - MAX_STAGE) * 0.014);
}

function maxObstacleCountForStage(stage) {
  if (stage < OBSTACLE_STAGE_START) {
    return 0;
  }
  if (stage <= MAX_STAGE) {
    return Math.min(9, 2 + Math.floor((stage - OBSTACLE_STAGE_START) * 0.65));
  }
  return Math.min(14, 8 + Math.floor((stage - MAX_STAGE) * 0.55));
}

function countArmoredTiles(board = state.board) {
  let count = 0;
  board.forEach((row) => {
    row.forEach((tile) => {
      if (tile?.armor > 0) {
        count += 1;
      }
    });
  });
  return count;
}

function maybeAddArmor(tile, board = state.board) {
  if (!tile || tile.special || tile.armor > 0 || state.stage < OBSTACLE_STAGE_START) {
    return tile;
  }
  if (countArmoredTiles(board) >= maxObstacleCountForStage(state.stage)) {
    return tile;
  }
  if (Math.random() < obstacleChanceForStage(state.stage)) {
    tile.armor = getArmorStrengthForStage(state.stage);
    tile.blockerType = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)].key;
  }
  return tile;
}

function getBlockerMeta(blockerType) {
  return OBSTACLE_TYPES.find((item) => item.key === blockerType) || OBSTACLE_TYPES[0];
}

function cloneBoard(board) {
  return board.map((row) => row.map((tile) => tile ? { ...tile } : null));
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function swapTiles(board, a, b) {
  const temp = board[a.row][a.col];
  board[a.row][a.col] = board[b.row][b.col];
  board[b.row][b.col] = temp;
}

function generateBoard() {
  let board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      let tile;
      do {
        tile = maybeAddSpecial(createTile());
        board[row][col] = tile;
      } while (createsMatchAt(board, row, col, tile.type));
    }
  }

  while (!hasPossibleMoves(board)) {
    shuffleBoard(board);
  }

  return board;
}

function createsMatchAt(board, row, col, type) {
  const leftA = col > 0 ? board[row][col - 1] : null;
  const leftB = col > 1 ? board[row][col - 2] : null;
  const upA = row > 0 ? board[row - 1][col] : null;
  const upB = row > 1 ? board[row - 2][col] : null;

  return (leftA && leftB && leftA.type === type && leftB.type === type) ||
    (upA && upB && upA.type === type && upB.type === type);
}

function shuffleBoard(board) {
  const flat = board.flat().map((tile) => tile ? { ...tile } : null).filter(Boolean);

  do {
    for (let i = flat.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        board[row][col] = flat[row * BOARD_SIZE + col];
      }
    }
  } while (findMatches(board).groups.length > 0 || !hasPossibleMoves(board));
}

function findMatches(board) {
  const map = new Map();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let runStart = 0;
    for (let col = 1; col <= BOARD_SIZE; col += 1) {
      const current = col < BOARD_SIZE ? board[row][col] : null;
      const startTile = board[row][runStart];
      const matches = current && startTile && current.type === startTile.type;
      if (!matches) {
        const runLength = col - runStart;
        if (startTile && runLength >= 3) {
          const cells = [];
          for (let i = runStart; i < col; i += 1) {
            cells.push({ row, col: i });
          }
          const key = cells.map((cell) => `${cell.row}:${cell.col}`).join("|");
          map.set(key, { cells, orientation: "row", color: startTile.type });
        }
        runStart = col;
      }
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let runStart = 0;
    for (let row = 1; row <= BOARD_SIZE; row += 1) {
      const current = row < BOARD_SIZE ? board[row][col] : null;
      const startTile = board[runStart][col];
      const matches = current && startTile && current.type === startTile.type;
      if (!matches) {
        const runLength = row - runStart;
        if (startTile && runLength >= 3) {
          const cells = [];
          for (let i = runStart; i < row; i += 1) {
            cells.push({ row: i, col });
          }
          const key = cells.map((cell) => `${cell.row}:${cell.col}`).join("|");
          map.set(key, { cells, orientation: "col", color: startTile.type });
        }
        runStart = row;
      }
    }
  }

  const groups = Array.from(map.values());
  const byCell = new Map();

  groups.forEach((group, groupIndex) => {
    group.cells.forEach((cell) => {
      const key = `${cell.row}:${cell.col}`;
      if (!byCell.has(key)) {
        byCell.set(key, []);
      }
      byCell.get(key).push(groupIndex);
    });
  });

  return { groups, byCell };
}

function hasPossibleMoves(board) {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const directions = [
        { row, col: col + 1 },
        { row: row + 1, col }
      ];
      for (const next of directions) {
        if (next.row >= BOARD_SIZE || next.col >= BOARD_SIZE) {
          continue;
        }
        const testBoard = cloneBoard(board);
        swapTiles(testBoard, { row, col }, next);
        if (findMatches(testBoard).groups.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function renderBoard(animateMotion = true) {
  const fragment = document.createDocumentFragment();
  const gestureOffsets = getGestureOffsets();

  state.board.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      const cell = document.createElement("button");
      cell.type = "button";
      if (!tile) {
        cell.className = "cell empty";
        cell.dataset.row = String(rowIndex);
        cell.dataset.col = String(colIndex);
        fragment.appendChild(cell);
        return;
      }

      cell.className = `cell cell-${tile.type}${tile.special ? " special" : ""}${tile.armor > 0 ? " blocked" : ""}`;
      if (state.selected && state.selected.row === rowIndex && state.selected.col === colIndex) {
        cell.classList.add("selected");
      }
      if (state.preview && state.preview.row === rowIndex && state.preview.col === colIndex) {
        cell.classList.add("preview");
      }
      if (
        state.bufferedAction &&
        (
          (state.bufferedAction.from.row === rowIndex && state.bufferedAction.from.col === colIndex) ||
          (state.bufferedAction.to.row === rowIndex && state.bufferedAction.to.col === colIndex)
        )
      ) {
        cell.classList.add("queued");
      }
      if (state.swapping && state.swapping.some((item) => item.row === rowIndex && item.col === colIndex)) {
        cell.classList.add("swapping");
      }
      if (state.shuffleReveal) {
        cell.classList.add("shuffle-reveal");
      }
      cell.dataset.row = String(rowIndex);
      cell.dataset.col = String(colIndex);
      cell.dataset.tileId = tile.id;
      const offset = gestureOffsets.get(`${rowIndex}:${colIndex}`);
      if (offset) {
        cell.style.setProperty("--drag-x", `${offset.x}px`);
        cell.style.setProperty("--drag-y", `${offset.y}px`);
      }

      const itemMeta = ITEM_TYPES.find((item) => item.key === tile.type);
      const blockerMeta = tile.armor > 0 ? getBlockerMeta(tile.blockerType) : null;
      const displayMeta = blockerMeta || itemMeta;
      const artClassName = blockerMeta ? "tile-art blocker-tile-art" : "tile-art";
      const specialTag = tile.special && !blockerMeta
        ? `<span class="special-tag special-tag-${tile.special}" aria-hidden="true"><span class="special-stripe"></span><span class="special-chip">${SPECIAL_LABELS[tile.special]}</span></span>`
        : "";
      cell.innerHTML = `
        ${specialTag}
        <div class="cell-content">
          <img class="${artClassName}" src="${displayMeta.src}" alt="${displayMeta.name}" draggable="false" />
        </div>
      `;
      fragment.appendChild(cell);
    });
  });

  ui.board.replaceChildren(fragment);
  applyTileMotion(animateMotion);
  schedulePlayfieldScaleUpdate();
}

function getGestureOffsets() {
  const offsets = new Map();
  if (!state.gesture || state.swapping) {
    return offsets;
  }

  const deltaX = (state.gesture.lastX ?? state.gesture.startX) - state.gesture.startX;
  const deltaY = (state.gesture.lastY ?? state.gesture.startY) - state.gesture.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const cellSpan = state.boardCellSpan || 48;
  const maxTravel = cellSpan * 0.62;

  const setOffset = (cell, x, y) => {
    offsets.set(`${cell.row}:${cell.col}`, {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    });
  };

  if (state.preview && isAdjacent(state.gesture.origin, state.preview)) {
    const directionX = state.preview.col - state.gesture.origin.col;
    const directionY = state.preview.row - state.gesture.origin.row;
    const distance = directionX !== 0 ? absX : absY;
    const progress = Math.max(0, Math.min(1, distance / Math.max(18, cellSpan * 0.56)));
    const eased = progress * (2 - progress);
    const pull = Math.min(maxTravel, maxTravel * eased);
    setOffset(state.gesture.origin, directionX * pull, directionY * pull);
    setOffset(state.preview, -directionX * pull, -directionY * pull);
    return offsets;
  }

  if (Math.max(absX, absY) < 4) {
    return offsets;
  }

  const horizontal = absX >= absY;
  const directionX = horizontal ? (deltaX >= 0 ? 1 : -1) : 0;
  const directionY = horizontal ? 0 : (deltaY >= 0 ? 1 : -1);
  const distance = horizontal ? absX : absY;
  const pull = Math.min(cellSpan * 0.22, distance * 0.28);
  setOffset(state.gesture.origin, directionX * pull, directionY * pull);
  return offsets;
}

function updateInteractionVisuals() {
  const gestureOffsets = getGestureOffsets();
  const cells = ui.board.querySelectorAll(".cell");

  cells.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const key = `${row}:${col}`;

    cell.classList.toggle("selected", !!state.selected && state.selected.row === row && state.selected.col === col);
    cell.classList.toggle("preview", !!state.preview && state.preview.row === row && state.preview.col === col);
    cell.classList.toggle(
      "queued",
      !!state.bufferedAction &&
      (
        (state.bufferedAction.from.row === row && state.bufferedAction.from.col === col) ||
        (state.bufferedAction.to.row === row && state.bufferedAction.to.col === col)
      )
    );

    const offset = gestureOffsets.get(key);
    if (offset) {
      cell.style.setProperty("--drag-x", `${offset.x}px`);
      cell.style.setProperty("--drag-y", `${offset.y}px`);
    } else {
      cell.style.removeProperty("--drag-x");
      cell.style.removeProperty("--drag-y");
    }
  });
}

function applyTileMotion(animateMotion = true) {
  const nextPositions = new Map();
  const cells = ui.board.querySelectorAll(".cell[data-tile-id]");

  if (!animateMotion) {
    state.previousPositions = nextPositions;
    return;
  }

  cells.forEach((cell) => {
    const id = cell.dataset.tileId;
    const rect = cell.getBoundingClientRect();
    nextPositions.set(id, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  });

  cells.forEach((cell) => {
    const id = cell.dataset.tileId;
    const current = nextPositions.get(id);
    const previous = state.previousPositions.get(id);
    const tile = getTileById(id);

    if (!current) {
      return;
    }

    let dx = 0;
    let dy = 0;

    if (previous) {
      dx = previous.left - current.left;
      dy = previous.top - current.top;
    } else if (tile?.bornAtTop) {
      dy = -(current.height + 10) * (tile.spawnDistance || 1);
    }

    if ((dx || dy) && cell.animate) {
      const isSwap = !!state.swapping && state.swapping.some((item) => item.row === Number(cell.dataset.row) && item.col === Number(cell.dataset.col));
      const duration = isSwap ? 190 : tile?.bornAtTop ? 260 : 200;
      const scale = isSwap ? 1.04 : 1;
      cell.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` },
          { transform: "translate3d(0px, 0px, 0) scale(1)" }
        ],
        {
          duration,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    }
  });

  state.previousPositions = nextPositions;
}

function getTileById(id) {
  for (const row of state.board) {
    for (const tile of row) {
      if (tile?.id === id) {
        return tile;
      }
    }
  }
  return null;
}

function renderHud() {
  ui.timerText.textContent = String(Math.max(0, state.timeLeft));
  ui.timerText.classList.toggle("is-low", state.timeLeft <= 10);
  ui.stageText.textContent = getStageLabel();
  ui.targetText.textContent = String(state.activeTarget);
  ui.scoreText.textContent = String(state.score);

  const previousTarget = getPreviousStageTarget(state.stage);
  const stageBase = state.score - previousTarget;
  const stageGoal = state.activeTarget - previousTarget;
  const stageProgress = Math.max(0, Math.min(stageBase, stageGoal));
  const ratio = stageGoal > 0 ? Math.min(100, (stageProgress / stageGoal) * 100) : 100;

  ui.progressText.textContent = `${Math.max(0, stageBase)} / ${stageGoal}`;
  ui.progressFill.style.width = `${ratio}%`;
  ui.bestScoreText.textContent = String(state.records.bestScore);
  ui.bestStageText.textContent = String(state.records.bestStage);
  ui.comboMeterText.textContent = `x${getComboMultiplier().toFixed(1)}`;
  ui.comboFill.style.width = `${Math.max(0, Math.min(100, state.comboHeat))}%`;
  ui.toolBreakerCount.textContent = String(Math.max(0, TOOL_LIMITS.breaker - state.toolUses.breaker));
  ui.toolShuffleCount.textContent = String(Math.max(0, TOOL_LIMITS.shuffle - state.toolUses.shuffle));
  syncToolButton(ui.toolBreaker, "breaker");
  syncToolButton(ui.toolShuffle, "shuffle");
  schedulePlayfieldScaleUpdate();
}

function syncToolButton(button, key) {
  const remaining = TOOL_LIMITS[key] - state.toolUses[key];
  const ready = remaining > 0;
  button.classList.toggle("is-ready", ready);
  button.disabled = !ready || !state.running || state.lockInput;
}

function getComboMultiplier() {
  if (state.comboHeat >= 85) {
    return 2;
  }
  if (state.comboHeat >= 60) {
    return 1.5;
  }
  if (state.comboHeat >= 30) {
    return 1.2;
  }
  return 1;
}

function addComboHeat(amount) {
  state.comboHeat = Math.min(100, state.comboHeat + amount);
}

function decayComboHeat() {
  const decay = state.stage >= MAX_STAGE + 1 ? 6 : state.stage >= 10 ? 5 : state.stage >= 6 ? 4 : 3;
  state.comboHeat = Math.max(0, state.comboHeat - decay);
}

function showOverlay({ kicker, title, description, buttonLabel }) {
  ui.overlayTitle.textContent = title;
  ui.overlayDescription.innerHTML = description.split("\n").map((line) => `<span class="rule-line">${line}</span>`).join("");
  ui.startButton.textContent = buttonLabel;
  ui.boardOverlay.classList.remove("hidden");
}

function hideOverlay() {
  ui.boardOverlay.classList.add("hidden");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playShuffleAnimation() {
  ui.board.classList.add("is-shuffling");
  const cells = Array.from(ui.board.querySelectorAll(".cell[data-tile-id]"));
  if (cells.length === 0) {
    ui.board.classList.remove("is-shuffling");
    return;
  }

  const animations = cells.map((cell, index) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const x = ((col - 3.5) / 3.5) * 32;
    const y = ((row - 3.5) / 3.5) * 32;
    const rotate = ((index % 2 === 0 ? 1 : -1) * (14 + ((row + col) % 3) * 4));

    return cell.animate(
      [
        { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", opacity: 1, filter: "brightness(1)" },
        { transform: `translate3d(${x * 0.25}px, ${y * 0.25}px, 0) scale(1.05) rotate(${rotate * 0.3}deg)`, opacity: 1, filter: "brightness(1.14)" },
        { transform: `translate3d(${x}px, ${y}px, 0) scale(0.74) rotate(${rotate}deg)`, opacity: 0.24, filter: "brightness(1.22)" }
      ],
      {
        duration: 300,
        delay: Math.abs(row - col) * 10,
        easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
        fill: "forwards"
      }
    ).finished.catch(() => {});
  });

  await Promise.all(animations);
  ui.board.classList.remove("is-shuffling");
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function specialPriority(special) {
  if (special === "color") {
    return 4;
  }
  if (special === "bomb") {
    return 3;
  }
  if (special === "row" || special === "col") {
    return 2;
  }
  return 1;
}

function setSpecialCreation(map, row, col, tile) {
  const key = `${row}:${col}`;
  const current = map.get(key);
  if (!current || specialPriority(tile.special) >= specialPriority(current.tile.special)) {
    map.set(key, { row, col, tile });
  }
}

function broadcast(kind, detail) {
  const choices = BROADCASTS[kind];
  const title = choices[Math.floor(Math.random() * choices.length)];
  ui.stageNotice.textContent = `${title} · ${detail}`;
  updateStatusBanner(kind, title, detail);
}

function updateRecords() {
  const farthestStage = state.stage;
  if (state.score > state.records.bestScore) {
    state.records.bestScore = state.score;
  }
  if (farthestStage > state.records.bestStage) {
    state.records.bestStage = farthestStage;
  }
  saveRecords();
  renderHud();
}

function resetState() {
  state.board = generateBoard();
  state.selected = null;
  state.preview = null;
  state.swapping = null;
  state.gesture = null;
  state.bufferedAction = null;
  state.lockInput = false;
  state.running = true;
  state.gameOver = false;
  state.score = 0;
  state.timeLeft = INITIAL_TIME;
  state.stage = 1;
  state.chain = 0;
  state.comboHeat = 0;
  state.activeTarget = getStageTarget(1);
  state.achievedFinal = false;
  state.endlessMode = false;
  state.previousPositions = new Map();
  state.toolUses = { breaker: 0, shuffle: 0 };
  state.stageProgressTask = null;
  resetStageToast();
  ui.stageNotice.textContent = "完成当前目标即可升到下一阶段并获得加时奖励。";
  ui.comboNotice.textContent = "连续制造消除可提高倍率，第 5 阶后会出现干扰块，后期会越来越硬。";
  renderBoard(false);
  renderHud();
}

function beginTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
  }
  state.timerId = window.setInterval(() => {
    if (!state.running) {
      return;
    }
    state.timeLeft -= 1;
    decayComboHeat();
    renderHud();
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      renderHud();
      endGame(false);
    }
  }, 1000);
}

function getCellFromEventTarget(target) {
  const cell = target.closest(".cell");
  if (!cell) {
    return null;
  }
  return {
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col)
  };
}

function getClientPoint(event) {
  if (event.touches && event.touches[0]) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };
  }
  if (event.changedTouches && event.changedTouches[0]) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY
    };
  }
  return {
    x: event.clientX,
    y: event.clientY
  };
}

function getCellFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) {
    return null;
  }
  return getCellFromEventTarget(element);
}

function handlePointerStart(event) {
  if (state.lockInput || !state.running || state.gameOver) {
    return;
  }
  const startCell = getCellFromEventTarget(event.target);
  if (!startCell) {
    return;
  }

  state.selected = startCell;
  state.preview = null;
  vibrate(8);
  const point = getClientPoint(event);
  refreshBoardCellSpan();
  state.gesture = {
    pointerId: event.pointerId,
    startX: point.x,
    startY: point.y,
    lastX: point.x,
    lastY: point.y,
    origin: startCell,
    swapped: false
  };
  if (event.pointerId !== undefined && event.target.setPointerCapture) {
    try {
      event.target.setPointerCapture(event.pointerId);
    } catch {}
  }
  updateInteractionVisuals();
}

function handlePointerMove(event) {
  if (!state.gesture || state.gesture.pointerId !== event.pointerId || state.gesture.swapped) {
    return;
  }

  const point = getClientPoint(event);
  state.gesture.lastX = point.x;
  state.gesture.lastY = point.y;

  const deltaX = point.x - state.gesture.startX;
  const deltaY = point.y - state.gesture.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const hoverCell = getCellFromPoint(point.x, point.y);

  let preview = null;
  if (hoverCell && isAdjacent(state.gesture.origin, hoverCell)) {
    preview = hoverCell;
  } else if (Math.max(absX, absY) >= 10) {
    const direction = absX > absY
      ? { row: 0, col: deltaX > 0 ? 1 : -1 }
      : { row: deltaY > 0 ? 1 : -1, col: 0 };
    const target = {
      row: state.gesture.origin.row + direction.row,
      col: state.gesture.origin.col + direction.col
    };
    if (target.row >= 0 && target.row < BOARD_SIZE && target.col >= 0 && target.col < BOARD_SIZE) {
      preview = target;
    }
  }

  const changed = (!state.preview && preview) ||
    (state.preview && !preview) ||
    (state.preview && preview && (state.preview.row !== preview.row || state.preview.col !== preview.col));

  if (changed) {
    state.preview = preview;
    updateInteractionVisuals();
  }
}

function clearGestureSelection(shouldRender = true) {
  state.selected = null;
  state.preview = null;
  state.gesture = null;
  if (shouldRender) {
    updateInteractionVisuals();
  }
}

function clearBufferedActionVisuals(shouldRender = false) {
  if (!state.bufferedAction) {
    return;
  }
  state.bufferedAction = null;
  if (shouldRender) {
    updateInteractionVisuals();
  }
}

function queueBufferedSwap(from, to) {
  state.bufferedAction = { type: "swap", from, to };
  ui.comboNotice.textContent = "已缓存下一步，棋盘稳定后会立刻出手。";
  updateInteractionVisuals();
}

function flushBufferedAction() {
  if (state.lockInput || !state.running || state.gameOver || !state.bufferedAction) {
    return;
  }

  const action = state.bufferedAction;
  state.bufferedAction = null;
  updateInteractionVisuals();

  resolvePlayerSwap(action.from, action.to);
}

function handlePointerEnd(event) {
  if (!state.gesture) {
    return;
  }

  const point = getClientPoint(event);
  const from = state.gesture.origin;
  const hoverCell = getCellFromPoint(point.x, point.y);
  const deltaX = (state.gesture.lastX ?? point.x) - state.gesture.startX;
  const deltaY = (state.gesture.lastY ?? point.y) - state.gesture.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  let target = null;
  if (hoverCell && isAdjacent(from, hoverCell)) {
    target = hoverCell;
  } else if (Math.max(absX, absY) >= 10) {
    target = absX > absY
      ? { row: from.row, col: from.col + (deltaX > 0 ? 1 : -1) }
      : { row: from.row + (deltaY > 0 ? 1 : -1), col: from.col };
  }

  clearGestureSelection();

  if (!target) {
    if (state.lockInput) {
      clearGestureSelection();
    }
    return;
  }
  if (target.row < 0 || target.row >= BOARD_SIZE || target.col < 0 || target.col >= BOARD_SIZE) {
    if (state.lockInput) {
      clearGestureSelection();
    }
    return;
  }

  if (state.lockInput) {
    clearGestureSelection(false);
    vibrate(8);
    queueBufferedSwap(from, target);
    return;
  }

  clearBufferedActionVisuals();
  clearGestureSelection();
  vibrate(10);
  resolvePlayerSwap(from, target);
}

async function resolvePlayerSwap(a, b) {
  state.lockInput = true;
  try {
    const tileA = state.board[a.row]?.[a.col];
    const tileB = state.board[b.row]?.[b.col];
    if (!tileA || !tileB) {
      return;
    }

    state.swapping = [a, b];
    await animateSwapCells(a, b, false);
    swapTiles(state.board, a, b);
    state.swapping = null;
    renderBoard(false);

    let validMove = false;
    if (tileA.special === "color" || tileB.special === "color") {
      validMove = true;
      await triggerColorSwap(a, b, tileA, tileB);
    } else {
      const matches = findMatches(state.board);
      if (matches.groups.length > 0) {
        validMove = true;
        await resolveCascade(matches, [a, b]);
      } else if (tileA.special || tileB.special) {
        validMove = true;
        await triggerSpecialSwap(a, b, tileA, tileB);
      }
    }

    if (!validMove) {
      state.swapping = [a, b];
      await animateSwapCells(a, b, true);
      state.swapping = null;
      vibrate([18, 36, 18]);
      broadcast("fail", "这次换位没有形成有效进攻。");
    }

    ensurePlayableBoard();
  } finally {
    state.swapping = null;
    state.lockInput = false;
    flushBufferedAction();
  }
}

function animateSwapCells(a, b, reversing = false) {
  const duration = 190;
  const ease = "cubic-bezier(0.22, 0.88, 0.26, 1)";
  const sourceA = ui.board.querySelector(`.cell[data-row="${a.row}"][data-col="${a.col}"]`);
  const sourceB = ui.board.querySelector(`.cell[data-row="${b.row}"][data-col="${b.col}"]`);
  if (!sourceA || !sourceB) {
    return Promise.resolve();
  }

  const layer = document.createElement("div");
  layer.className = "swap-layer";
  const rectA = sourceA.getBoundingClientRect();
  const rectB = sourceB.getBoundingClientRect();
  const isHorizontal = a.row === b.row;
  const lane = Math.max(10, Math.min(rectA.width, rectA.height) * 0.16);
  const horizontalDrift = 0.08;
  const horizontalScale = 1.003;

  const buildGhost = (source, rect, startRect, endRect) => {
    const ghost = source.cloneNode(true);
    ghost.classList.remove("selected", "preview", "queued", "swapping", "shuffle-reveal");
    ghost.classList.add("swap-ghost");
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.opacity = "1";
    return ghost;
  };

  const ghostA = buildGhost(sourceA, rectA);
  const ghostB = buildGhost(sourceB, rectB);
  sourceA.classList.add("swap-hidden");
  sourceB.classList.add("swap-hidden");
  layer.appendChild(ghostA);
  layer.appendChild(ghostB);
  document.body.appendChild(layer);

  const animA = ghostA.animate(
    [
      { transform: "translate3d(0, 0, 0) scale(1)", filter: "brightness(1)" },
      {
        transform: isHorizontal
          ? `translate3d(${(rectB.left - rectA.left) * horizontalDrift}px, 0px, 0) scale(${horizontalScale})`
          : `translate3d(${-lane}px, ${(rectB.top - rectA.top) * 0.28}px, 0) scale(1.01)`,
        offset: reversing ? 0.44 : 0.38,
        filter: "brightness(1.03)"
      },
      {
        transform: reversing
          ? "translate3d(0, 0, 0) scale(1)"
          : isHorizontal
            ? `translate3d(${rectB.left - rectA.left}px, 0px, 0) scale(1)`
            : `translate3d(0px, ${rectB.top - rectA.top}px, 0) scale(1)`,
        filter: "brightness(1)"
      }
    ],
    { duration, easing: ease, fill: "forwards" }
  );

  const animB = ghostB.animate(
    [
      { transform: "translate3d(0, 0, 0) scale(1)", filter: "brightness(1)" },
      {
        transform: isHorizontal
          ? `translate3d(${(rectA.left - rectB.left) * horizontalDrift}px, 0px, 0) scale(${horizontalScale})`
          : `translate3d(${lane}px, ${(rectA.top - rectB.top) * 0.28}px, 0) scale(1.01)`,
        offset: reversing ? 0.44 : 0.38,
        filter: "brightness(1.03)"
      },
      {
        transform: reversing
          ? "translate3d(0, 0, 0) scale(1)"
          : isHorizontal
            ? `translate3d(${rectA.left - rectB.left}px, 0px, 0) scale(1)`
            : `translate3d(0px, ${rectA.top - rectB.top}px, 0) scale(1)`,
        filter: "brightness(1)"
      }
    ],
    { duration, easing: ease, fill: "forwards" }
  );

  return Promise.all([animA.finished, animB.finished]).catch(() => {}).finally(() => {
    ghostA.remove();
    ghostB.remove();
    sourceA.classList.remove("swap-hidden");
    sourceB.classList.remove("swap-hidden");
    layer.remove();
  });
}

async function triggerColorSwap(a, b, tileA, tileB) {
  const targets = new Set();
  if (tileA.special === "color" && tileB.special === "color") {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        targets.add(`${row}:${col}`);
      }
    }
  } else {
    const chosenType = tileA.special === "color" ? tileB.type : tileA.type;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col].type === chosenType || (row === a.row && col === a.col) || (row === b.row && col === b.col)) {
          targets.add(`${row}:${col}`);
        }
      }
    }
  }
  broadcast("special", "VAR 回看球启动，整类元素被清空。");
  await clearCells(targets, { chain: 1, includeSpecialChain: true });
  await refillBoard();
  await resolveCascade(findMatches(state.board), [a, b]);
}

async function triggerSpecialSwap(a, b, tileA, tileB) {
  const targets = new Set();
  expandSpecialEffect(targets, a, tileA);
  expandSpecialEffect(targets, b, tileB);
  targets.add(`${a.row}:${a.col}`);
  targets.add(`${b.row}:${b.col}`);
  broadcast("special", "特殊球联动触发，大范围清除。");
  await clearCells(targets, { chain: 1, includeSpecialChain: true });
  await refillBoard();
  await resolveCascade(findMatches(state.board), [a, b]);
}

function ensurePlayableBoard() {
  if (findMatches(state.board).groups.length === 0 && !hasPossibleMoves(state.board)) {
    shuffleBoard(state.board);
    state.previousPositions = new Map();
    renderBoard();
    broadcast("special", "无解棋盘已自动洗牌，比赛继续。");
  }
}

async function resolveCascade(initialMatches, swapCells) {
  let matches = initialMatches;
  let chainIndex = 0;

  while (matches.groups.length > 0) {
    chainIndex += 1;
    state.chain = chainIndex;
    await applyMatchSet(matches, swapCells, chainIndex);
    await refillBoard();
    matches = findMatches(state.board);
    swapCells = [];
  }

  state.chain = 0;
  if (state.running && !state.gameOver) {
    scheduleStageProgressEvaluation();
  }
}

function scheduleStageProgressEvaluation() {
  if (state.stageProgressTask) {
    return state.stageProgressTask;
  }

  state.stageProgressTask = (async () => {
    try {
      await evaluateStageProgress();
    } finally {
      state.stageProgressTask = null;
    }
  })();

  return state.stageProgressTask;
}

async function applyMatchSet(matchData, swapCells, chainIndex) {
  const cellsToClear = new Set();
  const specialsToCreate = new Map();
  const groupCount = matchData.groups.length;

  matchData.groups.forEach((group) => {
    group.cells.forEach((cell) => cellsToClear.add(`${cell.row}:${cell.col}`));
  });

  const intersections = new Map();
  matchData.byCell.forEach((groupIndexes, key) => {
    if (groupIndexes.length >= 2) {
      intersections.set(key, groupIndexes);
    }
  });

  if (intersections.size > 0) {
    intersections.forEach((_, key) => {
      const [row, col] = key.split(":").map(Number);
      const sourceTile = state.board[row][col];
      setSpecialCreation(specialsToCreate, row, col, createTile(sourceTile.type, "bomb"));
      cellsToClear.delete(key);
    });
  }

  matchData.groups.forEach((group) => {
    if (group.cells.length >= 5) {
      const anchor = chooseSpecialAnchor(group.cells, swapCells);
      const sourceTile = state.board[anchor.row][anchor.col];
      setSpecialCreation(specialsToCreate, anchor.row, anchor.col, createTile(sourceTile.type, "color"));
      cellsToClear.delete(`${anchor.row}:${anchor.col}`);
    } else if (group.cells.length === 4) {
      const anchor = chooseSpecialAnchor(group.cells, swapCells);
      const sourceTile = state.board[anchor.row][anchor.col];
      const specialType = group.orientation === "row" ? "row" : "col";
      setSpecialCreation(specialsToCreate, anchor.row, anchor.col, createTile(sourceTile.type, specialType));
      cellsToClear.delete(`${anchor.row}:${anchor.col}`);
    }
  });

  const clearTargets = collectSpecialChainTargets(cellsToClear);

  markCellsMatching(clearTargets);
  const clearedCount = clearTargets.size;
  const baseScore = clearedCount * 70;
  const chainBonus = chainIndex > 1 ? Math.round(baseScore * 0.35 * (chainIndex - 1)) : 0;
  const groupBonus = Math.max(0, groupCount - 1) * 160;
  const specialBonus = specialsToCreate.size * 240;
  const comboMultiplier = getComboMultiplier();
  const totalGain = Math.round((baseScore + chainBonus + groupBonus + specialBonus) * comboMultiplier);
  state.score += totalGain;
  addComboHeat(14 + chainIndex * 6 + specialsToCreate.size * 4);
  if (chainIndex > 1 || specialsToCreate.size > 0) {
    vibrate(chainIndex > 2 ? [20, 30, 20] : 16);
  }
  renderHud();
  ui.comboNotice.textContent = state.stage >= OBSTACLE_STAGE_START
    ? `当前倍率 x${comboMultiplier.toFixed(1)}，干扰块会吸收 ${getArmorStrengthForStage(state.stage)} 次命中。`
    : `当前倍率 x${comboMultiplier.toFixed(1)}，热度越高得分越高。`;

  if (chainIndex > 1) {
    broadcast("chain", `连锁 ${chainIndex} 段，获得 ${totalGain} 分。`);
  } else if (specialsToCreate.size > 0) {
    broadcast("special", `生成 ${specialsToCreate.size} 个特殊球，进攻火力升级。`);
  } else {
    broadcast("match", `消除 ${clearedCount} 格，获得 ${totalGain} 分。`);
  }

  await sleep(110);

  clearTargets.forEach((key) => {
    const [row, col] = key.split(":").map(Number);
    const tile = state.board[row][col];
    if (!tile) {
      return;
    }
    if (tile.armor > 0) {
      tile.armor -= 1;
      if (tile.armor === 0) {
        tile.blockerType = null;
        broadcast("special", "干扰层已被打碎，该格重新回到可清除状态。");
      }
      return;
    }
    state.board[row][col] = null;
  });

  specialsToCreate.forEach(({ row, col, tile }) => {
    state.board[row][col] = tile;
  });

  renderBoard();
  await sleep(70);
}

function chooseSpecialAnchor(cells, swapCells) {
  for (const swapCell of swapCells) {
    if (cells.some((cell) => cell.row === swapCell.row && cell.col === swapCell.col)) {
      return swapCell;
    }
  }
  return cells[Math.floor(cells.length / 2)];
}

function markCellsMatching(targets) {
  const cells = ui.board.querySelectorAll(".cell");
  cells.forEach((cell) => {
    const key = `${cell.dataset.row}:${cell.dataset.col}`;
    if (targets.has(key)) {
      cell.classList.add("matching");
    }
  });
}

function expandSpecialEffect(targets, cell, tile) {
  if (!tile?.special) {
    return;
  }
  if (tile.special === "row") {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      targets.add(`${cell.row}:${col}`);
    }
  } else if (tile.special === "col") {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      targets.add(`${row}:${cell.col}`);
    }
  } else if (tile.special === "bomb") {
    for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
      for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
        if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
          targets.add(`${row}:${col}`);
        }
      }
    }
  } else if (tile.special === "color") {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col]?.type === tile.type) {
          targets.add(`${row}:${col}`);
        }
      }
    }
  }
}

function collectSpecialChainTargets(targetKeys) {
  const clearTargets = new Set(targetKeys);
  const queue = [...clearTargets];
  const visited = new Set();

  while (queue.length > 0) {
    const key = queue.shift();
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    const [row, col] = key.split(":").map(Number);
    const tile = state.board[row][col];
    if (!tile?.special) {
      continue;
    }
    const beforeSize = clearTargets.size;
    expandSpecialEffect(clearTargets, { row, col }, tile);
    if (clearTargets.size !== beforeSize) {
      clearTargets.forEach((nextKey) => {
        if (!visited.has(nextKey)) {
          queue.push(nextKey);
        }
      });
    }
  }

  return clearTargets;
}

async function clearCells(targetKeys, options = {}) {
  const clearTargets = options.includeSpecialChain
    ? collectSpecialChainTargets(targetKeys)
    : new Set(targetKeys);
  if (!options.includeSpecialChain) {
    const expanded = collectSpecialChainTargets(clearTargets);
    clearTargets.clear();
    expanded.forEach((key) => clearTargets.add(key));
  }

  markCellsMatching(clearTargets);
  await sleep(180);

  const clearCount = clearTargets.size;
  const chain = options.chain || 1;
  const scoreGain = Math.round((clearCount * 90 + (chain > 1 ? chain * 100 : 0)) * getComboMultiplier());
  state.score += scoreGain;
  addComboHeat(10 + chain * 4);
  vibrate(14);
  renderHud();

  clearTargets.forEach((key) => {
    const [row, col] = key.split(":").map(Number);
    state.board[row][col] = null;
  });
  renderBoard();
  await sleep(120);
}

async function refillBoard() {
  const nextBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const stack = [];
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const tile = state.board[row][col];
      if (tile) {
        stack.push(tile);
      }
    }

    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const tile = stack[BOARD_SIZE - 1 - row] || null;
      if (tile) {
        nextBoard[row][col] = {
          ...tile,
          bornAtTop: false
        };
      }
    }
  }

  state.board = nextBoard;
  renderBoard();
  await sleep(110);

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let spawnDistance = 1;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      if (!state.board[row][col]) {
        state.board[row][col] = {
          ...maybeAddArmor(maybeAddSpecial(createTile())),
          bornAtTop: true,
          spawnDistance
        };
        spawnDistance += 1;
      }
    }
  }

  renderBoard();
  await sleep(150);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (state.board[row][col]) {
        state.board[row][col].bornAtTop = false;
        delete state.board[row][col].spawnDistance;
      }
    }
  }

  renderBoard();
}

async function evaluateStageProgress() {
  while (state.score >= state.activeTarget && state.running) {
    state.stage += 1;
    if (state.stage === MAX_STAGE + 1) {
      state.achievedFinal = true;
      state.endlessMode = true;
    }
    const timeBonus = getTimeBonusForStage(state.stage);
    state.timeLeft += timeBonus;
    state.activeTarget = getStageTarget(state.stage);
    if (state.endlessMode && state.stage === MAX_STAGE + 1) {
      ui.stageNotice.textContent = `15 阶挑战完成，已进入无尽模式，倒计时 +${timeBonus} 秒。`;
      showStageToast("挑战完成", `无尽模式开启 +${timeBonus} 秒`, "ENDLESS");
    } else {
      ui.stageNotice.textContent = `已进入${getStageLabel()}，倒计时 +${timeBonus} 秒，目标继续抬升。`;
      showStageToast(getStageLabel(), `加时 +${timeBonus} 秒`, state.endlessMode ? "ENDLESS" : "TARGET CLEARED");
      broadcast("stage", `推进到${getStageLabel()}，倒计时增加 ${timeBonus} 秒。`);
    }
    vibrate([28, 40, 28]);
    renderHud();
    updateRecords();
    await sleep(120);
  }
}

function showStageToast(title, copy, kicker = "STAGE UP") {
  if (state.stageToastTimerId) {
    window.clearTimeout(state.stageToastTimerId);
  }
  ui.stageToastKicker.textContent = kicker;
  ui.stageToastTitle.textContent = title;
  ui.stageToastCopy.textContent = copy;
  ui.stageToast.classList.remove("flash");
  void ui.stageToast.offsetWidth;
  ui.stageToast.classList.add("flash");
  state.stageToastTimerId = window.setTimeout(() => {
    ui.stageToast.classList.remove("flash");
  }, 900);
}

function resetStageToast() {
  if (state.stageToastTimerId) {
    window.clearTimeout(state.stageToastTimerId);
    state.stageToastTimerId = null;
  }
  ui.stageToast.classList.remove("flash");
  ui.stageToastKicker.textContent = "MATCH READY";
  ui.stageToastTitle.textContent = "等待连击";
  ui.stageToastCopy.textContent = "滑动相邻元素完成 3 消，冲击更高阶段。";
}

function updateStatusBanner(kind, title, detail) {
  if (kind === "chain") {
    showStageToast(title, detail, "CHAIN");
    return;
  }
  if (kind === "stage") {
    showStageToast(title, detail, "STAGE UP");
    return;
  }
  if (kind === "special") {
    showStageToast(title, detail, "SPECIAL");
    return;
  }
  if (kind === "fail") {
    showStageToast(title, detail, "MISS");
    return;
  }
  if (kind === "victory") {
    showStageToast(title, detail, "VICTORY");
    return;
  }
  showStageToast(title, detail, "MATCH");
}

async function useBreakerTool() {
  if (!state.running || state.gameOver || state.lockInput || state.toolUses.breaker >= TOOL_LIMITS.breaker) {
    return;
  }
  state.lockInput = true;
  try {
    const targets = new Set();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col]?.armor > 0) {
          targets.add(`${row}:${col}`);
        }
      }
    }
    if (targets.size === 0) {
      state.lockInput = false;
      ui.comboNotice.textContent = "当前盘面没有干扰块，破障道具已保留。";
      renderHud();
      return;
    }
    state.toolUses.breaker += 1;
    renderHud();
    broadcast("special", `破障道具发动，清除了 ${targets.size} 个干扰块。`);
    ui.comboNotice.textContent = "破障已生效，盘面压力暂时下降，适合继续追连锁。";
    await clearCells(targets, { chain: 2, includeSpecialChain: false });
    await refillBoard();
    await resolveCascade(findMatches(state.board), []);
  } finally {
    state.lockInput = false;
    flushBufferedAction();
  }
}

async function useShuffleTool() {
  if (!state.running || state.gameOver || state.lockInput || state.toolUses.shuffle >= TOOL_LIMITS.shuffle) {
    return;
  }
  state.lockInput = true;
  clearBufferedActionVisuals(true);
  try {
    state.toolUses.shuffle += 1;
    renderHud();
    await playShuffleAnimation();
    shuffleBoard(state.board);
    state.shuffleReveal = true;
    renderBoard();
    await sleep(320);
    state.shuffleReveal = false;
    renderBoard();
    broadcast("special", "重排道具发动，盘面已重新洗开。");
    ui.comboNotice.textContent = "重排已使用，特殊块与干扰块位置都会被重新打散。";
    renderHud();
  } finally {
    state.lockInput = false;
    flushBufferedAction();
  }
}

function endGame(victory) {
  if (state.gameOver) {
    return;
  }
  state.running = false;
  state.gameOver = true;
  state.lockInput = true;
  state.gesture = null;
  state.selected = null;
  state.bufferedAction = null;
  resetStageToast();
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  updateRecords();

  if (victory) {
    vibrate([30, 50, 30, 50, 30]);
    broadcast("victory", `你完成了 ${MAX_STAGE} 阶挑战并进入无尽模式。`);
    showOverlay({
      kicker: "冠军之夜",
      title: "挑战完成",
      description: `最终得分 ${state.score} 分，你已经打入无尽模式并刷新了阶段纪录。`,
      buttonLabel: "再开一局"
    });
  } else {
    vibrate([24, 60, 24]);
    broadcast("fail", `时间耗尽，最终得分 ${state.score} 分。`);
    showOverlay({
      kicker: "比赛结束",
      title: "时间到",
      description: `你推进到第 ${state.stage} 阶段，最终得分 ${state.score} 分。点击重新开始继续冲纪录。`,
      buttonLabel: "重新开始"
    });
  }
}

function startGame() {
  hideOverlay();
  resetState();
  beginTimer();
}

ui.startButton.addEventListener("click", startGame);
ui.toolBreaker.addEventListener("click", useBreakerTool);
ui.toolShuffle.addEventListener("click", useShuffleTool);
ui.board.addEventListener("pointerdown", handlePointerStart);
window.addEventListener("pointermove", handlePointerMove, { passive: true });
window.addEventListener("pointerup", handlePointerEnd, { passive: true });
window.addEventListener("pointercancel", handlePointerEnd, { passive: true });
window.addEventListener("resize", schedulePlayfieldScaleUpdate);

if (!window.PointerEvent) {
  ui.board.addEventListener("touchstart", handlePointerStart, { passive: true });
  window.addEventListener("touchmove", handlePointerMove, { passive: true });
  window.addEventListener("touchend", handlePointerEnd, { passive: true });
  window.addEventListener("touchcancel", handlePointerEnd, { passive: true });
}

showOverlay({
  kicker: "规则说明",
  title: "表情包消消乐",
  description: `滑动相邻方块，3 个及以上即可消除并得分。
4 连会生成横扫或纵扫，触发后清一整行或一整列。
5 连会生成全清块；和任意普通块交换，会清空该类型全部方块；两个全清互换会清全盘。
T 型、L 型或十字交叉消除会生成爆裂块，触发后清除 3x3 范围。
第 5 阶开始出现干扰块，会先吸收命中再被打碎：中期 1 次，后期 2 次，无尽后期 3 次。
连击热度达到 30 / 60 / 85 时，倍率提升到 x1.2 / x1.5 / x2.0；停顿过久热度会下降。
每阶段都有目标分，达标立刻加时升段；倒计时归零就结束，打穿 15 阶后进入无尽模式。`,
  buttonLabel: "开始挑战"
});

state.board = generateBoard();
renderBoard();
renderHud();
schedulePlayfieldScaleUpdate();
