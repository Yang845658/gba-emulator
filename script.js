// ===== GBA 模拟器配置 =====
let isRunning = false;
let currentRom = null;
let settings = {
    orientation: 'auto',
    soundEnabled: true,
    volume: 0.8,
    keySoundEnabled: true,
    showPerformance: false
};

// ===== DOM 元素 =====
const elements = {
    gameContainer: document.getElementById('game'),
    screenContainer: document.getElementById('screenContainer'),
    overlay: document.getElementById('screenOverlay'),
    noGameMessage: document.getElementById('noGameMessage'),
    closeOverlayBtn: document.getElementById('closeOverlayBtn'),
    gameTitleDisplay: document.getElementById('gameTitleDisplay'),
    statusDisplay: document.getElementById('statusDisplay'),
    romFileInput: document.getElementById('romFileInput'),
    loadRomBtn: document.getElementById('loadRomBtn'),
    resetBtn: document.getElementById('resetBtn'),
    saveStateBtn: document.getElementById('saveStateBtn'),
    loadStateBtn: document.getElementById('loadStateBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    gamesListBtn: document.getElementById('gamesListBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    gamesSidebar: document.getElementById('gamesSidebar'),
    closeGamesSidebar: document.getElementById('closeGamesSidebar'),
    romList: document.getElementById('romList'),
    romSearchInput: document.getElementById('romSearchInput'),
    settingsPanel: document.getElementById('settingsPanel'),
    closeSettings: document.getElementById('closeSettings'),
    orientationSelect: document.getElementById('orientationSelect'),
    soundToggle: document.getElementById('soundToggle'),
    volumeSlider: document.getElementById('volumeSlider'),
    keySoundToggle: document.getElementById('keySoundToggle'),
    performanceToggle: document.getElementById('performanceToggle'),
    emulatorContainer: document.getElementById('emulatorContainer')
};

// 存储所有 ROM 数据
let allRoms = [];
let recentGames = [];
let currentUser = null;
let db = null; // IndexedDB 数据库

// IndexedDB 初始化
const DB_NAME = 'GBA_Emulator_DB';
const DB_VERSION = 1;
const STORE_NAME = 'saveStates';

// IndexedDB 初始化
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('IndexedDB 错误:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB 初始化成功');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // 创建存档存储
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('userId', 'userId', { unique: false });
                store.createIndex('gameName', 'gameName', { unique: false });
                console.log('创建存档存储成功');
            }
        };
    });
}

// 保存存档（用户独立）
async function saveUserSaveState(gameName, stateData) {
    if (!db || !currentUser) return false;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const saveData = {
            id: `${currentUser.id}_${gameName}`,
            userId: currentUser.id,
            gameName: gameName,
            state: stateData,
            timestamp: Date.now()
        };
        
        const request = store.put(saveData);
        
        request.onsuccess = () => {
            console.log(`存档保存成功：${gameName}`);
            resolve(true);
        };
        
        request.onerror = () => {
            console.error('存档保存失败:', request.error);
            reject(request.error);
        };
    });
}

// 读取存档（用户独立）
async function loadUserSaveState(gameName) {
    if (!db || !currentUser) return null;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(`${currentUser.id}_${gameName}`);
        
        request.onsuccess = () => {
            if (request.result) {
                console.log(`读取存档成功：${gameName}`);
                resolve(request.result.state);
            } else {
                resolve(null);
            }
        };
        
        request.onerror = () => {
            console.error('读取存档失败:', request.error);
            reject(request.error);
        };
    });
}

// 列出用户所有存档
async function listUserSaveStates() {
    if (!db || !currentUser) return [];
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('userId');
        const request = index.getAll(IDBKeyRange.only(currentUser.id));
        
        request.onsuccess = () => {
            const saves = request.result || [];
            saves.sort((a, b) => b.timestamp - a.timestamp);
            resolve(saves);
        };
        
        request.onerror = () => {
            console.error('列出存档失败:', request.error);
            reject(request.error);
        };
    });
}

// 删除存档
async function deleteUserSaveState(gameName) {
    if (!db || !currentUser) return false;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(`${currentUser.id}_${gameName}`);
        
        request.onsuccess = () => {
            console.log(`删除存档成功：${gameName}`);
            resolve(true);
        };
        
        request.onerror = () => {
            console.error('删除存档失败:', request.error);
            reject(request.error);
        };
    });
}

// 用户相关
function getCurrentUser() {
    const saved = localStorage.getItem('gba_current_user');
    if (saved) {
        return JSON.parse(saved);
    }
    return null;
}

function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem('gba_current_user', JSON.stringify(user));
    updateUserDisplay();
    loadUserData();
}

function loadUserData() {
    if (!currentUser) return;
    
    // 加载该用户的最近游戏
    const userRecent = localStorage.getItem(`gba_recent_${currentUser.id}`);
    recentGames = userRecent ? JSON.parse(userRecent) : [];
    displayRecentGames();
    
    console.log(`加载用户 ${currentUser.name} 的数据`);
}

function saveUserData() {
    if (!currentUser) return;
    localStorage.setItem(`gba_recent_${currentUser.id}`, JSON.stringify(recentGames));
}

function updateUserDisplay() {
    const userDisplay = document.getElementById('userDisplay');
    if (!userDisplay) return;
    
    if (currentUser) {
        userDisplay.innerHTML = `
            <span class="user-avatar">👤</span>
            <span class="user-name">${currentUser.name}</span>
            <button class="user-switch-btn" id="userSwitchBtn" title="切换用户">⇄</button>
        `;
        
        // 绑定切换用户按钮
        const switchBtn = document.getElementById('userSwitchBtn');
        if (switchBtn) {
            switchBtn.addEventListener('click', showUserSwitchModal);
        }
    } else {
        userDisplay.innerHTML = `
            <button class="user-login-btn" id="userLoginBtn">👤 登录</button>
        `;
        
        const loginBtn = document.getElementById('userLoginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', showUserLoginModal);
        }
    }
}

// ===== 初始化 =====
async function init() {
    // 初始化 IndexedDB
    try {
        await initDB();
    } catch (error) {
        console.error('IndexedDB 初始化失败:', error);
    }
    
    // 加载当前用户
    currentUser = getCurrentUser();
    
    loadSettings();
    bindEvents();
    
    // 显示用户
    updateUserDisplay();
    
    // 加载用户数据
    loadUserData();
    
    // 显示最近游戏
    displayRecentGames();
    
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        scanRoms();
    } else {
        elements.romList.innerHTML = '<p class="rom-list-hint">请使用 HTTP 服务器访问<br><small>python3 -m http.server 8080</small></p>';
    }
    
    updateStatus('就绪');
    
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    console.log('GBA 模拟器初始化完成');
}

// ===== 事件绑定 =====
function bindEvents() {
    elements.loadRomBtn.addEventListener('click', (e) => {
        e.preventDefault();
        elements.romFileInput.click();
    });
    
    elements.romFileInput.addEventListener('change', handleRomSelect);
    
    elements.resetBtn.addEventListener('click', () => {
        if (window.EJS_emulator && window.EJS_emulator.reset) {
            window.EJS_emulator.reset();
            updateStatus('已重置');
            playKeySound();
        }
    });
    
    elements.saveStateBtn.addEventListener('click', async () => {
        if (window.EJS_emulator && window.EJS_emulator.saveState) {
            window.EJS_emulator.saveState();
            
            // 如果已登录，保存到 IndexedDB
            if (currentUser && elements.gameTitleDisplay.textContent !== '未加载游戏') {
                try {
                    // EmulatorJS 会自动保存，我们这里只是记录
                    const gameName = elements.gameTitleDisplay.textContent;
                    await saveUserSaveState(gameName, { saved: true, timestamp: Date.now() });
                    updateStatus(`存档已保存 (${currentUser.name})`);
                } catch (error) {
                    console.error('保存用户存档失败:', error);
                }
            } else {
                updateStatus('状态已保存');
            }
            playKeySound();
        }
    });
    
    elements.loadStateBtn.addEventListener('click', async () => {
        if (window.EJS_emulator && window.EJS_emulator.loadState) {
            if (currentUser && elements.gameTitleDisplay.textContent !== '未加载游戏') {
                try {
                    const gameName = elements.gameTitleDisplay.textContent;
                    const savedState = await loadUserSaveState(gameName);
                    if (savedState) {
                        updateStatus('存档已读取');
                    } else {
                        updateStatus('未找到存档');
                    }
                } catch (error) {
                    console.error('读取用户存档失败:', error);
                }
            }
            window.EJS_emulator.loadState();
            playKeySound();
        }
    });
    
    elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // 游戏列表按钮
    elements.gamesListBtn.addEventListener('click', () => {
        elements.gamesSidebar.classList.add('open');
        playKeySound();
    });
    
    elements.closeGamesSidebar.addEventListener('click', () => {
        elements.gamesSidebar.classList.remove('open');
        playKeySound();
    });
    
    // 点击侧边栏外部关闭
    elements.gamesSidebar.addEventListener('click', (e) => {
        if (e.target === elements.gamesSidebar) {
            elements.gamesSidebar.classList.remove('open');
        }
    });
    
    // 设置按钮
    elements.settingsBtn.addEventListener('click', () => elements.settingsPanel.classList.add('open'));
    elements.closeSettings.addEventListener('click', () => elements.settingsPanel.classList.remove('open'));
    
    // 搜索功能
    if (elements.romSearchInput) {
        elements.romSearchInput.addEventListener('input', (e) => {
            filterRomList(e.target.value.toLowerCase().trim());
        });
    }
    
    // 模态框事件
    setupModalEvents();
    setupManageSavesEvents();
    
    if (elements.closeOverlayBtn) {
        elements.closeOverlayBtn.addEventListener('click', () => {
            elements.overlay.style.display = 'none';
            hideEJSDefaultControls();
            forceRefreshGameDisplay();
        });
    }
    
    elements.orientationSelect.addEventListener('change', (e) => {
        settings.orientation = e.target.value;
        applyOrientation();
        saveSettings();
    });
    
    elements.soundToggle.addEventListener('change', (e) => {
        settings.soundEnabled = e.target.checked;
        saveSettings();
    });
    
    elements.volumeSlider.addEventListener('input', (e) => {
        settings.volume = e.target.value / 100;
        saveSettings();
    });
    
    elements.keySoundToggle.addEventListener('change', (e) => {
        settings.keySoundEnabled = e.target.checked;
        saveSettings();
    });
    
    elements.performanceToggle.addEventListener('change', (e) => {
        settings.showPerformance = e.target.checked;
        if (settings.showPerformance) startPerformanceMonitor();
        else stopPerformanceMonitor();
        saveSettings();
    });
    
    window.addEventListener('resize', handleResize);
    // 不再绑定自定义触摸按键（已隐藏），使用 EmulatorJS 原生触摸控制
    bindKeyboardControls();
}

// ===== ROM 处理 =====
function handleRomSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    loadRomFile(file);
    elements.romFileInput.value = '';
}

// 初始化模拟器（在 loader.js 加载后调用）
function initEmulator(gameName) {
    const onReady = (e) => {
        window.removeEventListener('EJS_emulatorReady', onReady);
        window.EJS_emulator = e.detail.emulator;
        console.log('模拟器已就绪');
        updateStatus('游戏运行中');
        elements.overlay.style.display = 'none';
        hideEJSDefaultControls();
        forceRefreshGameDisplay();
    };
    window.addEventListener('EJS_emulatorReady', onReady, { once: true });
    
    const onGameLoaded = () => {
        window.removeEventListener('EJS_gameLoaded', onGameLoaded);
        console.log('游戏已加载');
        updateStatus('游戏运行中');
        elements.overlay.style.display = 'none';
        hideEJSDefaultControls();
        forceRefreshGameDisplay();
    };
    window.addEventListener('EJS_gameLoaded', onGameLoaded, { once: true });
    
    const onError = (e) => {
        window.removeEventListener('EJS_error', onError);
        console.error('EmulatorJS 错误:', e.detail);
        elements.overlay.style.display = 'flex';
        elements.noGameMessage.innerHTML = '<p class="message-icon">❌</p><p>加载失败</p><p class="message-hint">' + (e.detail?.message || '未知错误') + '</p>';
    };
    window.addEventListener('EJS_error', onError, { once: true });
    
    setTimeout(() => {
        if (elements.overlay && elements.overlay.style.display !== 'none') {
            console.log('强制隐藏覆盖层');
            elements.overlay.style.display = 'none';
            hideEJSDefaultControls();
            forceRefreshGameDisplay();
        }
    }, 5000);
    
    setTimeout(() => {
        forceRefreshGameDisplay();
    }, 8000);
    
    isRunning = true;
    updateStatus(`加载：${gameName}`);
    console.log(`ROM 加载成功：${gameName}`);
}

async function loadRomFile(file) {
    try {
        updateStatus('正在加载...');
        elements.overlay.style.display = 'flex';
        elements.noGameMessage.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>正在加载游戏...</p></div>';
        
        const gameName = file.name.replace('.gba', '');
        elements.gameTitleDisplay.textContent = gameName;
        
        const romUrl = URL.createObjectURL(file);
        currentRom = romUrl;
        
        elements.gameContainer.innerHTML = '';
        await new Promise(r => setTimeout(r, 200));
        
        window.EJS_player = '#game';
        window.EJS_gameUrl = romUrl;
        
        // 检查 loader.js 是否已经加载，避免重复加载导致变量冲突
        if (window.EJS_loaderLoaded) {
            console.log('EmulatorJS loader 已加载，跳过重复加载');
            initEmulator(gameName);
            return;
        }
        
        window.EJS_core = 'gba';
        window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/'; // 使用 CDN 加載核心文件
        window.EJS_startOnLoaded = true;
        window.EJS_volume = settings.volume;
        window.EJS_color = '#00d9ff';
        window.EJS_hideMenu = false;
        window.EJS_debug = false;
        window.EJS_allowFullscreen = false;
        window.EJS_language = 'en-US'; // 設置語言避免加載 zh-TW
        
        const script = document.createElement('script');
        script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
        script.onload = () => {
            window.EJS_loaderLoaded = true;
            console.log('EmulatorJS loader 加载成功');
            initEmulator(gameName);
        };
        script.onerror = (e) => {
            console.error('EmulatorJS loader 加载失败:', e);
            elements.overlay.style.display = 'flex';
            elements.noGameMessage.innerHTML = '<p class="message-icon">❌</p><p>加载失败</p><p class="message-hint">请检查网络连接</p>';
        };
        document.head.appendChild(script);
    } catch (error) {
        elements.overlay.style.display = 'flex';
        elements.noGameMessage.innerHTML = '<p class="message-icon">❌</p><p>加载失败</p><p class="message-hint">' + error.message + '</p>';
        updateStatus(`加载失败：${error.message}`);
        console.error('ROM 加载失败:', error);
    }
}

// 不再隐藏 EmulatorJS 的 UI - 使用原生按键
function hideEJSDefaultControls() {
    // 不做任何操作，保留 EmulatorJS 的原生 UI
}

// 强制刷新游戏画面
function forceRefreshGameDisplay() {
    // 不需要额外操作，EmulatorJS 会自动处理
}

// ===== 扫描 ROM 文件夹 =====
async function scanRoms() {
    try {
        const response = await fetch('roms/');
        if (!response.ok) throw new Error('无法访问 roms 文件夹');
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = doc.querySelectorAll('a');
        
        const romFiles = [];
        links.forEach(link => {
            const href = link.getAttribute('href');
            // 排除 README.md 等非 ROM 文件
            if (href && href.toLowerCase().endsWith('.gba') && !href.startsWith('?')) {
                romFiles.push({
                    name: decodeURIComponent(href.replace('.gba', '')),
                    url: `roms/${href}`,
                    size: ''
                });
            }
        });
        
        // 按名称排序
        romFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        
        displayRomList(romFiles);
    } catch (error) {
        console.log('ROM 扫描失败:', error.message);
        elements.romList.innerHTML = `
            <div class="rom-list-error">
                <p>⚠️ 无法扫描 ROM 文件夹</p>
                <p class="rom-list-hint">请确保：<br>1. 使用 HTTP 服务器访问<br>2. roms 文件夹存在且有 .gba 文件</p>
            </div>
        `;
    }
}

// 显示用户登录模态框
function showUserLoginModal() {
    const modal = document.getElementById('userLoginModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('userNameInput');
        if (input) input.focus();
    }
}

// 显示用户切换模态框
function showUserSwitchModal() {
    const modal = document.getElementById('userSwitchModal');
    if (modal) {
        modal.style.display = 'flex';
        const currentNameEl = document.getElementById('currentUserName');
        if (currentNameEl && currentUser) {
            currentNameEl.textContent = currentUser.name;
        }
    }
}

// 设置存档管理事件
function setupManageSavesEvents() {
    const manageSavesModal = document.getElementById('manageSavesModal');
    const manageSavesBtn = document.getElementById('manageSavesBtn');
    const closeManageSaves = document.getElementById('closeManageSaves');
    
    if (manageSavesBtn) {
        manageSavesBtn.addEventListener('click', async () => {
            if (!currentUser) {
                alert('请先登录用户');
                showUserLoginModal();
                return;
            }
            
            manageSavesModal.style.display = 'flex';
            await loadSavesList();
        });
    }
    
    if (closeManageSaves) {
        closeManageSaves.addEventListener('click', () => {
            manageSavesModal.style.display = 'none';
        });
    }
    
    if (manageSavesModal) {
        manageSavesModal.addEventListener('click', (e) => {
            if (e.target === manageSavesModal) {
                manageSavesModal.style.display = 'none';
            }
        });
    }
}

// 加载存档列表
async function loadSavesList() {
    const content = document.getElementById('savesListContent');
    if (!content) return;
    
    try {
        const saves = await listUserSaveStates();
        
        if (saves.length === 0) {
            content.innerHTML = '<p class="modal-hint">暂无存档</p>';
            return;
        }
        
        content.innerHTML = saves.map(save => {
            const date = new Date(save.timestamp).toLocaleString('zh-CN');
            return `
                <div class="save-item" data-game="${save.gameName}">
                    <div class="save-info">
                        <div class="save-name">${save.gameName}</div>
                        <div class="save-time">${date}</div>
                    </div>
                    <button class="btn btn-secondary delete-save-btn" data-game="${save.gameName}">删除</button>
                </div>
            `;
        }).join('');
        
        // 绑定删除按钮
        content.querySelectorAll('.delete-save-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const gameName = btn.dataset.game;
                if (confirm(`确定删除 ${gameName} 的存档吗？`)) {
                    await deleteUserSaveState(gameName);
                    await loadSavesList();
                }
            });
        });
        
    } catch (error) {
        content.innerHTML = `<p class="modal-hint">加载失败：${error.message}</p>`;
    }
}

// 设置模态框事件
function setupModalEvents() {
    const loginModal = document.getElementById('userLoginModal');
    const switchModal = document.getElementById('userSwitchModal');
    
    // 关闭登录模态框
    const closeLogin = document.getElementById('closeLoginModal');
    if (closeLogin) {
        closeLogin.addEventListener('click', () => loginModal.style.display = 'none');
    }
    
    // 确认登录
    const confirmLogin = document.getElementById('confirmLoginBtn');
    if (confirmLogin) {
        confirmLogin.addEventListener('click', () => {
            const input = document.getElementById('userNameInput');
            const name = input.value.trim();
            if (name) {
                setCurrentUser({
                    id: 'user_' + Date.now(),
                    name: name,
                    createdAt: Date.now()
                });
                loginModal.style.display = 'none';
                input.value = '';
            }
        });
        
        // 回车登录
        const input = document.getElementById('userNameInput');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') confirmLogin.click();
            });
        }
    }
    
    // 关闭切换模态框
    const closeSwitch = document.getElementById('closeSwitchModal');
    if (closeSwitch) {
        closeSwitch.addEventListener('click', () => switchModal.style.display = 'none');
    }
    
    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            currentUser = null;
            localStorage.removeItem('gba_current_user');
            recentGames = [];
            updateUserDisplay();
            displayRecentGames();
            switchModal.style.display = 'none';
            updateStatus('已退出登录');
        });
    }
    
    // 切换用户
    const switchBtn = document.getElementById('switchUserBtn');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            switchModal.style.display = 'none';
            showUserLoginModal();
        });
    }
    
    // 点击外部关闭
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) loginModal.style.display = 'none';
        });
    }
    if (switchModal) {
        switchModal.addEventListener('click', (e) => {
            if (e.target === switchModal) switchModal.style.display = 'none';
        });
    }
}

// 从 URL 加载 ROM（带进度显示）
async function loadRomFromUrl(url, name) {
    try {
        updateStatus(`正在加载：${name}`);
        elements.overlay.style.display = 'flex';
        
        // 显示加载进度
        let progressText = '正在连接...';
        elements.noGameMessage.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>正在加载 ${name}</p>
                <p class="loading-progress" id="loadProgress">${progressText}</p>
            </div>
        `;
        
        elements.gameTitleDisplay.textContent = name;
        
        // 关闭侧边栏
        elements.gamesSidebar.classList.remove('open');
        
        // 开始加载
        const startTime = Date.now();
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('无法下载 ROM 文件');
        
        progressText = '正在下载...';
        updateLoadProgress(progressText);
        
        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength || 0);
        
        // 如果是大文件，显示进度
        if (total > 1024 * 1024) { // > 1MB
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                
                chunks.push(value);
                loaded += value.length;
                
                if (total > 0) {
                    const percent = Math.round((loaded / total) * 100);
                    updateLoadProgress(`下载中 ${percent}% (${formatSize(loaded)}/${formatSize(total)})`);
                }
            }
            
            const blob = new Blob(chunks);
            const file = new File([blob], name + '.gba', { type: 'application/octet-stream' });
            
            updateLoadProgress('正在启动...');
            await loadRomFile(file);
        } else {
            // 小文件直接加载
            const blob = await response.blob();
            const file = new File([blob], name + '.gba', { type: 'application/octet-stream' });
            await loadRomFile(file);
        }
        
        // 添加到最近游戏
        addToRecentGames(name, url);
        
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`游戏加载完成：${name} (${loadTime}秒)`);
        
    } catch (error) {
        console.error('ROM 加载失败:', error);
        elements.overlay.style.display = 'flex';
        elements.noGameMessage.innerHTML = `
            <p class="message-icon">❌</p>
            <p>加载失败</p>
            <p class="message-hint">${error.message}</p>
        `;
        updateStatus(`加载失败：${error.message}`);
    }
}

// 更新加载进度
function updateLoadProgress(text) {
    const progressEl = document.getElementById('loadProgress');
    if (progressEl) {
        progressEl.textContent = text;
    }
}

// 格式化文件大小
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 添加到最近游戏（用户独立）
async function addToRecentGames(name, url) {
    if (!currentUser) {
        // 未登录用户也记录，但使用通用存储
        recentGames = recentGames.filter(g => g.name !== name);
        recentGames.unshift({ name, url, lastPlayed: Date.now() });
        recentGames = recentGames.slice(0, 10);
        localStorage.setItem('gba_recent_games', JSON.stringify(recentGames));
    } else {
        // 登录用户，使用用户独立存储
        recentGames = recentGames.filter(g => g.name !== name);
        recentGames.unshift({ name, url, lastPlayed: Date.now() });
        recentGames = recentGames.slice(0, 10);
        saveUserData();
        
        // 同时在 IndexedDB 记录游戏游玩历史
        try {
            const transaction = db.transaction(['saveStates'], 'readwrite');
            const store = transaction.objectStore('saveStates');
            const historyData = {
                id: `${currentUser.id}_history_${name}`,
                userId: currentUser.id,
                gameName: name,
                gameUrl: url,
                lastPlayed: Date.now(),
                playCount: 1
            };
            store.put(historyData);
        } catch (error) {
            console.log('记录游戏历史失败:', error);
        }
    }
    
    displayRecentGames();
}

// 显示最近游戏
function displayRecentGames() {
    const section = document.getElementById('recentGamesSection');
    const list = document.getElementById('recentGamesList');
    
    if (recentGames.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    list.innerHTML = recentGames.map(game => {
        const timeAgo = getTimeAgo(game.lastPlayed);
        return `
            <div class="recent-game-item" data-url="${game.url}" data-name="${game.name}">
                <span class="recent-game-icon">🕹️</span>
                <div class="recent-game-info">
                    <div class="recent-game-name">${game.name}</div>
                    <div class="recent-game-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // 绑定点击事件
    list.querySelectorAll('.recent-game-item').forEach(item => {
        item.addEventListener('click', function() {
            const url = this.dataset.url;
            const name = this.dataset.name;
            loadRomFromUrl(url, name);
        });
    });
    
    // 绑定清除按钮
    const clearBtn = document.getElementById('clearRecentBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            recentGames = [];
            localStorage.removeItem('gba_recent_games');
            displayRecentGames();
        });
    }
}

// 获取相对时间
function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`;
    
    return new Date(timestamp).toLocaleDateString('zh-CN');
}

// 过滤 ROM 列表
function filterRomList(searchTerm) {
    if (!searchTerm) {
        displayRomList(allRoms);
        return;
    }
    
    const filtered = allRoms.filter(rom => 
        rom.name.toLowerCase().includes(searchTerm)
    );
    
    displayRomList(filtered, searchTerm);
}

// 修改 displayRomList 支持搜索提示
function displayRomList(roms, searchTerm = '') {
    allRoms = roms; // 保存所有 ROM 数据
    
    if (roms.length === 0) {
        if (searchTerm) {
            elements.romList.innerHTML = `
                <div class="rom-list-empty">
                    <p class="empty-icon">🔍</p>
                    <p>没有找到"${searchTerm}"</p>
                    <p class="rom-list-hint">尝试其他关键词</p>
                </div>
            `;
        } else {
            elements.romList.innerHTML = `
                <div class="rom-list-empty">
                    <p class="empty-icon">📂</p>
                    <p>roms 文件夹为空</p>
                    <p class="rom-list-hint">将 .gba 文件放入 roms 文件夹后刷新页面</p>
                </div>
            `;
        }
        return;
    }
    
    const countHtml = `<div class="rom-count">共 ${roms.length} 个游戏</div>`;
    
    elements.romList.innerHTML = countHtml + roms.map((rom, index) => `
        <div class="rom-item" data-url="${rom.url}" data-name="${rom.name}" data-index="${index}" title="点击加载 ${rom.name}">
            <span class="rom-icon">🎮</span>
            <div class="rom-info">
                <div class="rom-name">${rom.name}</div>
                <div class="rom-size">GBA 游戏 · 点击加载</div>
            </div>
            <span class="rom-load-icon">⬇️</span>
        </div>
    `).join('');
    
    elements.romList.querySelectorAll('.rom-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const url = this.dataset.url;
            const name = this.dataset.name;
            
            loadRomFromUrl(url, name);
        });
    });
}

// ===== 键盘控制 =====
function bindKeyboardControls() {
    // 键盘控制由 EmulatorJS 自动处理
    // 不需要额外绑定
}

// 触摸控制已移除 - 使用 EmulatorJS 原生触摸按键

// 按钮高亮已移除 - 使用 EmulatorJS 原生按键

// 键盘控制已集成到 bindKeyboardControls 中

// ===== 按键音 =====
function playKeySound() {
    if (!settings.keySoundEnabled) return;
    
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.05);
    } catch (e) {}
}

// ===== 性能监控 =====
let performanceInterval = null;

function startPerformanceMonitor() {
    if (performanceInterval) return;
    performanceInterval = setInterval(() => {
        if (window.EJS_emulator && window.EJS_emulator.getFps) {
            updateStatus(`FPS: ${window.EJS_emulator.getFps()}`);
        }
    }, 1000);
}

function stopPerformanceMonitor() {
    if (performanceInterval) {
        clearInterval(performanceInterval);
        performanceInterval = null;
    }
}

function handleResize() {
    hideEJSDefaultControls();
    forceRefreshGameDisplay();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        elements.emulatorContainer.requestFullscreen().catch(err => console.error('全屏失败:', err));
    } else {
        document.exitFullscreen();
    }
    playKeySound();
}

function applyOrientation() {
    const container = elements.emulatorContainer;
    if (settings.orientation === 'landscape') {
        container.style.flexDirection = 'row';
    } else if (settings.orientation === 'portrait') {
        container.style.flexDirection = 'column';
    } else {
        container.style.flexDirection = '';
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('gba_emulator_settings');
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
            elements.orientationSelect.value = settings.orientation;
            elements.soundToggle.checked = settings.soundEnabled;
            elements.volumeSlider.value = settings.volume * 100;
            elements.keySoundToggle.checked = settings.keySoundEnabled;
            elements.performanceToggle.checked = settings.showPerformance;
            applyOrientation();
            if (settings.showPerformance) startPerformanceMonitor();
        }
    } catch (e) {
        console.error('加载设置失败:', e);
    }
}

function saveSettings() {
    try {
        localStorage.setItem('gba_emulator_settings', JSON.stringify(settings));
    } catch (e) {
        console.error('保存设置失败:', e);
    }
}

function updateStatus(message) {
    elements.statusDisplay.textContent = message;
}

// ===== 启动 =====
window.addEventListener('DOMContentLoaded', init);
