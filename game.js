// Game Configuration
const FPS_FOV = 90;
const SPAWN_INTERVAL = 2000;
const ROUND_COOLDOWN = 5000;
let PLAYER_SPEED = 16.0;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.5;
const ENEMY_SPEED = 6.0;
const PROJ_SPEED = 40.0;
const GRAVITY = 25.0;
const JUMP_FORCE = 10.0;

// Weapon Configuration
const WEAPONS = [
    { rate: 180, cost: 0, name: "Blaster Mk.I" },
    { rate: 150, cost: 30, name: "Rapid Rifle" },
    { rate: 120, cost: 60, name: "Speed Blaster" },
    { rate: 90, cost: 120, name: "Turbo Laser" },
    { rate: 60, cost: 240, name: "Gatling Gun" },
    { rate: 30, cost: 480, name: "God Killer" }
];

// State
let gameState = { mode: 'menu', round: 1, score: 0, money: 0, currentWeaponIndex: 0, enemiesToSpawn: 0, nextSpawnTime: 0, lastShotTime: 0, cooldownEndTime: 0, platform: 'pc', username: 'Guest' };
let projectiles = [], enemies = [];
let cheats = { fly: false, god: false, laser: false, speed: false, jump: false, grav: false };
const keys = { w: false, a: false, s: false, d: false, shoot: false, space: false, shift: false };
let isLocked = false, yaw = 0, pitch = 0;
// Physics State
let yVelocity = 0;
// Mobile Input State
let joystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0, dx: 0, dy: 0 };

// Audio
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
function playSound(type) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        if (type === 'shoot') {
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.0, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'hit') {
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'round') {
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(800, now + 1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 1);
            osc.start(now); osc.stop(now + 1);
        }
    } catch (e) { }
}

// VISUALS: Procedural Textures
function generateTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (type === 'grid') { // Sci-fi Floor
        ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = '#0f3460'; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i <= 512; i += 64) { ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.moveTo(0, i); ctx.lineTo(512, i); }
        ctx.stroke();
        // Glow points
        ctx.fillStyle = '#e94560';
        for (let i = 0; i < 10; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 4);
    } else if (type === 'wall') { // Sci-fi Wall
        ctx.fillStyle = '#16213e'; ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#0f3460';
        for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 64 + 4, 512, 56);
        ctx.strokeStyle = '#00fff5'; ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 512, 512);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

// PARTICLES
const particles = [];
function createExplosion(pos, color) {
    for (let i = 0; i < 15; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.position.x += (Math.random() - 0.5) * 0.5;
        mesh.position.y += (Math.random() - 0.5) * 0.5;
        mesh.position.z += (Math.random() - 0.5) * 0.5;
        const vel = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        scene.add(mesh);
        particles.push({ mesh, vel, life: 1.0 });
    }
}

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510); // Darker space
scene.fog = new THREE.Fog(0x050510, 20, 100);

const camera = new THREE.PerspectiveCamera(FPS_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadows
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0x444444, 0x000000, 0.6); // Better ambient
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// Floor
const floorTex = generateTexture('grid');
floorTex.repeat.set(20, 20);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.2, metalness: 0.5 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const walls = [];
const wallTex = generateTexture('wall');
function createWall(x, z, w, d, h) {
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.1, metalness: 0.8, color: 0xaaaaaa });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, h / 2, z);
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
    walls.push(new THREE.Box3().setFromObject(wall));
}
const mapSize = 80;
createWall(0, -mapSize / 2, mapSize + 2, 2, 8);
createWall(0, mapSize / 2, mapSize + 2, 2, 8);
createWall(-mapSize / 2, 0, 2, mapSize, 8);
createWall(mapSize / 2, 0, 2, mapSize, 8);
createWall(0, -20, 2, 15, 6);
createWall(0, 20, 2, 15, 6);
createWall(-20, 0, 15, 2, 6);
createWall(20, 0, 15, 2, 6);

function createNameSprite() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 64;
    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = '#ff0000';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 15;
    ctx.fillText("ENEMY", 128, 45);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.scale.set(4, 1, 1);
    return sprite;
}

// UI & Logic
const ui = {
    money: document.getElementById('money'),
    score: document.getElementById('score'),
    start: document.getElementById('start-screen'),
    shop: document.getElementById('shop-modal'),
    powers: document.getElementById('powers-modal'),
    chat: document.getElementById('chat'),
    username: document.getElementById('username'),
    round: document.getElementById('round-info'),
    cooldown: document.getElementById('round-cooldown'),
    timer: document.getElementById('cooldown-timer'),
    lobby: document.getElementById('lobby-screen'),
    options: document.getElementById('options-modal')
};

// NETWORKING
let socket;
let remotePlayers = {};

function initNetwork() {
    if (socket) return;

    // Auto-detect Server URL
    // If running from file:// (Local), go to localhost:3000
    // If running from website (http/s), go to that same website
    const serverUrl = (window.location.protocol === 'file:') ? 'http://localhost:3000' : window.location.origin;

    socket = io(serverUrl);

    socket.on('connect', () => {
        document.getElementById('server-status').innerText = "Server: Connected (Ping: 20ms)";
        document.getElementById('server-status').style.color = "#00ff00";
    });

    socket.on('roomCreated', (data) => {
        alert(`Room Created! Code: ${data.code}`);
        gameState.roomCode = data.code;
        gameState.isHost = true;
        startGame();
    });

    socket.on('roomJoined', (data) => {
        alert(`Joined Room: ${data.code}`);
        gameState.roomCode = data.code;
        gameState.isHost = false;
        startGame();
    });

    socket.on('updatePlayer', (data) => {
        if (!remotePlayers[data.id]) {
            // New Player Visual
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0x0000ff }));
            g.add(body);
            scene.add(g);
            remotePlayers[data.id] = { mesh: g };
        }
        const p = remotePlayers[data.id];
        p.mesh.position.set(data.x, data.y, data.z);
        p.mesh.rotation.y = data.yaw;
    });

    socket.on('playerDisconnected', (id) => {
        if (remotePlayers[id]) { scene.remove(remotePlayers[id].mesh); delete remotePlayers[id]; }
    });
}

// UI Helpers
function bindTouch(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    // Use pointerup for universal click handling (Mouse + Touch)
    // This avoids double-firing issues and ensures responsiveness
    el.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent game canvas from seeing this
        handler(e);
    });
}

// Lobby Functions
window.showLobby = function () {
    const name = ui.username.value.trim();
    if (!name) { alert("Username is mandatory to play Online!"); return; }
    gameState.username = name;
    ui.start.classList.add('hidden');
    ui.lobby.classList.remove('hidden');
    initNetwork();
};
window.showStartScreen = function () {
    ui.lobby.classList.add('hidden');
    ui.start.classList.remove('hidden');
};
window.createRoom = function () {
    if (socket) socket.emit('createRoom', gameState.username);
};
window.joinRoom = function () {
    const code = document.getElementById('room-code').value.toUpperCase();
    if (socket && code) socket.emit('joinRoom', { code, username: gameState.username });
};

// Bind UI Events
bindTouch('online-btn', showLobby);
bindTouch('start-btn', startGame);
bindTouch('restart-btn', startGame);
bindTouch('btn-pc', () => selectPlatform('pc'));
bindTouch('btn-mobile', () => selectPlatform('mobile'));
bindTouch('shop-toggle', toggleShop);
bindTouch('options-toggle', toggleOptions);
bindTouch('powers-toggle', togglePowers);
// Note: Inline onclicks in HTML for shop items/powers still work via 'click',
// but main menu buttons are now super-responsive.

function logMessage(text, color = 'white') {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.style.color = color;
    msg.innerText = text;
    ui.chat.appendChild(msg);
    if (ui.chat.children.length > 5) ui.chat.removeChild(ui.chat.firstChild);
}

// Select Platform
window.selectPlatform = function (plat) {
    gameState.platform = plat;
    document.getElementById('btn-pc').classList.remove('selected');
    document.getElementById('btn-mobile').classList.remove('selected');
    document.getElementById(`btn-${plat}`).classList.add('selected');
};

// Start
function startGame() {
    const name = ui.username.value.trim();
    if (!name) { alert("Username is mandatory!"); return; }
    gameState.username = name;

    // Admin Check
    if (name === 'ahmf') {
        document.getElementById('powers-toggle').style.display = 'flex';
    } else {
        document.getElementById('powers-toggle').style.display = 'none';
    }

    // Mobile Check
    if (gameState.platform === 'mobile') {
        document.getElementById('mobile-controls').style.display = 'block';
    } else {
        document.getElementById('mobile-controls').style.display = 'none';
        try { document.body.requestPointerLock(); } catch (e) { console.warn("Pointer Lock failed", e); }
    }

    initAudio();
    enemies.forEach(e => scene.remove(e.group)); enemies = [];
    projectiles.forEach(p => scene.remove(p.mesh)); projectiles = [];
    gameState.mode = 'playing'; gameState.round = 1; gameState.score = 0; gameState.money = 0;
    gameState.enemiesToSpawn = 1; gameState.nextSpawnTime = performance.now();

    ui.start.classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    ui.cooldown.classList.add('hidden');
    ui.money.innerText = 'Money: $0';
    ui.score.innerText = 'Score: 0';
    ui.round.innerText = 'Round 1';
    ui.chat.innerHTML = '';

    camera.position.set(0, PLAYER_HEIGHT, 0);
    yVelocity = 0;

    logMessage(`Welcome, ${gameState.username}!`, '#00ff00');
}
logMessage(`Welcome, ${gameState.username}!`, '#00ff00');
}
// Listeners moved to bindTouch below


// Menus
window.toggleShop = function () {
    if (gameState.mode === 'shop') {
        gameState.mode = 'playing'; ui.shop.classList.add('hidden');
        if (gameState.platform === 'pc') document.body.requestPointerLock();
    } else if (gameState.mode === 'playing' || gameState.mode === 'cooldown') {
        gameState.mode = 'shop'; ui.shop.classList.remove('hidden'); document.exitPointerLock();
        for (let i = 1; i < WEAPONS.length; i++) {
            const btn = document.getElementById(`btn-w${i}`);
            btn.innerText = (i <= gameState.currentWeaponIndex) ? "OWNED" : `$${WEAPONS[i].cost}`;
            btn.disabled = (i > gameState.currentWeaponIndex && gameState.money < WEAPONS[i].cost);
            if (i <= gameState.currentWeaponIndex) btn.style.background = "#555";
        }
    }
};
// document.getElementById('shop-toggle').addEventListener('click', toggleShop); // Handled by bindTouch

// Powers
window.togglePowers = function () {
    if (gameState.mode === 'powers') {
        gameState.mode = 'playing'; ui.powers.classList.add('hidden');
        if (gameState.platform === 'pc') document.body.requestPointerLock();
    } else if (gameState.mode === 'playing' || gameState.mode === 'cooldown') {
        gameState.mode = 'powers'; ui.powers.classList.remove('hidden'); document.exitPointerLock();
    }
};
window.toggleCheat = function (name) {
    cheats[name] = !cheats[name];
    const btn = document.getElementById(`p-${name}`);
    btn.innerText = cheats[name] ? "ON" : "OFF";
    btn.classList.toggle('power-active');
    // Logic updates
    if (name === 'speed') PLAYER_SPEED = cheats.speed ? 40.0 : 16.0;
    if (name === 'grav') console.log("Low Grav");
};
window.cheatAction = function (act) {
    if (act === 'money') { gameState.money += 1000; ui.money.innerText = `Money: $${gameState.money}`; }
    if (act === 'killall') { enemies.forEach(e => scene.remove(e.group)); enemies = []; logMessage("NUKE DEPLOYED", "red"); }
    if (act === 'tiny') { enemies.forEach(e => e.group.scale.set(0.5, 0.5, 0.5)); logMessage("Tiny Mode", "cyan"); }
    if (act === 'giant') { camera.position.y = 10; logMessage("Giant Mode", "cyan"); }
};
document.getElementById('powers-toggle').addEventListener('click', togglePowers);

// Input Handling
document.addEventListener('mousemove', e => {
    if (gameState.mode !== 'playing' && gameState.mode !== 'cooldown') return;
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
});
document.addEventListener('keydown', e => {
    if (e.code === 'KeyP') toggleShop();
    if (e.code === 'KeyO' || e.code === 'Escape') toggleOptions();
    if (e.code === 'KeyW') keys.w = true; if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyA') keys.a = true; if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'Space') keys.space = true; if (e.code === 'ShiftLeft') keys.shift = true;
});
document.addEventListener('keyup', e => {
    if (e.code === 'KeyW') keys.w = false; if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyA') keys.a = false; if (e.code === 'KeyD') keys.d = false;
    if (e.code === 'Space') keys.space = false; if (e.code === 'ShiftLeft') keys.shift = false;
});
document.addEventListener('mousedown', () => keys.shoot = true);
document.addEventListener('mouseup', () => keys.shoot = false);

// Mobile Input
const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    joystick.active = true;
    joystick.startX = e.touches[0].clientX;
    joystick.startY = e.touches[0].clientY;
}, { passive: false });
joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joystick.active) return;
    const dx = e.touches[0].clientX - joystick.startX;
    const dy = e.touches[0].clientY - joystick.startY;
    const dist = Math.min(40, Math.sqrt(dx * dx + dy * dy));
    const angle = Math.atan2(dy, dx);
    joystick.dx = Math.cos(angle) * dist;
    joystick.dy = Math.sin(angle) * dist;
    joyKnob.style.transform = `translate(${joystick.dx}px, ${joystick.dy}px)`;
    // Map to keys
    keys.w = joystick.dy < -20;
    keys.s = joystick.dy > 20;
    keys.a = joystick.dx < -20;
    keys.d = joystick.dx > 20;
}, { passive: false });
joyZone.addEventListener('touchend', e => {
    e.preventDefault();
    joystick.active = false; joystick.dx = 0; joystick.dy = 0;
    joyKnob.style.transform = `translate(0px, 0px)`;
    keys.w = false; keys.s = false; keys.a = false; keys.d = false;
}, { passive: false });

document.getElementById('shoot-btn').addEventListener('touchstart', (e) => { e.preventDefault(); keys.shoot = true; });
document.getElementById('shoot-btn').addEventListener('touchend', (e) => { e.preventDefault(); keys.shoot = false; });
document.getElementById('jump-btn').addEventListener('touchstart', (e) => { e.preventDefault(); keys.space = true; });
document.getElementById('jump-btn').addEventListener('touchend', (e) => { e.preventDefault(); keys.space = false; });

// Touch Look (Entire screen)
let lastTouchX = 0, lastTouchY = 0;
document.addEventListener('touchstart', e => {
    if (e.target.tagName !== 'CANVAS') return;
    lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
});
document.addEventListener('touchmove', e => {
    if (e.target.tagName !== 'CANVAS' || (gameState.mode !== 'playing' && gameState.mode !== 'cooldown')) return;
    const dx = e.touches[0].clientX - lastTouchX;
    const dy = e.touches[0].clientY - lastTouchY;
    lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
    yaw -= dx * 0.005;
    pitch -= dy * 0.005;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
});

// Main Loop
let lastTime = 0;
function update(time) {
    requestAnimationFrame(update);
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (gameState.mode !== 'playing' && gameState.mode !== 'cooldown') { renderer.render(scene, camera); return; }

    // COOLDOWN STATE
    if (gameState.mode === 'cooldown') {
        const left = Math.ceil((gameState.cooldownEndTime - time) / 1000);
        ui.timer.innerText = left;
        if (time >= gameState.cooldownEndTime) {
            gameState.mode = 'playing';
            ui.cooldown.classList.add('hidden');
            gameState.round++;
            gameState.enemiesToSpawn = Math.pow(2, gameState.round - 1);
            ui.round.innerText = `Round ${gameState.round}`;
            playSound('round');
            logMessage(`Round ${gameState.round} Started!`, '#fff');
        }
        // Can move but no shooting/spawning usually, but let's allow moving
    }

    // PLAYING STATE: Spawn Logic
    if (gameState.mode === 'playing') {
        if (gameState.enemiesToSpawn > 0 && time > gameState.nextSpawnTime) {
            spawnEnemy(); gameState.enemiesToSpawn--; gameState.nextSpawnTime = time + SPAWN_INTERVAL;
        }

        // CHECK ROUND END
        if (gameState.enemiesToSpawn === 0 && enemies.length === 0) {
            gameState.mode = 'cooldown';
            gameState.cooldownEndTime = time + ROUND_COOLDOWN;
            ui.cooldown.classList.remove('hidden');
        }
    }

    // PHYSICS SUB-STEPPING
    // Break the frame into smaller steps to prevent tunneling
    const STEPS = 5;
    const subDelta = delta / STEPS;

    for (let s = 0; s < STEPS; s++) {
        // Move Player
        const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const dir = new THREE.Vector3();
        if (keys.w) dir.add(fwd); if (keys.s) dir.sub(fwd);
        if (keys.d) dir.add(right); if (keys.a) dir.sub(right);

        if (dir.lengthSq() > 0) {
            dir.normalize().multiplyScalar(PLAYER_SPEED * subDelta);
            camera.position.add(dir);
            resolveCollisions(camera.position, PLAYER_RADIUS);
        }

        // Jump / Gravity Logic
        if (cheats.fly) {
            if (keys.space) camera.position.y += 10 * subDelta;
            if (keys.shift) camera.position.y -= 10 * subDelta;
            yVelocity = 0;
        } else {
            // Gravity
            yVelocity -= GRAVITY * subDelta;
            camera.position.y += yVelocity * subDelta;

            // Floor Collision
            if (camera.position.y < PLAYER_HEIGHT) {
                camera.position.y = PLAYER_HEIGHT;
                yVelocity = 0;
                // Jump allowed if on floor
                if (keys.space && s === 0) { // Only apply jump once per frame
                    yVelocity = cheats.jump ? 30 : JUMP_FORCE;
                    // Apply immediate velocity change but movement happens over steps
                }
            }
        }

        // Enemy Logic (Move)
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const disp = new THREE.Vector3().subVectors(camera.position, e.group.position);
            disp.y = 0;
            const dist = disp.length();

            // Move: Always chase, don't stop early. The Kill check handles the rest.
            if (dist > 0.5) {
                disp.normalize().multiplyScalar(ENEMY_SPEED * subDelta);
                e.group.position.add(disp);
                e.group.lookAt(camera.position);
                resolveCollisions(e.group.position, 0.6);
            }
        }
    }

    // Enemy Game Over Logic (Check once per frame)
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dist = new THREE.Vector3().subVectors(camera.position, e.group.position).setY(0).length();
        // Increased range to 1.5 to guarantee kill on touch
        if (dist <= 1.5 && !cheats.god) {
            document.exitPointerLock();
            gameState.mode = 'gameover';
            document.getElementById('game-over').classList.remove('hidden');
            document.getElementById('final-score').innerText = gameState.score;
            document.getElementById('final-round').innerText = gameState.round;
        }
    }

    // Shoot (Run once per frame)
    if ((keys.shoot || cheats.laser) && time - gameState.lastShotTime > WEAPONS[gameState.currentWeaponIndex].rate) {
        playSound('shoot');
        const m = new THREE.Mesh(new THREE.SphereGeometry(cheats.god ? 0.5 : 0.2), new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1 }));

        // Dynamic Light on Bullet
        const light = new THREE.PointLight(0xffff00, 1, 10);
        m.add(light);

        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        if (cheats.laser && enemies.length > 0) dir.subVectors(enemies[0].group.position, camera.position).normalize();
        const spawn = camera.position.clone().sub(new THREE.Vector3(0, 0.3, 0)).add(dir.clone().multiplyScalar(1.5));
        m.position.copy(spawn);
        scene.add(m);
        projectiles.push({ mesh: m, dir: dir });
        gameState.lastShotTime = time;
    }

    // Proj Logic
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        const dist = PROJ_SPEED * delta;
        const ray = new THREE.Ray(p.mesh.position, p.dir);
        let hit = false;
        // Walls
        for (const w of walls) {
            const intersect = ray.intersectBox(w, new THREE.Vector3());
            if (intersect && intersect.distanceTo(p.mesh.position) < dist) {
                hit = true;
                p.mesh.position.copy(intersect); // Move to exact hit point
                break;
            }
        }

        if (!hit) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const box = new THREE.Box3().setFromObject(e.group);
                const intersect = ray.intersectBox(box, new THREE.Vector3());
                if (intersect && intersect.distanceTo(p.mesh.position) < dist) {
                    playSound('hit');
                    createExplosion(e.group.position, 0xff0000); // BLOOD
                    scene.remove(e.group); enemies.splice(j, 1);
                    gameState.score += 100; gameState.money += 10;
                    ui.score.innerText = `Score: ${gameState.score}`; ui.money.innerText = `Money: $${gameState.money}`;
                    logMessage(`You killed Enemy +$10`, '#ffff00');
                    hit = true; break;
                }
            }
        }

        if (hit) {
            createExplosion(p.mesh.position, 0xffff00); // SPARK
            scene.remove(p.mesh);
            // Also we need to remove the light if we added one (we did in spawn)
            // But wait, the mesh has the light attached if we did it right?
            // Actually I need to attach the light to the mesh in the Spawn Logic first.
            projectiles.splice(i, 1);
        } else {
            p.mesh.position.add(p.dir.clone().multiplyScalar(dist));
            if (p.mesh.position.distanceTo(camera.position) > 100) { scene.remove(p.mesh); projectiles.splice(i, 1); }
        }
    }

    // UPDATE PARTICLES
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= delta * 2.0;
        p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
        p.mesh.rotation.x += delta;
        p.mesh.scale.multiplyScalar(0.95);
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }

    renderer.render(scene, camera);
}

// Options Logic
window.toggleOptions = function () {
    if (gameState.mode === 'options') {
        gameState.mode = 'playing'; ui.options.classList.add('hidden');
        if (gameState.platform === 'pc') document.body.requestPointerLock();
    } else if (gameState.mode === 'playing' || gameState.mode === 'cooldown') {
        gameState.mode = 'options'; ui.options.classList.remove('hidden'); document.exitPointerLock();
    }
};
window.leaveGame = function () {
    // Reset State
    enemies.forEach(e => scene.remove(e.group)); enemies = [];
    projectiles.forEach(p => scene.remove(p.mesh)); projectiles = [];
    particles.forEach(p => scene.remove(p.mesh)); particles.length = 0;

    gameState.mode = 'menu';
    ui.options.classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    ui.cooldown.classList.add('hidden');
    ui.shop.classList.add('hidden');

    // Show Start
    showStartScreen();
    document.exitPointerLock();
};
document.getElementById('options-toggle').addEventListener('click', toggleOptions);

function spawnEnemy() {
    const g = new THREE.Group();

    // Enhanced Enemy Visuals
    const material = new THREE.MeshStandardMaterial({ color: 0x882222, roughness: 0.3, metalness: 0.8 });

    // Torso (Robotic Core)
    const torsoGeo = new THREE.DodecahedronGeometry(0.6);
    const torso = new THREE.Mesh(torsoGeo, material);
    torso.position.y = 0.8;
    g.add(torso);

    // Head (Alien Scanner)
    const headGeo = new THREE.IcosahedronGeometry(0.4);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 1.0 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    g.add(head);

    // Glowing Eye
    const eyeGeo = new THREE.SphereGeometry(0.15);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 1.6, 0.35);
    g.add(eye);

    // Limbs (Floating)
    const limbGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x555555 });

    const leftArm = new THREE.Mesh(limbGeo, limbMat); leftArm.position.set(-0.7, 1.0, 0); g.add(leftArm);
    const rightArm = new THREE.Mesh(limbGeo, limbMat); rightArm.position.set(0.7, 1.0, 0); g.add(rightArm);

    const sprite = createNameSprite(); sprite.position.y = 2.4; g.add(sprite);
    const light = new THREE.PointLight(0xff0000, 1, 5); light.position.y = 1; g.add(light);

    let pos = new THREE.Vector3(), valid = false;
    while (!valid) {
        const a = Math.random() * 6.28, r = 10 + Math.random() * 30;
        pos.set(Math.sin(a) * r, 0, Math.cos(a) * r);
        const b = new THREE.Box3().setFromCenterAndSize(pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(1, 2, 1));
        valid = walls.every(w => !w.intersectsBox(b));
    }
    g.position.copy(pos); scene.add(g); enemies.push({ group: g });
}

function resolveCollisions(pos, r) {
    if (cheats.fly) return; // Noclip
    const box = new THREE.Box3().setFromCenterAndSize(pos, new THREE.Vector3(r * 2, 2, r * 2));
    for (const w of walls) {
        if (w.intersectsBox(box)) {
            const dx = Math.min(box.max.x, w.max.x) - Math.max(box.min.x, w.min.x);
            const dz = Math.min(box.max.z, w.max.z) - Math.max(box.min.z, w.min.z);
            if (dx < dz) pos.x += (pos.x < w.min.x ? -dx : dx);
            else pos.z += (pos.z < w.min.z ? -dz : dz);
        }
    }
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
update(0);
