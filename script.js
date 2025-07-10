// Importa elementos essenciais do arquivo scene.js, como a cena, câmera, renderizador e nuvens
import { scene, camera, renderer, clouds } from './scene.js';
// Importa os prédios do jogo (usados para colisão) do arquivo buildings.js
import { buildings } from './buildings.js';
import { buildings } from './missions.js';

// Variável global que armazena o módulo do avião atualmente carregado
let currentPlaneModule = null;

// --- SISTEMA DE ÁUDIO ---
let audioContext = null;
let engineGainNode = null;
let engineSoundSource = null;
let windSoundSource = null;
let crashSoundSource = null;

function initAudioSystem() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Configurar nós de áudio
            engineGainNode = audioContext.createGain();
            engineGainNode.gain.value = 0;
            engineGainNode.connect(audioContext.destination);
            
            // Pré-carregar sons
            createEngineSound();
        }
    } catch (e) {
        console.error("Erro ao inicializar sistema de áudio:", e);
    }
}

function createEngineSound() {
    if (!audioContext) return;
    
    // Criar osciladores para simular o som do motor
    engineSoundSource = audioContext.createOscillator();
    const engineFilter = audioContext.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 800;
    
    engineSoundSource.type = "sawtooth";
    engineSoundSource.frequency.value = 100;
    engineSoundSource.connect(engineFilter);
    engineFilter.connect(engineGainNode);
    engineSoundSource.start();
    
    // Criar som de vento/ré
    windSoundSource = audioContext.createOscillator();
    windSoundSource.type = "sawtooth";
    windSoundSource.frequency.value = 50;
    windSoundSource.connect(audioContext.destination);
    windSoundSource.start();
    windSoundSource.disconnect(); // Começa desconectado
}

function updateEngineSound(speed, maxSpeed, isAccelerating) {
    if (!audioContext || !engineSoundSource || !engineGainNode) return;
    
    // Normalizar velocidade entre 0 e 1
    const normalizedSpeed = Math.min(speed / maxSpeed, 1);
    
    // Calcular parâmetros do som
    const volume = Math.min(0.3 + normalizedSpeed * 0.7, 1);
    const pitch = 80 + normalizedSpeed * 120;
    const rumble = 20 + normalizedSpeed * 30;
    const filterFreq = 400 + normalizedSpeed * 600;
    
    // Aplicar efeito de aceleração
    const accelerationEffect = isAccelerating ? 1.2 : 1;
    
    // Atualizar propriedades do som
    engineSoundSource.frequency.value = pitch;
    engineGainNode.gain.value = volume;
    
    // Modulação para efeito de ronco do motor
    engineSoundSource.detune.setValueAtTime(
        Math.sin(audioContext.currentTime * 5) * rumble * accelerationEffect,
        audioContext.currentTime
    );
    
    // Atualizar som do vento
    if (normalizedSpeed > 0.3) {
        windSoundSource.connect(audioContext.destination);
        windSoundSource.frequency.value = 40 + normalizedSpeed * 60;
        audioContext.destination.gain.value = Math.max(0, (normalizedSpeed - 0.3) * 0.5);
    } else {
        windSoundSource.disconnect();
    }
}

function playCrashSound() {
    if (!audioContext) return;
    
    // Criar som de colisão
    crashSoundSource = audioContext.createOscillator();
    const crashGain = audioContext.createGain();
    
    crashSoundSource.type = "sawtooth";
    crashSoundSource.frequency.setValueAtTime(300, audioContext.currentTime);
    crashSoundSource.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 1.5);
    
    crashGain.gain.setValueAtTime(0.8, audioContext.currentTime);
    crashGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);
    
    crashSoundSource.connect(crashGain);
    crashGain.connect(audioContext.destination);
    crashSoundSource.start();
    
    // Desligar após tocar
    setTimeout(() => {
        if (crashSoundSource) {
            crashSoundSource.stop();
            crashSoundSource = null;
        }
    }, 1500);
}

// Inicializar sistema de áudio no primeiro clique/toque
document.addEventListener('click', initAudioSystem);
document.addEventListener('touchstart', initAudioSystem);

// --- FUNÇÕES DE MANIPULAÇÃO DE COOKIES ---
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// --- FUNÇÃO PRINCIPAL PARA CARREGAR AVIÕES ---
async function loadPlane(planeFile) {
    if (currentPlaneModule) {
        scene.remove(currentPlaneModule.plane);
        scene.remove(currentPlaneModule.shadow);
    }
    currentPlaneModule = await import(`./${planeFile}`);
    scene.add(currentPlaneModule.plane);
    scene.add(currentPlaneModule.shadow);
    setCookie('selectedPlane', planeFile, 30);
    resetGame();
    camera.position.set(0, 5, 10);
    camera.lookAt(currentPlaneModule.plane.position);
}

// --- INICIALIZAÇÃO DO JOGO ---
const savedPlane = getCookie('selectedPlane');
loadPlane(savedPlane || 'plane.js');

// --- VARIÁVEIS DE CONTROLE ---
let keys = { w: false, s: false, a: false, d: false };
const baseRotationSpeed = 0.015;

// Variável para rastrear o modo da câmera
let isCameraBehind = false;

// --- EVENTOS DE TECLADO ---
document.addEventListener('keydown', (event) => {
    if (!currentPlaneModule) return;
    switch (event.key) {
        case 'w': keys.w = true; break;
        case 's': keys.s = true; break;
        case 'a': keys.a = true; break;
        case 'd': keys.d = true; break;
        case ' ': currentPlaneModule.setIsAccelerating(true); break;
    }
});

document.addEventListener('keyup', (event) => {
    if (!currentPlaneModule) return;
    switch (event.key) {
        case 'w': keys.w = false; break;
        case 's': keys.s = false; break;
        case 'a': keys.a = false; break;
        case 'd': keys.d = false; break;
        case ' ': currentPlaneModule.setIsAccelerating(false); break;
    }
});


// --- FUNÇÃO DE COLISÃO ---
function checkCollision(box1, box2) {
    return box1.intersectsBox(box2);
}

// --- FUNÇÃO DE REINÍCIO DO JOGO ---
function resetGame() {
    if (!currentPlaneModule) return;
    currentPlaneModule.plane.position.set(0, 0, 2);
    currentPlaneModule.plane.rotation.set(0, 0, 0);
    currentPlaneModule.setSpeed(0);
    currentPlaneModule.setVelocity(0);
    currentPlaneModule.setIsCrashed(false);
    currentPlaneModule.setCrashTimer(0);
    currentPlaneModule.setPitchAngle(0);
    keys = { w: false, s: false, a: false, d: false };
    currentPlaneModule.setIsAccelerating(false);
    renderer.domElement.style.filter = 'none';
    renderer.render(scene, camera);
    
    // Reiniciar som
    if (engineGainNode) {
        engineGainNode.gain.value = 0;
    }
}

// --- FUNÇÃO PARA ATUALIZAR A CÂMERA ---
function updateCamera() {
    if (isCameraBehind) {
        const distanceBehind = 10;
        const heightOffset = 5;
        const yaw = currentPlaneModule.plane.rotation.y;

        const cameraOffsetX = +Math.sin(yaw) * distanceBehind;
        const cameraOffsetZ = +Math.cos(yaw) * distanceBehind;

        camera.position.set(
            currentPlaneModule.plane.position.x + cameraOffsetX,
            currentPlaneModule.plane.position.y + heightOffset,
            currentPlaneModule.plane.position.z + cameraOffsetZ
        );
    } else {
        camera.position.set(
            currentPlaneModule.plane.position.x,
            currentPlaneModule.plane.position.y + 5,
            currentPlaneModule.plane.position.z + 10
        );
    }
    camera.lookAt(currentPlaneModule.plane.position);
}

// --- FUNÇÃO DE ANIMAÇÃO ---
function animate() {
    requestAnimationFrame(animate);
    if (!currentPlaneModule) return;

    currentPlaneModule.propeller.rotation.z += 0.2 + currentPlaneModule.speed;
    currentPlaneModule.propeller1.rotation.z += 0.2 + currentPlaneModule.speed;
    currentPlaneModule.propeller2.rotation.z += 0.2 + currentPlaneModule.speed;
    currentPlaneModule.propeller3.rotation.z += 0.2 + currentPlaneModule.speed;

    // Atualizar som do motor
    if (audioContext && engineSoundSource) {
        updateEngineSound(
            currentPlaneModule.speed,
            currentPlaneModule.maxSpeed,
            currentPlaneModule.isAccelerating
        );
    }

    if (currentPlaneModule.isAccelerating && currentPlaneModule.speed < currentPlaneModule.maxSpeed && !currentPlaneModule.isCrashed) {
        currentPlaneModule.setVelocity(currentPlaneModule.velocity + currentPlaneModule.acceleration);
    } else if (!currentPlaneModule.isAccelerating && currentPlaneModule.velocity > 0 && !currentPlaneModule.isCrashed) {
        currentPlaneModule.setVelocity(currentPlaneModule.velocity - currentPlaneModule.friction);
    }
    if (currentPlaneModule.velocity < 0) currentPlaneModule.setVelocity(0);
    currentPlaneModule.setSpeed(currentPlaneModule.velocity);

    const speedMultiplier = Math.min(currentPlaneModule.speed / currentPlaneModule.maxSpeed, 1) * currentPlaneModule.speedFactor;
    const smoothFactor = 0.1;
    let targetRoll = 0;
    let targetYaw = currentPlaneModule.plane.rotation.y;
    const rotationSpeed = baseRotationSpeed + (baseRotationSpeed * speedMultiplier);

    if (currentPlaneModule.velocity > 0.01) {
        if (keys.a) {
            currentPlaneModule.plane.rotation.y += rotationSpeed;
            targetYaw += rotationSpeed;
            if (currentPlaneModule.velocity > 0.3) targetRoll = currentPlaneModule.inclinaBoing2 || 0.5;
            if (currentPlaneModule.velocity > 1.4) targetRoll = currentPlaneModule.inclina2 || 0.5;
        }
        if (keys.d) {
            currentPlaneModule.plane.rotation.y -= rotationSpeed;
            targetYaw -= rotationSpeed;
            if (currentPlaneModule.velocity > 0.3) targetRoll = currentPlaneModule.inclinaBoing || -0.5;
            if (currentPlaneModule.velocity > 1.4) targetRoll = currentPlaneModule.inclina || -0.5;
        }
    }
    currentPlaneModule.plane.rotation.y += (targetYaw - currentPlaneModule.plane.rotation.y) * smoothFactor;
    currentPlaneModule.plane.rotation.z += (targetRoll - currentPlaneModule.plane.rotation.z) * smoothFactor;

    const directionX = Math.sin(currentPlaneModule.plane.rotation.y);
    const directionZ = Math.cos(currentPlaneModule.plane.rotation.y);
    const newX = currentPlaneModule.plane.position.x - directionX * currentPlaneModule.speed;
    const newZ = currentPlaneModule.plane.position.z - directionZ * currentPlaneModule.speed;
    
    let newY = currentPlaneModule.plane.position.y;
    let verticalSpeed = 0;
    const pitchMultiplier = 5;

    if (!currentPlaneModule.isCrashed) {
        const yaw = currentPlaneModule.plane.rotation.y;

        if (keys.s && currentPlaneModule.speed > currentPlaneModule.liftThreshold && currentPlaneModule.plane.position.y < currentPlaneModule.maxAltitude) {
            verticalSpeed = currentPlaneModule.baseVerticalSpeedUp + (currentPlaneModule.baseVerticalSpeedUp * speedMultiplier);
            newY += verticalSpeed + currentPlaneModule.speed * 0.1;
            const targetPitch = verticalSpeed * pitchMultiplier;
            currentPlaneModule.setPitchAngle(
                currentPlaneModule.pitchAngle + (targetPitch - currentPlaneModule.pitchAngle) * currentPlaneModule.pitchSpeed
            );
        }
        else if (keys.w && currentPlaneModule.plane.position.y > 0.1) {
            verticalSpeed = -0.1;
            newY += verticalSpeed - currentPlaneModule.speed * 0.1;
            const targetPitch = verticalSpeed * pitchMultiplier;
            currentPlaneModule.setPitchAngle(
                currentPlaneModule.pitchAngle + (targetPitch - currentPlaneModule.pitchAngle) * currentPlaneModule.pitchSpeed
            );
        }
        else {
            const targetPitch = 0;
            currentPlaneModule.setPitchAngle(
                currentPlaneModule.pitchAngle + (targetPitch - currentPlaneModule.pitchAngle) * currentPlaneModule.pitchSpeed
            );
        }

        if (keys.w && currentPlaneModule.plane.position.y <= 0.1 && currentPlaneModule.velocity > 0) {
            const brakeDeceleration = 0.005;
            currentPlaneModule.setVelocity(currentPlaneModule.velocity - brakeDeceleration);
            if (currentPlaneModule.velocity < 0) currentPlaneModule.setVelocity(0);
            currentPlaneModule.setSpeed(currentPlaneModule.velocity);
        }
        if (currentPlaneModule.speed < currentPlaneModule.liftThreshold && currentPlaneModule.plane.position.y > 0.1) {
            verticalSpeed = currentPlaneModule.speed === 0 ? -currentPlaneModule.gravity * 5 : -currentPlaneModule.gravity;
            newY += verticalSpeed;
            const targetPitch = verticalSpeed * pitchMultiplier;
            currentPlaneModule.setPitchAngle(
                currentPlaneModule.pitchAngle + (targetPitch - currentPlaneModule.pitchAngle) * currentPlaneModule.pitchSpeed
            );
        }

        currentPlaneModule.setPitchAngle(
            Math.max(-currentPlaneModule.maxPitchAngle, Math.min(currentPlaneModule.maxPitchAngle, currentPlaneModule.pitchAngle))
        );

        currentPlaneModule.plane.rotation.order = 'YXZ';
        currentPlaneModule.plane.rotation.x = currentPlaneModule.pitchAngle;

        if (newY > currentPlaneModule.maxAltitude) newY = currentPlaneModule.maxAltitude;
        if (newY < 0.1) newY = 0.1;
    } else {
        if (currentPlaneModule.plane.position.y > 0.1) {
            newY -= currentPlaneModule.crashGravity;
            currentPlaneModule.setPitchAngle(currentPlaneModule.maxPitchAngle);
            currentPlaneModule.plane.rotation.x = currentPlaneModule.pitchAngle;
        }
        currentPlaneModule.setCrashTimer(currentPlaneModule.crashTimer + 1 / 15);
        if (currentPlaneModule.crashTimer >= currentPlaneModule.crashDuration) {
            if (currentPlaneModule.crashTimer >= currentPlaneModule.crashDuration + 4) {
                resetGame();
            } else if (currentPlaneModule.crashTimer >= currentPlaneModule.crashDuration) {
                const blurProgress = (currentPlaneModule.crashTimer - currentPlaneModule.crashDuration) / 2;
                const blurAmount = blurProgress * 5;
                renderer.domElement.style.filter = `blur(${blurAmount}px)`;
            }
        }
    }

    const planeBoxProposed = currentPlaneModule.planeBox.clone();
    planeBoxProposed.translate(new THREE.Vector3(newX - currentPlaneModule.plane.position.x, newY - currentPlaneModule.plane.position.y, newZ - currentPlaneModule.plane.position.z));
    let collisionDetected = false;
    for (const building of buildings) {
        if (checkCollision(planeBoxProposed, building.boundingBox)) {
            collisionDetected = true;
            if (!currentPlaneModule.isCrashed) {
                currentPlaneModule.setIsCrashed(true);
                currentPlaneModule.setCrashTimer(0);
                currentPlaneModule.setSpeed(0);
                currentPlaneModule.setVelocity(0);
                
                // Tocar som de colisão
                playCrashSound();
            }
            break;
        }
    }

    if (!collisionDetected || !currentPlaneModule.isCrashed) {
        currentPlaneModule.plane.position.x = newX;
        currentPlaneModule.plane.position.z = newZ;
        currentPlaneModule.plane.position.y = newY;
    } else if (currentPlaneModule.isCrashed) {
        currentPlaneModule.plane.position.y = newY;
        currentPlaneModule.setSpeed(0);
        currentPlaneModule.setVelocity(0);
    }

    currentPlaneModule.shadow.position.x = currentPlaneModule.plane.position.x;
    currentPlaneModule.shadow.position.z = currentPlaneModule.plane.position.z;
    const height = currentPlaneModule.plane.position.y - 0.1;
    const shadowScale = Math.max(0.2, 1 - height / 100);
    currentPlaneModule.shadow.scale.set(shadowScale, shadowScale, 1);
    currentPlaneModule.shadow.material.opacity = Math.max(0.1, 0.5 - height / 20);

    currentPlaneModule.planeBox.setFromObject(currentPlaneModule.plane);

    clouds.forEach(cloud => {
        cloud.position.x += 0.01;
        if (cloud.position.x > 100) cloud.position.x = -100;
    });

    updateCamera();

    const altitudeDisplay = document.getElementById('altitude');
    const speedDisplay = document.getElementById('speed');
    altitudeDisplay.textContent = ((currentPlaneModule.plane.position.y - 0.1) * 4).toFixed(1);
    speedDisplay.textContent = (currentPlaneModule.speed * 450).toFixed(1);

    renderer.render(scene, camera);
}

animate();

// --- AJUSTE DE TELA ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- CONTROLES MOBILE COM JOYSTICK ---
function ajustarControlesMobile() {
    const largura = window.innerWidth;
    const altura = window.innerHeight;
    const controles = document.querySelector(".mobile-controls");
    const acelerador = document.getElementById("accelerator-btn");

    if (altura > largura) {
        controles.style.display = "flex";
        camera.fov = 115;
    } else {
        controles.style.display = "none";
        camera.fov = 85;
    }
    camera.updateProjectionMatrix();

    if (largura > 500) {
        acelerador.style.width = "160px";
        acelerador.style.height = "110px";
        acelerador.style.fontSize = "30px";
    } else {
        acelerador.style.width = "100px";
        acelerador.style.height = "60px";
        acelerador.style.fontSize = "18px";
    }
}

window.addEventListener("load", ajustarControlesMobile);
window.addEventListener("resize", ajustarControlesMobile);

// --- LÓGICA DO JOYSTICK ---
const joystickContainer = document.getElementById('joystick-container');
const joystick = document.getElementById('joystick');
let isDragging = false;

function handleJoystickStart(event) {
    event.preventDefault();
    if (!currentPlaneModule) return;
    isDragging = true;
    joystick.style.background = 'rgba(83, 85, 237, 0.8)';
    handleJoystickMove(event);
}

function handleJoystickMove(event) {
    if (!isDragging || !currentPlaneModule) return;

    const rect = joystickContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const touch = event.type.includes('touch') ? event.touches[0] : event;
    let offsetX = touch.clientX - centerX;
    let offsetY = touch.clientY - centerY;

    const radius = rect.width / 2 - joystick.offsetWidth / 2;
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    if (distance > radius) {
        const angle = Math.atan2(offsetY, offsetX);
        offsetX = Math.cos(angle) * radius;
        offsetY = Math.sin(angle) * radius;
    }

    joystick.style.left = `calc(50% + ${offsetX}px)`;
    joystick.style.top = `calc(50% + ${offsetY}px)`;

    const normalizedX = offsetX / radius;
    const normalizedY = offsetY / radius;

    keys.a = normalizedX < -0.3;
    keys.d = normalizedX > 0.3;
    keys.w = normalizedY < -0.3;
    keys.s = normalizedY > 0.3;
}

function handleJoystickEnd(event) {
    event.preventDefault();
    if (!currentPlaneModule) return;
    isDragging = false;
    joystick.style.left = '50%';
    joystick.style.top = '50%';
    joystick.style.background = 'rgba(255, 255, 255, 0.36)';
    keys.w = false;
    keys.s = false;
    keys.a = false;
    keys.d = false;
}

joystickContainer.addEventListener('mousedown', handleJoystickStart);
joystickContainer.addEventListener('touchstart', handleJoystickStart);
document.addEventListener('mousemove', handleJoystickMove);
document.addEventListener('touchmove', handleJoystickMove);
document.addEventListener('mouseup', handleJoystickEnd);
document.addEventListener('touchend', handleJoystickEnd);
document.addEventListener('touchcancel', handleJoystickEnd);

// --- EVENTOS DO ACELERADOR ---
const acceleratorBtn = document.getElementById('accelerator-btn');

function addButtonEvents(button, action, isKey = true) {
    const startEvent = (e) => {
        e.preventDefault();
        if (!currentPlaneModule) return;
        if (isKey) keys[action] = true;
        else currentPlaneModule.setIsAccelerating(true);
        button.style.background = 'rgba(83, 85, 237, 0.8)';
    };
    
    const endEvent = (e) => {
        e.preventDefault();
        if (!currentPlaneModule) return;
        if (isKey) keys[action] = false;
        else currentPlaneModule.setIsAccelerating(false);
        button.style.background = 'rgba(255, 255, 255, 0.36)';
    };

    button.addEventListener('mousedown', startEvent);
    button.addEventListener('touchstart', startEvent);
    button.addEventListener('mouseup', endEvent);
    button.addEventListener('touchend', endEvent);
    button.addEventListener('touchcancel', endEvent);
}

addButtonEvents(acceleratorBtn, null, false);

// --- BOTÃO DE CÂMERA ---
const cameraToggleBtn = document.getElementById('camera-toggle-btn');

function toggleCamera(event) {
    event.preventDefault();
    isCameraBehind = !isCameraBehind;
    cameraToggleBtn.classList.toggle('active');
}

cameraToggleBtn.addEventListener('click', toggleCamera);
cameraToggleBtn.addEventListener('touchstart', toggleCamera);

// --- DROPDOWN DE SELEÇÃO DE AVIÃO ---
const planeSelector = document.querySelector('.plane-selector');
const dropdownBtn = document.querySelector('.dropdown-btn');
const dropdownContent = document.querySelector('.dropdown-content');
const planeOptions = dropdownContent.querySelectorAll('button');

function toggleDropdown(event) {
    event.preventDefault();
    planeSelector.classList.toggle('active');
}

function closeDropdown(event) {
    if (!planeSelector.contains(event.target)) {
        planeSelector.classList.remove('active');
    }
}

// Adicionar eventos ao botão de abrir/fechar o dropdown
dropdownBtn.addEventListener('click', toggleDropdown);
dropdownBtn.addEventListener('touchstart', toggleDropdown);

// Adicionar eventos às opções do dropdown
planeOptions.forEach(option => {
    option.addEventListener('click', (event) => {
        event.preventDefault();
        const planeFile = option.getAttribute('onclick').match(/'([^']+)'/)[1];
        loadPlane(planeFile);
        planeSelector.classList.remove('active'); // Fechar o dropdown após selecionar
    });
    option.addEventListener('touchstart', (event) => {
        event.preventDefault();
        const planeFile = option.getAttribute('onclick').match(/'([^']+)'/)[1];
        loadPlane(planeFile);
        planeSelector.classList.remove('active'); // Fechar o dropdown após selecionar
    });
});

// Fechar o dropdown ao clicar/tocar fora
document.addEventListener('click', closeDropdown);
document.addEventListener('touchstart', closeDropdown);

window.loadPlane = loadPlane;