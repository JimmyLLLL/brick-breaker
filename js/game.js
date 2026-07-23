// ===== Brick Breaker Game Engine =====
(function () {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // UI elements
    const scoreEl = document.getElementById("score");
    const livesEl = document.getElementById("lives");
    const levelEl = document.getElementById("level");
    const comboEl = document.getElementById("combo");
    const overlayEl = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlayTitle");
    const overlayText = document.getElementById("overlayText");
    const startBtn = document.getElementById("startBtn");
    const highScoreEl = document.getElementById("highScore");

    // Game state
    let state = "ready"; // ready | playing | paused | gameover | won | levelclear
    let score = 0;
    let lives = 3;
    let level = 1;
    let combo = 0;
    let comboTimer = 0;
    let highScore = parseInt(localStorage.getItem("bb_highscore") || "0", 10);
    highScoreEl.textContent = highScore;

    // Paddle
    const paddle = {
        w: 100, h: 12,
        x: W / 2 - 50, y: H - 30,
        speed: 8,
        targetX: W / 2 - 50,
    };

    // Ball
    let balls = [];
    function createBall(x, y, dx, dy) {
        return { x, y, dx, dy, r: 7, stuck: true, trail: [] };
    }

    // Bricks
    let bricks = [];
    let particles = [];
    let powerups = [];
    let shake = 0;

    // Power-up types
    const POWERUPS = {
        expand: { color: "#2ecc71", icon: "↔", label: "Wide Paddle" },
        multi: { color: "#4f8cff", icon: "●●", label: "Multi Ball" },
        slow: { color: "#9b59b6", icon: "◷", label: "Slow Motion" },
        life: { color: "#ff3b3b", icon: "♥", label: "Extra Life" },
        laser: { color: "#ffd700", icon: "↑", label: "Laser" },
    };
    let activePowerups = {};

    // Level layouts (rows of brick HP; 0=empty, 1-3=hits to break)
    const LEVELS = [
        // Level 1 - simple
        [
            [1,1,1,1,1,1,1,1,1,1],
            [2,2,2,2,2,2,2,2,2,2],
            [1,1,1,1,1,1,1,1,1,1],
        ],
        // Level 2 - pyramid
        [
            [0,0,0,3,3,3,3,0,0,0],
            [0,0,2,2,2,2,2,2,0,0],
            [0,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1],
        ],
        // Level 3 - checker
        [
            [1,0,1,0,1,0,1,0,1,0],
            [0,2,0,2,0,2,0,2,0,2],
            [1,0,1,0,1,0,1,0,1,0],
            [0,2,0,2,0,2,0,2,0,2],
            [1,0,1,0,1,0,1,0,1,0],
        ],
        // Level 4 - fortress
        [
            [3,3,3,3,3,3,3,3,3,3],
            [3,0,0,0,0,0,0,0,0,3],
            [2,0,1,1,1,1,1,1,0,2],
            [2,0,1,0,0,0,0,1,0,2],
            [1,1,1,1,1,1,1,1,1,1],
        ],
        // Level 5 - diamond
        [
            [0,0,0,0,3,3,0,0,0,0],
            [0,0,0,2,2,2,2,0,0,0],
            [0,0,1,2,3,3,2,1,0,0],
            [0,1,1,2,3,3,2,1,1,0],
            [0,0,1,2,2,2,2,1,0,0],
            [0,0,0,1,1,1,1,0,0,0],
        ],
    ];

    const BRICK_COLORS = { 1: "#4f8cff", 2: "#2ecc71", 3: "#ff3b3b" };

    function buildLevel(n) {
        const layout = LEVELS[(n - 1) % LEVELS.length];
        bricks = [];
        const cols = layout[0].length;
        const margin = 30;
        const gap = 4;
        const bw = (W - margin * 2 - gap * (cols - 1)) / cols;
        const bh = 20;
        const topOffset = 50;
        layout.forEach((row, r) => {
            row.forEach((hp, c) => {
                if (hp > 0) {
                    bricks.push({
                        x: margin + c * (bw + gap),
                        y: topOffset + r * (bh + gap),
                        w: bw, h: bh,
                        hp, maxHp: hp,
                        powerup: Math.random() < 0.12 ? randPowerup() : null,
                    });
                }
            });
        });
    }

    function randPowerup() {
        const keys = Object.keys(POWERUPS);
        return keys[Math.floor(Math.random() * keys.length)];
    }

    function resetBall() {
        balls = [createBall(paddle.x + paddle.w / 2, paddle.y - 10, 0, 0)];
    }

    function launchBall() {
        balls.forEach(b => {
            if (b.stuck) {
                b.stuck = false;
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
                const speed = 5 + level * 0.3;
                b.dx = Math.cos(angle) * speed;
                b.dy = Math.sin(angle) * speed;
            }
        });
    }

    // ===== Input =====
    let mouseActive = false;
    canvas.addEventListener("mousemove", e => {
        const rect = canvas.getBoundingClientRect();
        const scale = W / rect.width;
        paddle.targetX = (e.clientX - rect.left) * scale - paddle.w / 2;
        mouseActive = true;
    });
    canvas.addEventListener("touchmove", e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scale = W / rect.width;
        paddle.targetX = (e.touches[0].clientX - rect.left) * scale - paddle.w / 2;
        mouseActive = true;
    }, { passive: false });
    canvas.addEventListener("click", () => {
        if (state === "playing") launchBall();
    });
    document.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft") paddle.targetX -= paddle.speed * 3;
        if (e.key === "ArrowRight") paddle.targetX += paddle.speed * 3;
        if (e.key === " " || e.key === "Enter") {
            if (state === "playing") launchBall();
            if (state === "ready" || state === "gameover" || state === "won") startGame();
            if (state === "paused") resume();
            e.preventDefault();
        }
        if (e.key === "p" || e.key === "P") {
            if (state === "playing") pause();
            else if (state === "paused") resume();
        }
    });

    // ===== Audio (Web Audio API, no files) =====
    let audioCtx;
    function beep(freq, duration, type, vol) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type || "square";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }
    const sfx = {
        hit: () => beep(440, 0.05, "square", 0.06),
        brick: () => beep(660, 0.08, "square", 0.07),
        break: () => beep(880, 0.12, "sawtooth", 0.06),
        powerup: () => { beep(523, 0.08, "sine", 0.1); setTimeout(() => beep(784, 0.1, "sine", 0.1), 80); },
        lose: () => { beep(220, 0.15, "sawtooth", 0.1); setTimeout(() => beep(110, 0.3, "sawtooth", 0.1), 150); },
        win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, "sine", 0.1), i * 120)); },
    };

    // ===== Particles =====
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < (count || 8); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            particles.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                life: 1,
                color,
                size: 2 + Math.random() * 3,
            });
        }
    }

    // ===== Power-up logic =====
    function applyPowerup(type) {
        sfx.powerup();
        showFlash(POWERUPS[type].label);
        switch (type) {
            case "expand":
                paddle.w = Math.min(paddle.w + 40, 200);
                activePowerups.expand = 600;
                break;
            case "multi":
                const newBalls = [];
                balls.forEach(b => {
                    if (!b.stuck) {
                        newBalls.push(createBall(b.x, b.y, b.dx * 0.9, b.dy * 0.9));
                        newBalls.push(createBall(b.x, b.y, b.dx * 1.1, -b.dy));
                        newBalls[newBalls.length - 1].stuck = false;
                    }
                });
                balls = balls.concat(newBalls);
                break;
            case "slow":
                activePowerups.slow = 480;
                break;
            case "life":
                lives++;
                updateUI();
                break;
            case "laser":
                activePowerups.laser = 360;
                break;
        }
    }

    let flashText = "";
    let flashTimer = 0;
    function showFlash(text) {
        flashText = text;
        flashTimer = 90;
    }

    // ===== Update =====
    function update() {
        if (state !== "playing") return;

        // Paddle smooth follow
        paddle.x += (paddle.targetX - paddle.x) * 0.25;
        paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

        // Combo decay
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer === 0) combo = 0;
        }

        // Powerup timers
        Object.keys(activePowerups).forEach(k => {
            activePowerups[k]--;
            if (activePowerups[k] <= 0) {
                if (k === "expand") paddle.w = Math.max(paddle.w - 40, 100);
                delete activePowerups[k];
            }
        });

        const slowMul = activePowerups.slow ? 0.5 : 1;

        // Update balls
        for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i];
            if (b.stuck) {
                b.x = paddle.x + paddle.w / 2;
                b.y = paddle.y - b.r - 2;
                continue;
            }

            // Trail
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 8) b.trail.shift();

            b.x += b.dx * slowMul;
            b.y += b.dy * slowMul;

            // Wall collision
            if (b.x - b.r < 0) { b.x = b.r; b.dx = -b.dx; sfx.hit(); }
            if (b.x + b.r > W) { b.x = W - b.r; b.dx = -b.dx; sfx.hit(); }
            if (b.y - b.r < 0) { b.y = b.r; b.dy = -b.dy; sfx.hit(); }

            // Paddle collision
            if (b.dy > 0 && b.y + b.r > paddle.y && b.y - b.r < paddle.y + paddle.h &&
                b.x > paddle.x && b.x < paddle.x + paddle.w) {
                b.y = paddle.y - b.r;
                const hitPos = (b.x - paddle.x) / paddle.w; // 0..1
                const angle = -Math.PI / 2 + (hitPos - 0.5) * Math.PI * 0.7;
                const speed = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
                b.dx = Math.cos(angle) * speed;
                b.dy = Math.sin(angle) * speed;
                sfx.hit();
                combo = 0;
            }

            // Brick collision
            for (let j = bricks.length - 1; j >= 0; j--) {
                const br = bricks[j];
                if (b.x + b.r > br.x && b.x - b.r < br.x + br.w &&
                    b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
                    // Determine collision side
                    const overlapL = b.x + b.r - br.x;
                    const overlapR = br.x + br.w - (b.x - b.r);
                    const overlapT = b.y + b.r - br.y;
                    const overlapB = br.y + br.h - (b.y - b.r);
                    const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);
                    if (minOverlap === overlapL || minOverlap === overlapR) b.dx = -b.dx;
                    else b.dy = -b.dy;

                    br.hp--;
                    combo++;
                    comboTimer = 120;
                    const points = 10 * (1 + Math.floor(combo / 3));
                    score += points;
                    sfx.brick();

                    if (br.hp <= 0) {
                        spawnParticles(br.x + br.w / 2, br.y + br.h / 2, BRICK_COLORS[br.maxHp], 10);
                        sfx.break();
                        if (br.powerup) {
                            powerups.push({
                                x: br.x + br.w / 2, y: br.y + br.h / 2,
                                type: br.powerup, dy: 1.5, r: 12
                            });
                        }
                        bricks.splice(j, 1);
                        shake = 4;
                    }
                    updateUI();
                    break;
                }
            }

            // Ball lost
            if (b.y - b.r > H) {
                balls.splice(i, 1);
                if (balls.length === 0) {
                    lives--;
                    sfx.lose();
                    combo = 0;
                    if (lives <= 0) {
                        gameOver();
                    } else {
                        resetBall();
                        updateUI();
                    }
                }
            }
        }

        // Update powerups falling
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += p.dy;
            if (p.y + p.r > paddle.y && p.y - p.r < paddle.y + paddle.h &&
                p.x > paddle.x && p.x < paddle.x + paddle.w) {
                applyPowerup(p.type);
                powerups.splice(i, 1);
            } else if (p.y > H) {
                powerups.splice(i, 1);
            }
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.dx;
            p.y += p.dy;
            p.dy += 0.15;
            p.life -= 0.025;
            if (p.life <= 0) particles.splice(i, 1);
        }

        if (shake > 0) shake *= 0.85;

        // Level clear
        if (bricks.length === 0) {
            levelClear();
        }

        if (flashTimer > 0) flashTimer--;
    }

    // ===== Render =====
    function render() {
        ctx.save();
        if (shake > 0.5) {
            ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        }

        // Background
        ctx.fillStyle = "#0a0b0f";
        ctx.fillRect(0, 0, W, H);

        // Grid bg
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 30) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 30) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Bricks
        bricks.forEach(br => {
            const color = BRICK_COLORS[br.hp] || BRICK_COLORS[br.maxHp];
            ctx.fillStyle = color;
            ctx.fillRect(br.x, br.y, br.w, br.h);
            // Highlight
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.fillRect(br.x, br.y, br.w, 3);
            // HP indicator
            if (br.maxHp > 1 && br.hp < br.maxHp) {
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fillRect(br.x, br.y, br.w, br.h);
            }
        });

        // Particles
        particles.forEach(p => {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        });
        ctx.globalAlpha = 1;

        // Powerups
        powerups.forEach(p => {
            const pu = POWERUPS[p.type];
            ctx.fillStyle = pu.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(pu.icon, p.x, p.y);
        });

        // Balls
        balls.forEach(b => {
            // Trail
            b.trail.forEach((t, i) => {
                ctx.globalAlpha = (i / b.trail.length) * 0.4;
                ctx.fillStyle = "#4f8cff";
                ctx.beginPath();
                ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            // Ball
            const grad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(1, "#4f8cff");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        });

        // Paddle
        const pgrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
        pgrad.addColorStop(0, "#6ba1ff");
        pgrad.addColorStop(1, "#4f8cff");
        ctx.fillStyle = pgrad;
        ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(paddle.x, paddle.y, paddle.w, 3);

        // Laser indicator
        if (activePowerups.laser) {
            ctx.strokeStyle = "rgba(255,215,0,0.5)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(paddle.x + paddle.w / 2, paddle.y);
            ctx.lineTo(paddle.x + paddle.w / 2, 0);
            ctx.stroke();
        }

        // Combo
        if (combo > 1) {
            ctx.fillStyle = combo > 5 ? "#ffd700" : "#e8eaf0";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("Combo x" + combo, 10, H - 10);
        }

        // Flash text
        if (flashTimer > 0) {
            ctx.globalAlpha = Math.min(flashTimer / 30, 1);
            ctx.fillStyle = "#ffd700";
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(flashText, W / 2, H / 2 - 40);
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    // ===== Game loop =====
    function loop() {
        update();
        render();
        requestAnimationFrame(loop);
    }

    // ===== State transitions =====
    function updateUI() {
        scoreEl.textContent = score;
        livesEl.textContent = lives;
        levelEl.textContent = level;
        comboEl.textContent = combo > 1 ? "x" + combo : "—";
        if (score > highScore) {
            highScore = score;
            localStorage.setItem("bb_highscore", highScore);
            highScoreEl.textContent = highScore;
        }
    }

    function showOverlay(title, text, btnText) {
        overlayEl.style.display = "flex";
        overlayTitle.textContent = title;
        overlayText.textContent = text;
        startBtn.textContent = btnText;
    }
    function hideOverlay() {
        overlayEl.style.display = "none";
    }

    function startGame() {
        score = 0;
        lives = 3;
        level = 1;
        combo = 0;
        paddle.w = 100;
        activePowerups = {};
        powerups = [];
        particles = [];
        setLevel(1);
        hideOverlay();
        state = "playing";
        updateUI();
    }

    function setLevel(n) {
        level = n;
        buildLevel(n);
        resetBall();
        updateUI();
        updateHash(n);
    }

    function levelClear() {
        sfx.win();
        if (level >= LEVELS.length) {
            state = "won";
            showOverlay("🏆 You Win!", "Final Score: " + score + " | You cleared all " + LEVELS.length + " levels!", "Play Again");
        } else {
            state = "levelclear";
            showOverlay("✓ Level " + level + " Clear!", "Score: " + score + " | Lives: " + lives + " | Next: Level " + (level + 1), "Next Level");
            startBtn.onclick = () => {
                setLevel(level + 1);
                hideOverlay();
                state = "playing";
            };
        }
    }

    function gameOver() {
        state = "gameover";
        showOverlay("Game Over", "Score: " + score + " | High Score: " + highScore, "Try Again");
    }

    function pause() {
        state = "paused";
        showOverlay("⏸ Paused", "Press P or click Resume", "Resume");
        startBtn.onclick = resume;
    }
    function resume() {
        hideOverlay();
        state = "playing";
        startBtn.onclick = startGame;
    }

    // ===== Hash routing (SEO: each level has its own URL) =====
    function updateHash(n) {
        if (location.hash !== "#level-" + n) {
            history.replaceState(null, "", "#level-" + n);
        }
    }
    function readHash() {
        const m = location.hash.match(/#level-(\d+)/);
        return m ? parseInt(m[1], 10) : 1;
    }

    // Init
    startBtn.onclick = startGame;
    const startLevel = Math.min(Math.max(readHash(), 1), LEVELS.length);
    setLevel(startLevel);
    state = "ready";
    showOverlay("🧱 Brick Breaker", "Break all bricks across " + LEVELS.length + " levels! Catch power-ups for special abilities.", "Start Game");
    loop();
})();
