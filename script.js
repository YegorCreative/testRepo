const canvas = document.getElementById("game");
const context = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const speedElement = document.getElementById("speed");
const boostElement = document.getElementById("boost");
const multElement = document.getElementById("mult");
const statusElement = document.getElementById("status");
const screenShellElement = document.querySelector(".screen-shell");
const touchPanel = document.querySelector(".touch-panel");
const overlayElement = document.getElementById("overlay");
const overlayKickerElement = document.getElementById("overlay-kicker");
const overlayTitleElement = document.getElementById("overlay-title");
const overlayCopyElement = document.getElementById("overlay-copy");
const overlayButtonElement = document.getElementById("overlay-button");

const gridSize = 16;
const tileCount = canvas.width / gridSize;
const baseTickMs = 150;
const minTickMs = 70;
const boostDurationMs = 45000;
const boostTickReduction = 35;
const boostStackDurationMs = 20000;
const maxBoostDurationMs = 120000;
const boostWarningMs = 5000;
const bonusFoodInterval = 4;
const bonusFoodLifetimeMs = 9000;
const turboScoreMultiplier = 2;
const scoreRushDurationMs = 15000;
const scoreRushMultiplier = 3;

const BONUS_TYPES = [
    {
        id: "turbo",
        label: "Turbo",
        color: "#ff7a3d",
        highlightColor: "#ffd8c2",
        baseScore: 50,
    },
    {
        id: "rush",
        label: "Rush",
        color: "#cc44ff",
        highlightColor: "#eeb2ff",
        baseScore: 30,
    },
    {
        id: "mega",
        label: "Mega",
        color: "#22ddff",
        highlightColor: "#b2f4ff",
        baseScore: 120,
    },
];

let bestScore = Number.parseInt(localStorage.getItem("retro-snake-best") || "0", 10);
let tickDelay = baseTickMs;
let lastFrameTime = 0;
let accumulator = 0;
let gameStarted = false;
let gameOver = false;
let isPaused = false;
let audioContext;
let elapsedGameTime = 0;
let speedBoostUntil = 0;
let normalTickDelay = baseTickMs;
let foodsEaten = 0;
let scoreRushUntil = 0;
let lastWarningSecond = -1;

let snake;
let direction;
let pendingDirection;
let food;
let bonusFood;
let bonusFoodExpiresAt = 0;
let score;

bestScoreElement.textContent = String(bestScore);

function playTone(frequency, duration, volume, type = "square") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        return;
    }

    if (!audioContext) {
        audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const startAt = audioContext.currentTime;
    const endAt = startAt + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(startAt);
    oscillator.stop(endAt);
}

function playStartSound() {
    playTone(330, 0.08, 0.03);
    playTone(440, 0.12, 0.025, "triangle");
}

function playFoodSound() {
    playTone(520, 0.06, 0.025);
    playTone(660, 0.08, 0.02, "triangle");
}

function playPauseSound() {
    playTone(isPaused ? 220 : 320, 0.07, 0.02, "sawtooth");
}

function playGameOverSound() {
    playTone(190, 0.18, 0.03, "sawtooth");
    playTone(150, 0.24, 0.025, "triangle");
}

function playBoostSound() {
    playTone(720, 0.06, 0.03, "triangle");
    playTone(880, 0.1, 0.028);
}

function playScoreRushSound() {
    playTone(880, 0.05, 0.025, "triangle");
    playTone(1100, 0.08, 0.022, "triangle");
    playTone(1320, 0.1, 0.02, "triangle");
}

function playMegaSound() {
    playTone(440, 0.05, 0.025);
    playTone(660, 0.07, 0.022);
    playTone(880, 0.09, 0.02, "triangle");
}

function playWarningTickSound() {
    playTone(440, 0.04, 0.022, "square");
}

function randomFoodPosition(extraBlockedTiles = []) {
    let nextFood;

    do {
        nextFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount),
        };
    } while (
        snake.some((segment) => segment.x === nextFood.x && segment.y === nextFood.y)
        || extraBlockedTiles.some((tile) => tile.x === nextFood.x && tile.y === nextFood.y)
    );

    return nextFood;
}

function getCurrentTickDelay() {
    if (elapsedGameTime < speedBoostUntil) {
        return Math.max(minTickMs, normalTickDelay - boostTickReduction);
    }

    return normalTickDelay;
}

function maybeSpawnBonusFood() {
    if (bonusFood || foodsEaten === 0 || foodsEaten % bonusFoodInterval !== 0) {
        return;
    }

    const type = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
    const position = randomFoodPosition([food]);
    bonusFood = { x: position.x, y: position.y, type };
    bonusFoodExpiresAt = elapsedGameTime + bonusFoodLifetimeMs;
}

function clearBonusFood() {
    bonusFood = null;
    bonusFoodExpiresAt = 0;
}

function activateTurbo() {
    if (elapsedGameTime < speedBoostUntil) {
        speedBoostUntil = Math.min(speedBoostUntil + boostStackDurationMs, elapsedGameTime + maxBoostDurationMs);
        statusElement.textContent = "Turbo extended by 20 seconds.";
    } else {
        speedBoostUntil = elapsedGameTime + boostDurationMs;
        lastWarningSecond = -1;
        statusElement.textContent = "Turbo mode for 45 seconds.";
    }

    playBoostSound();
    updateTurboState();
}

function applyBonusFoodEffect(bonusType) {
    const earned = getScoreValue(bonusType.baseScore);
    score += earned;

    if (bonusType.id === "turbo") {
        activateTurbo();
    } else if (bonusType.id === "rush") {
        scoreRushUntil = elapsedGameTime + scoreRushDurationMs;
        statusElement.textContent = `Score Rush! x${scoreRushMultiplier} points for 15 seconds.`;
        playScoreRushSound();
    } else if (bonusType.id === "mega") {
        statusElement.textContent = `Mega fruit! +${earned} pts.`;
        playMegaSound();
    }
}

function updateTurboState() {
    const turboRemainingMs = speedBoostUntil - elapsedGameTime;
    const turboActive = turboRemainingMs > 0;
    const turboWarning = turboRemainingMs > 0 && turboRemainingMs <= boostWarningMs;

    screenShellElement.classList.toggle("turbo-active", turboActive && !turboWarning);
    screenShellElement.classList.toggle("turbo-warning", turboWarning);

    if (turboWarning) {
        const secondsLeft = Math.ceil(turboRemainingMs / 1000);

        if (secondsLeft !== lastWarningSecond) {
            lastWarningSecond = secondsLeft;
            playWarningTickSound();
        }
    }
}

function getActiveMultiplier() {
    let mult = 1;

    if (elapsedGameTime < speedBoostUntil) {
        mult *= turboScoreMultiplier;
    }

    if (elapsedGameTime < scoreRushUntil) {
        mult *= scoreRushMultiplier;
    }

    return mult;
}

function getScoreValue(basePoints) {
    return basePoints * getActiveMultiplier();
}

function resetGame() {
    snake = [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 10, y: 12 },
    ];
    direction = { x: 1, y: 0 };
    pendingDirection = direction;
    food = randomFoodPosition();
    bonusFood = null;
    bonusFoodExpiresAt = 0;
    score = 0;
    tickDelay = baseTickMs;
    normalTickDelay = baseTickMs;
    accumulator = 0;
    lastFrameTime = 0;
    elapsedGameTime = 0;
    speedBoostUntil = 0;
    foodsEaten = 0;
    gameOver = false;
    isPaused = false;
    scoreElement.textContent = "0";
    speedElement.textContent = "1";
    boostElement.textContent = "Off";
    multElement.textContent = "x1";
    multElement.style.color = "";
    scoreRushUntil = 0;
    lastWarningSecond = -1;
    statusElement.textContent = gameStarted
        ? "Collect blocks. Avoid walls and yourself."
        : "Press Enter to start";
    updateOverlay();
    updateTurboState();
    draw();
}

function updateOverlay() {
    overlayElement.className = "overlay";

    if (!gameStarted) {
        overlayElement.classList.add("overlay-start", "is-visible");
        overlayKickerElement.textContent = "Arcade Classic";
        overlayTitleElement.textContent = "Retro Snake";
        overlayCopyElement.textContent = "Eat the blocks. Avoid the walls. Survive longer than the last run.";
        overlayButtonElement.textContent = "Press Start";
        return;
    }

    if (gameOver) {
        overlayElement.classList.add("overlay-gameover", "is-visible");
        overlayKickerElement.textContent = "Transmission Lost";
        overlayTitleElement.textContent = "Game Over";
        overlayCopyElement.textContent = `Final score ${score}. Press Enter or tap below for another run.`;
        overlayButtonElement.textContent = "Play Again";
        return;
    }
}

function startGame() {
    resetGame();
    gameStarted = true;
    statusElement.textContent = "Game running.";
    playStartSound();
    updateOverlay();
}

function updateHud() {
    scoreElement.textContent = String(score);

    tickDelay = getCurrentTickDelay();

    const speedLevel = Math.max(1, Math.floor((baseTickMs - tickDelay) / 10) + 1);
    speedElement.textContent = String(speedLevel);

    if (elapsedGameTime < speedBoostUntil) {
        const secondsLeft = Math.ceil((speedBoostUntil - elapsedGameTime) / 1000);
        boostElement.textContent = `${secondsLeft}s`;

        if (speedBoostUntil - elapsedGameTime <= boostWarningMs) {
            statusElement.textContent = "Turbo ending. Make this run count.";
        }
    } else {
        boostElement.textContent = "Off";
    }

    const activeMult = getActiveMultiplier();
    multElement.textContent = `x${activeMult}`;
    multElement.style.color = activeMult > 1 ? "#f9db70" : "";

    updateTurboState();

    if (score > bestScore) {
        bestScore = score;
        bestScoreElement.textContent = String(bestScore);
        localStorage.setItem("retro-snake-best", String(bestScore));
    }
}

function setDirection(nextX, nextY) {
    if (direction.x === -nextX && direction.y === -nextY) {
        return;
    }

    pendingDirection = { x: nextX, y: nextY };
}

function togglePause() {
    if (!gameStarted || gameOver) {
        return;
    }

    isPaused = !isPaused;
    statusElement.textContent = isPaused ? "Paused." : "Game running.";
    playPauseSound();
    draw();
}

function handleDirectionInput(nextDirection) {
    if (!gameStarted || gameOver || isPaused) {
        return;
    }

    if (nextDirection === "up") {
        setDirection(0, -1);
    } else if (nextDirection === "down") {
        setDirection(0, 1);
    } else if (nextDirection === "left") {
        setDirection(-1, 0);
    } else if (nextDirection === "right") {
        setDirection(1, 0);
    }
}

function step() {
    direction = pendingDirection;

    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y,
    };

    const hitWall = head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount;
    const hitSelf = snake.some((segment) => segment.x === head.x && segment.y === head.y);

    if (hitWall || hitSelf) {
        gameOver = true;
        statusElement.textContent = "Game over. Press Enter to restart.";
        playGameOverSound();
        updateOverlay();
        draw();
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += getScoreValue(10);
        foodsEaten += 1;
        normalTickDelay = Math.max(minTickMs, normalTickDelay - 4);
        food = randomFoodPosition(bonusFood ? [bonusFood] : []);
        maybeSpawnBonusFood();
        const mult = getActiveMultiplier();
        statusElement.textContent = mult > 1 ? `x${mult} points!` : "Nice. Keep going.";
        playFoodSound();
    } else if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
        applyBonusFoodEffect(bonusFood.type);
        clearBonusFood();
    } else {
        snake.pop();
    }

    updateHud();
    draw();
}

function drawGrid() {
    context.fillStyle = "#10180d";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(134, 242, 91, 0.08)";
    context.lineWidth = 1;

    for (let offset = 0; offset <= canvas.width; offset += gridSize) {
        context.beginPath();
        context.moveTo(offset, 0);
        context.lineTo(offset, canvas.height);
        context.stroke();

        context.beginPath();
        context.moveTo(0, offset);
        context.lineTo(canvas.width, offset);
        context.stroke();
    }
}

function drawFood() {
    context.fillStyle = "#f9db70";
    context.fillRect(food.x * gridSize + 3, food.y * gridSize + 3, gridSize - 6, gridSize - 6);

    if (bonusFood) {
        context.fillStyle = bonusFood.type.color;
        context.fillRect(bonusFood.x * gridSize + 2, bonusFood.y * gridSize + 2, gridSize - 4, gridSize - 4);

        context.fillStyle = bonusFood.type.highlightColor;
        context.fillRect(bonusFood.x * gridSize + 5, bonusFood.y * gridSize + 5, gridSize - 10, gridSize - 10);
    }
}

function drawSnake() {
    snake.forEach((segment, index) => {
        context.fillStyle = index === 0 ? "#c8ffb3" : "#86f25b";
        context.fillRect(segment.x * gridSize + 2, segment.y * gridSize + 2, gridSize - 4, gridSize - 4);
    });
}

function drawMessage() {
    if (isPaused) {
        context.fillStyle = "rgba(7, 10, 6, 0.7)";
        context.fillRect(40, 152, canvas.width - 80, 80);

        context.fillStyle = "#c8ffb3";
        context.textAlign = "center";
        context.font = '12px "Press Start 2P"';

        context.fillText("PAUSED", canvas.width / 2, 185);
        context.font = '8px "Press Start 2P"';
        context.fillText("SPACE TO RESUME", canvas.width / 2, 208);
    }
}

function draw() {
    drawGrid();
    drawFood();
    drawSnake();
    drawMessage();
}

function loop(timestamp) {
    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }

    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (gameStarted && !gameOver && !isPaused) {
        elapsedGameTime += delta;

        if (bonusFood && elapsedGameTime >= bonusFoodExpiresAt) {
            clearBonusFood();
        }

        if (speedBoostUntil && elapsedGameTime >= speedBoostUntil) {
            speedBoostUntil = 0;
            lastWarningSecond = -1;
            statusElement.textContent = "Turbo ended. Normal speed restored.";
            updateTurboState();
        }

        if (scoreRushUntil && elapsedGameTime >= scoreRushUntil) {
            scoreRushUntil = 0;
            statusElement.textContent = "Score Rush ended.";
        }

        updateHud();
        accumulator += delta;

        while (accumulator >= tickDelay) {
            step();
            accumulator -= tickDelay;

            if (gameOver) {
                break;
            }
        }
    }

    requestAnimationFrame(loop);
}

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
    }

    if (key === "enter") {
        startGame();
        return;
    }

    if (!gameStarted || gameOver) {
        return;
    }

    if (key === " ") {
        togglePause();
        return;
    }

    if (key === "arrowup" || key === "w") {
        handleDirectionInput("up");
    } else if (key === "arrowdown" || key === "s") {
        handleDirectionInput("down");
    } else if (key === "arrowleft" || key === "a") {
        handleDirectionInput("left");
    } else if (key === "arrowright" || key === "d") {
        handleDirectionInput("right");
    }
});

touchPanel.addEventListener("click", (event) => {
    const button = event.target.closest("button");

    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const nextDirection = button.dataset.direction;

    if (action === "pause") {
        togglePause();
        return;
    }

    handleDirectionInput(nextDirection);
});

overlayButtonElement.addEventListener("click", () => {
    startGame();
});

resetGame();
requestAnimationFrame(loop);