class PoolGame {
    constructor() {
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.initializeConstants();
        this.initializeState();
        this.setupEventListeners();
        this.reset();
        this.gameLoop();
    }

    initializeConstants() {
        this.BALL_RADIUS = 10;
        this.POCKET_RADIUS = 18;
        this.FRICTION = 0.985;
        this.MIN_VELOCITY = 0.05;
        
        this.COLORS = {
            table: '#0d5016',
            hole: '#1a1a1a',
            cueball: 'white',
            balls: {
                1: '#FFD700', 2: '#1E90FF', 3: '#DC143C', 4: '#8A2BE2',
                5: '#FF4500', 6: '#32CD32', 7: '#8B0000', 8: '#000000',
                9: '#FFD700', 10: '#1E90FF', 11: '#DC143C', 12: '#8A2BE2',
                13: '#FF4500', 14: '#32CD32', 15: '#8B0000'
            }
        };

        this.BALL_TYPES = {
            1: 'solid', 2: 'solid', 3: 'solid', 4: 'solid', 5: 'solid', 6: 'solid', 7: 'solid',
            8: 'eight', 9: 'stripe', 10: 'stripe', 11: 'stripe', 12: 'stripe', 13: 'stripe', 14: 'stripe', 15: 'stripe'
        };

        this.holes = [
            [this.BALL_RADIUS, this.BALL_RADIUS],
            [this.canvas.width / 2, this.BALL_RADIUS],
            [this.canvas.width - this.BALL_RADIUS, this.BALL_RADIUS],
            [this.BALL_RADIUS, this.canvas.height - this.BALL_RADIUS],
            [this.canvas.width / 2, this.canvas.height - this.BALL_RADIUS],
            [this.canvas.width - this.BALL_RADIUS, this.canvas.height - this.BALL_RADIUS]
        ];
    }

    initializeState() {
        this.balls = [];
        this.players = [
            { id: 1, name: 'Player 1', type: null, eliminated: false },
            { id: 2, name: 'Player 2', type: null, eliminated: false }
        ];
        this.currentPlayerIndex = 0;
        this.gameOver = false;
        this.winner = null;
        this.pocketedBalls = [];
        this.mouse = { x: 0, y: 0 };
        this.drag = { active: false, start: null, vector: null };
        this.canAim = false;
        this.placingCueBall = false;
        this.isMobile = this.detectMobile();
        this.touchId = null;
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0);
    }

    setupEventListeners() {
        if (this.isMobile) {
            this.setupTouchEvents();
        } else {
            this.setupMouseEvents();
        }

        document.getElementById('add-player').addEventListener('click', () => this.addPlayer());
        document.getElementById('remove-player').addEventListener('click', () => this.removePlayer());
        document.getElementById('restart-game').addEventListener('click', () => this.reset());
        
        window.addEventListener('resize', () => this.handleResize());
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    setupMouseEvents() {
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        window.addEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    setupTouchEvents() {
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });
    }

    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        this.touchId = touch.identifier;
        const pos = this.getTouchPosition(touch);
        this.handleInputDown(pos);
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length !== 1) return;
        
        const touch = Array.from(e.touches).find(t => t.identifier === this.touchId);
        if (!touch) return;
        
        const pos = this.getTouchPosition(touch);
        this.handleInputMove(pos);
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.touchId = null;
        this.handleInputUp();
    }

    getTouchPosition(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY
        };
    }

    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    handleMouseMove(e) {
        if (!this.isInBounds(e)) return;
        const pos = this.getMousePosition(e);
        this.handleInputMove(pos);
    }

    handleGlobalMouseMove(e) {
        if (this.drag.active) {
            const pos = this.getMousePosition(e);
            this.handleInputMove(pos);
        }
    }

    handleMouseDown(e) {
        e.preventDefault();
        const pos = this.getMousePosition(e);
        this.handleInputDown(pos);
    }

    handleMouseUp() {
        this.handleInputUp();
    }

    handleInputMove(pos) {
        this.mouse = pos;
        this.updateDragVector();
    }

    handleInputDown(pos) {
        if (this.gameOver || this.ballsMoving()) return;
        
        if (this.placingCueBall) {
            if (this.isValidCueBallPosition(pos.x, pos.y)) {
                const cueBall = this.balls.find(b => b.number === 0) || this.balls[0];
                cueBall.x = pos.x;
                cueBall.y = pos.y;
                this.placingCueBall = false;
                this.canAim = true;
                this.updateUI();
            }
            return;
        }
        
        if (!this.canAim) return;
        
        const cueBall = this.balls[0];
        const distance = Math.hypot(cueBall.x - pos.x, cueBall.y - pos.y);
        
        if (distance <= cueBall.r * (this.isMobile ? 3 : 1)) {
            this.drag = { active: true, start: pos, vector: { x: 0, y: 0 } };
            this.mouse = pos;
        }
    }

    handleInputUp() {
        if (!this.drag.active) return;
        
        if (this.drag.vector && (Math.abs(this.drag.vector.x) > 1 || Math.abs(this.drag.vector.y) > 1)) {
            this.shootCueBall();
        }
        
        this.drag = { active: false, start: null, vector: null };
    }

    handleResize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    isValidCueBallPosition(x, y) {
        if (x - this.BALL_RADIUS < 0 || x + this.BALL_RADIUS > this.canvas.width) return false;
        if (y - this.BALL_RADIUS < 0 || y + this.BALL_RADIUS > this.canvas.height) return false;
        
        for (let ball of this.balls) {
            if (ball.number === 0) continue;
            const distance = Math.hypot(x - ball.x, y - ball.y);
            if (distance < this.BALL_RADIUS * 2.5) return false;
        }
        
        for (let [hx, hy] of this.holes) {
            const distance = Math.hypot(x - hx, y - hy);
            if (distance < this.POCKET_RADIUS + this.BALL_RADIUS) return false;
        }
        
        return true;
    }

    updateDragVector() {
        if (this.drag.active && this.drag.start) {
            this.drag.vector = {
                x: this.mouse.x - this.drag.start.x,
                y: this.mouse.y - this.drag.start.y
            };
        }
    }

    shootCueBall() {
        const { x, y } = this.drag.vector;
        const length = Math.sqrt(x * x + y * y);
        const force = Math.min(length, 100) * (this.isMobile ? 0.15 : 0.2);
        
        this.balls[0].vx = -(x / length) * force;
        this.balls[0].vy = -(y / length) * force;
        this.canAim = false;
    }

    reset() {
        this.initializeState();
        this.createBalls();
        this.updateUI();
    }

    createBalls() {
        this.balls = [];
        
        const cueBall = {
            x: 400, y: 200, vx: 0, vy: 0, r: this.BALL_RADIUS,
            color: this.COLORS.cueball, number: 0, type: 'cue'
        };
        this.balls.push(cueBall);

        const startX = 600, startY = 200, rows = 5;
        let ballNumber = 1;

        for (let row = 0; row < rows; row++) {
            const numBalls = row + 1;
            const x = startX + row * this.BALL_RADIUS * 2 * Math.cos(Math.PI / 6);
            const rowStartY = startY - (row * this.BALL_RADIUS);

            for (let col = 0; col < numBalls; col++) {
                const y = rowStartY + col * 2 * this.BALL_RADIUS;
                const number = (row === 2 && col === 2) ? 8 : ballNumber++;
                
                this.balls.push({
                    x, y, vx: 0, vy: 0, r: this.BALL_RADIUS,
                    color: this.COLORS.balls[number],
                    number, type: this.BALL_TYPES[number]
                });
                
                if (ballNumber > 15) break;
            }
            if (ballNumber > 15) break;
        }
    }

    ballsMoving() {
        return this.balls.some(b => Math.abs(b.vx) > this.MIN_VELOCITY || Math.abs(b.vy) > this.MIN_VELOCITY);
    }

    isInBounds(e) {
        const rect = this.canvas.getBoundingClientRect();
        return e.clientX >= rect.left && e.clientX <= rect.right && 
               e.clientY >= rect.top && e.clientY <= rect.bottom;
    }

    addPlayer() {
        if (this.players.length < 8) {
            const id = Math.max(...this.players.map(p => p.id)) + 1;
            this.players.push({ id, name: `Player ${id}`, type: null, eliminated: false });
            this.updateUI();
        }
    }

    removePlayer() {
        if (this.players.length > 2) {
            this.players.pop();
            if (this.currentPlayerIndex >= this.players.length) {
                this.currentPlayerIndex = 0;
            }
            this.updateUI();
        }
    }

    switchPlayer() {
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        } while (this.players[this.currentPlayerIndex].eliminated && !this.gameOver);
        this.updateUI();
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    updateUI() {
        this.updatePlayersDisplay();
        this.updateScoreDisplay();
        this.updateStatusDisplay();
    }

    updatePlayersDisplay() {
        const grid = document.getElementById('players-grid');
        const count = document.getElementById('player-count');
        
        grid.innerHTML = '';
        count.textContent = this.players.length;
        
        this.players.forEach((player, index) => {
            const box = document.createElement('div');
            box.className = 'player-box';
            box.textContent = player.name;
            
            if (index === this.currentPlayerIndex && !this.gameOver) {
                box.classList.add('current');
            }
            if (player.eliminated) {
                box.classList.add('eliminated');
            }
            if (player.type) {
                box.textContent += ` (${player.type})`;
            }
            
            grid.appendChild(box);
        });
        
        document.getElementById('add-player').disabled = this.players.length >= 8;
        document.getElementById('remove-player').disabled = this.players.length <= 2;
    }

    updateScoreDisplay() {
        const solids = this.pocketedBalls.filter(b => b.type === 'solid').length;
        const stripes = this.pocketedBalls.filter(b => b.type === 'stripe').length;
        
        document.getElementById('solids-count').textContent = solids;
        document.getElementById('stripes-count').textContent = stripes;
    }

    updateStatusDisplay() {
        const status = document.getElementById('game-status');
        
        if (this.gameOver) {
            status.textContent = `${this.winner} Wins!`;
            status.className = 'status-winner';
        } else if (this.placingCueBall) {
            status.textContent = 'Place the cue ball';
            status.className = 'status-moving';
        } else if (this.ballsMoving()) {
            status.textContent = 'Balls in motion...';
            status.className = 'status-moving';
        } else if (this.canAim) {
            status.textContent = `${this.getCurrentPlayer().name}'s turn`;
            status.className = 'status-turn';
        } else {
            status.textContent = '';
            status.className = '';
        }
    }

    handlePockets(pocketed) {
        let cuePocketed = false, eightPocketed = false, validShot = false;
        const player = this.getCurrentPlayer();
        
        pocketed.forEach(ball => {
            this.pocketedBalls.push(ball);
            
            if (ball.number === 0) {
                cuePocketed = true;
            } else if (ball.number === 8) {
                eightPocketed = true;
            } else {
                if (!player.type) {
                    player.type = ball.type;
                    this.players.forEach(p => {
                        if (p.id !== player.id && !p.type) {
                            p.type = ball.type === 'solid' ? 'stripe' : 'solid';
                        }
                    });
                }
                if (player.type === ball.type) validShot = true;
            }
        });

        if (cuePocketed) {
            this.placingCueBall = true;
            this.canAim = false;
            this.switchPlayer();
            return;
        }

        if (eightPocketed) {
            const remaining = this.balls.filter(b => b.number !== 0 && player.type === b.type).length;
            this.gameOver = true;
            
            if (remaining === 0) {
                this.winner = player.name;
            } else {
                player.eliminated = true;
                const active = this.players.filter(p => !p.eliminated);
                this.winner = active.length === 1 ? active[0].name : this.players[(this.currentPlayerIndex + 1) % this.players.length].name;
            }
            return;
        }

        if (!validShot && pocketed.length > 0) {
            this.switchPlayer();
        }
    }

    update() {
        const moving = this.ballsMoving();
        
        if (moving) {
            this.canAim = false;
            this.updateBalls();
            this.handleCollisions();
            
            const pocketed = [];
            this.balls = this.balls.filter(ball => {
                if (this.checkPocket(ball)) {
                    pocketed.push(ball);
                    return false;
                }
                return true;
            });
            
            if (pocketed.length > 0) {
                this.handlePockets(pocketed);
            }
        } else if (!this.gameOver && !this.canAim && !this.placingCueBall) {
            this.canAim = true;
        }
        
        this.updateUI();
    }

    updateBalls() {
        this.balls.forEach(ball => {
            ball.x += ball.vx;
            ball.y += ball.vy;
            ball.vx *= this.FRICTION;
            ball.vy *= this.FRICTION;
            
            if (Math.abs(ball.vx) < this.MIN_VELOCITY) ball.vx = 0;
            if (Math.abs(ball.vy) < this.MIN_VELOCITY) ball.vy = 0;
            
            this.handleWallCollision(ball);
        });
    }

    handleWallCollision(ball) {
        if (ball.x - ball.r <= 0 || ball.x + ball.r >= this.canvas.width) {
            ball.vx = -ball.vx;
            ball.x = Math.max(ball.r, Math.min(this.canvas.width - ball.r, ball.x));
        }
        if (ball.y - ball.r <= 0 || ball.y + ball.r >= this.canvas.height) {
            ball.vy = -ball.vy;
            ball.y = Math.max(ball.r, Math.min(this.canvas.height - ball.r, ball.y));
        }
    }

    handleCollisions() {
        for (let i = 0; i < this.balls.length; i++) {
            for (let j = i + 1; j < this.balls.length; j++) {
                const b1 = this.balls[i], b2 = this.balls[j];
                const dx = b2.x - b1.x, dy = b2.y - b1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = b1.r + b2.r;

                if (distance < minDistance) {
                    const overlap = minDistance - distance;
                    const nx = dx / distance, ny = dy / distance;

                    b1.x -= nx * overlap / 2;
                    b1.y -= ny * overlap / 2;
                    b2.x += nx * overlap / 2;
                    b2.y += ny * overlap / 2;

                    const vx = b1.vx - b2.vx, vy = b1.vy - b2.vy;
                    const dot = vx * nx + vy * ny;

                    b1.vx -= dot * nx;
                    b1.vy -= dot * ny;
                    b2.vx += dot * nx;
                    b2.vy += dot * ny;
                }
            }
        }
    }

    checkPocket(ball) {
        return this.holes.some(([x, y]) => {
            const distance = Math.sqrt((ball.x - x) ** 2 + (ball.y - y) ** 2);
            return distance < this.POCKET_RADIUS + ball.r;
        });
    }

    render() {
        this.drawTable();
        this.drawAimLine();
        this.balls.forEach(ball => this.drawBall(ball));
        
        if (this.placingCueBall) {
            this.drawCueBallPlacement();
        }
    }

    drawTable() {
        this.ctx.fillStyle = this.COLORS.table;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.COLORS.hole;
        this.holes.forEach(([x, y]) => {
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.POCKET_RADIUS, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawAimLine() {
        if (!this.drag.active || !this.drag.vector) return;
        
        const cueBall = this.balls[0];
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(cueBall.x, cueBall.y);
        this.ctx.lineTo(cueBall.x - this.drag.vector.x, cueBall.y - this.drag.vector.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawCueBallPlacement() {
        if (this.isValidCueBallPosition(this.mouse.x, this.mouse.y)) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.mouse.x, this.mouse.y, this.BALL_RADIUS, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    drawBall(ball) {
        const { x, y, r, color, number, type } = ball;
        
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        if (type === 'stripe') {
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(x - r * 0.8, y - r * 0.25, r * 1.6, r * 0.5);
            this.ctx.strokeRect(x - r * 0.8, y - r * 0.25, r * 1.6, r * 0.5);
        }
        
        if (number > 0) {
            this.ctx.fillStyle = (type === 'stripe' || number === 8) ? '#000' : '#fff';
            this.ctx.font = 'bold 12px Inter, Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            this.ctx.strokeStyle = (type === 'stripe' || number === 8) ? '#fff' : '#000';
            this.ctx.lineWidth = 2;
            this.ctx.strokeText(number, x, y);
            this.ctx.fillText(number, x, y);
        }
    }

    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PoolGame();
});
