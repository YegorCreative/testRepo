const canvas = document.getElementById("game");
const context = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const speedElement = document.getElementById("speed");
const statusElement = document.getElementById("status");

const gridSize = 16;
const tileCount = canvas.width / gridSize;
const baseTickMs = 150;
const minTickMs = 70;

let bestScore = Number.parseInt(localStorage.getItem("retro-snake-best") || "0", 10);
let tickDelay = baseTickMs;
let lastFrameTime = 0;
let accumulator = 0;
let gameStarted = false;
let gameOver = false;
let isPaused = false;

let snake;
let direction;
let pendingDirection;
let food;
let score;

bestScoreElement.textContent = String(bestScore);

function randomFoodPosition() {
    let nextFood;

    do {
        nextFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount),
        };
    } while (snake.some((segment) => segment.x === nextFood.x && segment.y === nextFood.y));

    return nextFood;
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
    score = 0;
    tickDelay = baseTickMs;
    accumulator = 0;
    lastFrameTime = 0;
    gameOver = false;
    isPaused = false;
    scoreElement.textContent = "0";
    speedElement.textContent = "1";
    statusElement.textContent = gameStarted
        ? "Collect blocks. Avoid walls and yourself."
        : "Press Enter to start";
    draw();
}

function updateHud() {
    scoreElement.textContent = String(score);

    const speedLevel = Math.max(1, Math.floor((baseTickMs - tickDelay) / 10) + 1);
    speedElement.textContent = String(speedLevel);

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
        draw();
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += 10;
        tickDelay = Math.max(minTickMs, tickDelay - 4);
        food = randomFoodPosition();
        statusElement.textContent = "Nice. Keep going.";
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
}

function drawSnake() {
    snake.forEach((segment, index) => {
        context.fillStyle = index === 0 ? "#c8ffb3" : "#86f25b";
        context.fillRect(segment.x * gridSize + 2, segment.y * gridSize + 2, gridSize - 4, gridSize - 4);
    });
}

function drawMessage() {
    if (!gameStarted || isPaused || gameOver) {
        context.fillStyle = "rgba(7, 10, 6, 0.7)";
        context.fillRect(40, 152, canvas.width - 80, 80);

        context.fillStyle = "#c8ffb3";
        context.textAlign = "center";
        context.font = '12px "Press Start 2P"';

        const message = gameOver
            ? "GAME OVER"
            : isPaused
                ? "PAUSED"
                : "PRESS ENTER";

        context.fillText(message, canvas.width / 2, 185);
        context.font = '8px "Press Start 2P"';
        context.fillText("RETRO SNAKE", canvas.width / 2, 208);
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
        resetGame();
        gameStarted = true;
        statusElement.textContent = "Game running.";
        return;
    }

    if (!gameStarted || gameOver) {
        return;
    }

    if (key === " ") {
        isPaused = !isPaused;
        statusElement.textContent = isPaused ? "Paused." : "Game running.";
        draw();
        return;
    }

    if (isPaused) {
        return;
    }

    if (key === "arrowup" || key === "w") {
        setDirection(0, -1);
    } else if (key === "arrowdown" || key === "s") {
        setDirection(0, 1);
    } else if (key === "arrowleft" || key === "a") {
        setDirection(-1, 0);
    } else if (key === "arrowright" || key === "d") {
        setDirection(1, 0);
    }
});

resetGame();
requestAnimationFrame(loop);