// --- State Management ---
        const state = {
            lang: 'en',
            theme: 'light',
            leftHanded: false,
            largerText: false,
            highContrast: false,
            onboardingStep: 1,
            btStatus: 'disconnected',
            connectedPrinter: null,
            works: [],
            currentView: 'onboarding',
            activeTab: 'home',
            selectedPhoto: null,
            selectedPhotoSource: null,
            editSourcePhoto: null,
            cameraStream: null,
            cameraFacingMode: 'environment',
            cameraCanFlip: false,
            cameraDevices: [],
            userPhotos: [],
            lastPrintedPhoto: null,
            lastPrintedSourcePhoto: null,
            lastPrintedFilename: null,
            collageActiveSlot: null,
            collageEditSlot: null,
            pendingCapturedPhoto: null,
            cameraMode: null,
            collageSelectionSource: null,
            collagePressTimer: null,
            collagePressSlot: null,
            collagePressHandled: false,
                        collageDrag: { active: false, pointerId: null, sourceIndex: null, targetIndex: null, phase: 'idle', startX: 0, startY: 0, lastX: 0, lastY: 0 },

            // Collage Added State
            collageLayout: '2x2', // 2x2, rows-2, cols-2
            collagePhotos: [null, null, null, null],
            
            editSettings: { brightness: 100, contrast: 100, frame: 'classic', zoom: 1, offsetX: 0, offsetY: 0 },
            editorActiveTool: 'crop',
            editorImageMeta: { naturalWidth: 0, naturalHeight: 0 },
            editorDrag: { active: false, pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 },
            mainDockDrag: { active: false, pointerId: null, previewTab: null, suppressClickUntil: 0 },
            editorDockDrag: { active: false, pointerId: null, previewTool: null, suppressClickUntil: 0 },
            printInterval: null
        };

        // --- Core UI Updaters ---
        function applyLanguage() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (translations[state.lang] && translations[state.lang][key]) {
                    el.innerText = translations[state.lang][key];
                }
            });
            syncChoiceUI();
            updateCameraFlipButton();
        }

        function applyTheme() {
            const isDark = state.theme === 'dark' || (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            syncChoiceUI();
        }

        function applyAccessibility() {
            const root = document.getElementById('app-root');
            
            if (state.leftHanded) root.classList.add('left-handed');
            else root.classList.remove('left-handed');
            
            if (state.largerText) {
                root.classList.add('text-lg', 'sm:text-xl');
                root.classList.remove('text-base', 'sm:text-lg');
            } else {
                root.classList.remove('text-lg', 'sm:text-xl');
                root.classList.add('text-base', 'sm:text-lg');
            }

            if (state.highContrast) document.body.classList.add('high-contrast-mode');
            else document.body.classList.remove('high-contrast-mode');

            updateToggleUI('toggle-lh', state.leftHanded);
            updateToggleUI('toggle-text', state.largerText);
            updateToggleUI('toggle-hc', state.highContrast);
        }

        function updateToggleUI(id, isChecked) {
            const el = document.getElementById(id);
            if(!el) return;
            el.classList.remove('bg-green-500', 'bg-gray-300', 'dark:bg-gray-700');
            el.classList.add('dark:bg-gray-700');
            el.classList.toggle('is-on', isChecked);
            if (!isChecked) el.classList.add('bg-gray-300');
            const knob = el.querySelector('.toggle-knob');
            if (knob) knob.classList.toggle('translate-x-5', isChecked);
        }

        function setSelectedPhoto(photoUrl, sourceUrl = photoUrl) {
            state.selectedPhoto = photoUrl;
            state.selectedPhotoSource = sourceUrl || photoUrl;
        }

        function getSelectedEditableSource() {
            if (state.currentView === 'editor' && state.editSourcePhoto) {
                return state.editSourcePhoto;
            }
            return state.selectedPhotoSource || state.selectedPhoto;
        }

        function syncChoiceUI() {
            document.querySelectorAll('#setting-lang-toggle .glass-segmented-btn, #onboard-lang-toggle .glass-segmented-btn').forEach(btn => {
                const isEnglish = btn.id === 'btn-lang-en' || btn.id === 'setting-btn-lang-en';
                const isChinese = btn.id === 'btn-lang-zh' || btn.id === 'setting-btn-lang-zh';
                btn.classList.toggle('is-active', (isEnglish && state.lang === 'en') || (isChinese && state.lang === 'zh'));
            });
            document.querySelectorAll('[data-theme-choice]').forEach(btn => {
                btn.classList.toggle('is-active', btn.getAttribute('data-theme-choice') === state.theme);
            });
        }

        function setLang(lang) {
            state.lang = lang;
            applyLanguage();
        }

        function setTheme(theme) {
            state.theme = theme;
            applyTheme();
        }

        function toggleState(key) {
            state[key] = !state[key];
            applyAccessibility();
        }

        function navigate(view) {
            if (state.currentView === 'camera' && view !== 'camera') {
                stopCamera();
                if (view !== 'collage') {
                    state.cameraMode = null;
                    if (state.collageEditSlot === null) state.collageActiveSlot = null;
                }
            }

            document.querySelectorAll('.app-view').forEach(el => {
                el.classList.add('hidden');
                el.classList.remove('flex');
            });
            const target = document.getElementById('view-' + view);
            if (target) {
                target.classList.remove('hidden');
                target.classList.add('flex');
            }
            state.currentView = view;

            // View specific logic
            if (view === 'main') {
                switchTab(state.activeTab);
                updateHomeState();
            } else if (view === 'bt_connect') {
                startBtScan();
            } else if (view === 'camera') {
                startCamera();
            } else if (view === 'library') {
                renderLibrary();
            } else if (view === 'review') {
                document.getElementById('review-img').src = state.selectedPhoto;
            } else if (view === 'editor') {
                initEditor();
            } else if (view === 'printing') {
                startPrinting();
            } else if (view === 'collage') {
                initCollage();
            }
        }

        // --- View Specific Logic ---

        // Onboarding
        function nextOnboardingStep() {
            if (state.onboardingStep < 3) {
                document.getElementById(`onboarding-step-${state.onboardingStep}`).classList.replace('flex', 'hidden');
                state.onboardingStep++;
                document.getElementById(`onboarding-step-${state.onboardingStep}`).classList.replace('hidden', 'flex');
                
                const btn = document.getElementById('onboarding-btn');
                btn.setAttribute('data-i18n', state.onboardingStep === 2 ? 'allowAll' : 'start');
                applyLanguage();
            } else {
                navigate('main');
            }
        }

        // Main Tabs
        function switchTab(tabId, options = {}) {
            state.activeTab = tabId;
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.getElementById(`tab-${tabId}`).classList.remove('hidden');

            document.querySelectorAll('.main-tab-btn').forEach(btn => {
                const isActive = btn.getAttribute('data-tab') === tabId;
                btn.classList.toggle('is-active', isActive);
                if (!options.keepPreview) btn.classList.remove('is-previewed');
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            updateMainDockIndicator({ tabId, dragging: false });
            if (tabId === 'works') renderWorks();
        }

        function getMainDock() {
            return document.getElementById('main-tab-dock');
        }

        function getMainDockButtons() {
            const dock = getMainDock();
            return dock ? Array.from(dock.querySelectorAll('.main-tab-btn')) : [];
        }

        function getMainDockIndicator() {
            return document.getElementById('main-tab-indicator');
        }

        function findNearestMainDockButton(clientX) {
            const buttons = getMainDockButtons();
            if (!buttons.length) return null;

            let nearest = buttons[0];
            let minDistance = Number.POSITIVE_INFINITY;

            buttons.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const distance = Math.abs(clientX - centerX);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = btn;
                }
            });

            return nearest;
        }

        function updateMainDockIndicator({ tabId = null, button = null, pointerX = null, dragging = false } = {}) {
            const dock = getMainDock();
            const indicator = getMainDockIndicator();
            if (!dock || !indicator) return;

            const dockRect = dock.getBoundingClientRect();
            if (dockRect.width === 0 || dockRect.height === 0) return;

            const targetButton =
                button ||
                getMainDockButtons().find(btn => btn.dataset.tab === tabId) ||
                dock.querySelector('.main-tab-btn.is-active') ||
                dock.querySelector('.main-tab-btn');

            if (!targetButton) return;

            const btnRect = targetButton.getBoundingClientRect();
            let width = btnRect.width;
            let x = btnRect.left - dockRect.left;

            if (dragging) {
                const expandedWidth = Math.min(dockRect.width - 10, btnRect.width + 18);
                const baseCenter = x + btnRect.width / 2;
                let center = baseCenter;

                if (typeof pointerX === 'number') {
                    const relativeX = pointerX - dockRect.left;
                    const drift = (relativeX - baseCenter) * 0.26;
                    center = Math.max(expandedWidth / 2 + 4, Math.min(dockRect.width - expandedWidth / 2 - 4, baseCenter + drift));
                }

                width = expandedWidth;
                x = center - width / 2;
                dock.classList.add('is-dragging');
                indicator.classList.add('is-dragging');
            } else {
                dock.classList.remove('is-dragging');
                indicator.classList.remove('is-dragging');
            }

            indicator.style.width = `${width}px`;
            indicator.style.transform = `translateX(${x}px) scale(${dragging ? 1.045 : 1})`;
            indicator.style.opacity = '1';
        }

        function previewMainDockTab(tabId, pointerX = null) {
            const buttons = getMainDockButtons();
            const targetButton = buttons.find(btn => btn.dataset.tab === tabId);
            if (!targetButton) return;

            buttons.forEach(btn => {
                btn.classList.toggle('is-previewed', btn === targetButton);
            });

            state.mainDockDrag.previewTab = tabId;
            updateMainDockIndicator({ button: targetButton, pointerX, dragging: true });
        }

        function previewNearestMainDockTab(clientX) {
            const button = findNearestMainDockButton(clientX);
            if (!button) return;
            previewMainDockTab(button.dataset.tab, clientX);
        }

        function clearMainDockPreview() {
            getMainDockButtons().forEach(btn => btn.classList.remove('is-previewed'));
            state.mainDockDrag.previewTab = null;
        }

        function startMainDockDrag(event) {
            const dock = getMainDock();
            if (!dock) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            state.mainDockDrag.active = true;
            state.mainDockDrag.pointerId = event.pointerId;
            dock.setPointerCapture?.(event.pointerId);
            previewNearestMainDockTab(event.clientX);
            event.preventDefault();
        }

        function handleMainDockDrag(event) {
            if (!state.mainDockDrag.active || event.pointerId !== state.mainDockDrag.pointerId) return;
            previewNearestMainDockTab(event.clientX);
            event.preventDefault();
        }

        function finishMainDockDrag(pointerId = null, revert = false) {
            const dock = getMainDock();
            if (!state.mainDockDrag.active) return;
            if (pointerId !== null && pointerId !== state.mainDockDrag.pointerId) return;

            if (dock && state.mainDockDrag.pointerId !== null && dock.hasPointerCapture?.(state.mainDockDrag.pointerId)) {
                try {
                    dock.releasePointerCapture(state.mainDockDrag.pointerId);
                } catch (error) {
                    // ignore pointer capture release errors
                }
            }

            const finalTab = revert ? state.activeTab : (state.mainDockDrag.previewTab || state.activeTab);
            state.mainDockDrag.active = false;
            state.mainDockDrag.pointerId = null;
            state.mainDockDrag.suppressClickUntil = performance.now() + 220;

            clearMainDockPreview();
            switchTab(finalTab);
        }

        function initMainDock() {
            const dock = getMainDock();
            if (!dock || dock.dataset.ready === 'true') return;

            dock.dataset.ready = 'true';
            dock.addEventListener('pointerdown', startMainDockDrag);
            dock.addEventListener('pointermove', handleMainDockDrag);
            dock.addEventListener('pointerup', event => finishMainDockDrag(event.pointerId, false));
            dock.addEventListener('pointercancel', event => finishMainDockDrag(event.pointerId, true));
            dock.addEventListener('lostpointercapture', () => {
                if (state.mainDockDrag.active) finishMainDockDrag(null, false);
            });

            getMainDockButtons().forEach(btn => {
                btn.addEventListener('click', event => {
                    if (performance.now() < state.mainDockDrag.suppressClickUntil) {
                        event.preventDefault();
                        return;
                    }
                    switchTab(btn.dataset.tab);
                });
            });

            window.addEventListener('resize', () => {
                updateMainDockIndicator({ tabId: state.activeTab, dragging: false });
            });
        }

        function updateHomeState() {
            const isConnected = state.btStatus === 'connected';
            const badge = document.getElementById('bt-status-badge');
            const icon = document.getElementById('bt-status-icon');
            const text = document.getElementById('bt-status-text');
            const container = document.getElementById('hero-printer-container');
            const heroImg = document.getElementById('hero-printer-img');
            const heroText = document.getElementById('hero-status-text');
            const settingPrinter = document.getElementById('setting-printer-name');
        
            if (!badge || !icon || !text || !container || !heroImg || !heroText || !settingPrinter) {
                return;
            }
        
            if (isConnected) {
                badge.className = "flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
                icon.setAttribute('data-lucide', 'bluetooth');
        
                text.innerText = state.connectedPrinter?.name || 'DropNow Air';
                text.removeAttribute('data-i18n');
        
                container.classList.remove('scale-95', 'is-disconnected');
                container.classList.add('scale-100');
                container.classList.add('is-connected');
        
                heroImg.src = 'assets/printer_connected.png';
                heroImg.classList.remove('is-disconnected');
        
                heroText.setAttribute('data-i18n', 'readyToPrint');
        
                settingPrinter.innerText = state.connectedPrinter?.name || 'DropNow Air';
                settingPrinter.removeAttribute('data-i18n');
            } else {
                badge.className = "flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
                icon.setAttribute('data-lucide', 'bluetooth-off');
        
                text.setAttribute('data-i18n', 'printerDisconnected');
        
                container.classList.add('scale-95', 'is-disconnected');
                container.classList.remove('scale-100');
                container.classList.remove('is-connected');
        
                heroImg.src = 'assets/printer_disconnected.png';
                heroImg.classList.add('is-disconnected');
        
                heroText.setAttribute('data-i18n', 'connectPrinter');
        
                settingPrinter.setAttribute('data-i18n', 'printerDisconnected');
            }
        
            lucide.createIcons();
            applyLanguage();
        }

        function handleMainAction() {
            if (state.btStatus === 'connected') {
                toggleActionSheet(true);
            } else {
                navigate('bt_connect');
            }
        }

        function toggleActionSheet(show) {
            const sheet = document.getElementById('action-sheet');
            if (show) {
                sheet.classList.remove('hidden');
                sheet.classList.add('flex');
            } else {
                sheet.classList.add('hidden');
                sheet.classList.remove('flex');
            }
        }

        // BT Connect
        function startBtScan() {
            const pulse = document.getElementById('bt-scan-pulse');
            const spinner = document.getElementById('bt-scan-spinner');
            const text = document.getElementById('bt-scan-text');
            const list = document.getElementById('printer-list');
            
            pulse.classList.add('animate-pulse');
            spinner.classList.remove('hidden');
            text.setAttribute('data-i18n', 'scanning');
            list.innerHTML = '';
            applyLanguage();

            setTimeout(() => {
                pulse.classList.remove('animate-pulse');
                spinner.classList.add('hidden');
                text.setAttribute('data-i18n', 'nearbyPrinters');
                applyLanguage();
                
                const printerOrder = { 'DropNow Air': 0, 'DropNow Pro': 1 };
                const sortedPrinters = [...MOCK_PRINTERS].sort((a, b) => {
                    const orderA = printerOrder[a.name] ?? 99;
                    const orderB = printerOrder[b.name] ?? 99;
                    return orderA - orderB || a.name.localeCompare(b.name);
                });

                list.innerHTML = sortedPrinters.map(p => `
                    <div class="liquid-glass-soft p-4 rounded-2xl flex items-center justify-between lh-reverse">
                        <div class="flex items-center gap-3 lh-reverse">
                            <i data-lucide="printer" class="text-gray-500 dark:text-gray-400"></i>
                            <span class="font-semibold text-gray-900 dark:text-white">${p.name}</span>
                        </div>
                        <button onclick="connectPrinter('${p.id}')" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-full text-sm font-semibold transition-colors" data-i18n="connect"></button>
                    </div>
                `).join('');
                lucide.createIcons();
                applyLanguage();
            }, 1500);
        }

        function connectPrinter(id) {
            state.connectedPrinter = MOCK_PRINTERS.find(p => p.id === id);
            state.btStatus = 'connected';
            const text = document.getElementById('bt-scan-text');
            text.setAttribute('data-i18n', 'connected');
            applyLanguage();
            setTimeout(() => navigate('main'), 600);
        }

        // Camera
        function updateCameraFlipButton() {
            const flipBtn = document.getElementById('camera-flip-btn');
            if (!flipBtn) return;

            const label = translations[state.lang]?.flipCamera || translations.en.flipCamera || 'Flip Camera';
            flipBtn.setAttribute('aria-label', label);
            flipBtn.setAttribute('title', label);
            flipBtn.classList.toggle('hidden', !state.cameraCanFlip);
        }

        function labelMatchesFacingMode(label, desiredFacingMode) {
            const normalizedLabel = String(label || '').toLowerCase();
            if (!normalizedLabel) return false;

            const environmentKeywords = ['back', 'rear', 'environment', 'world', 'traseira', 'tras'];
            const userKeywords = ['front', 'user', 'facetime', 'selfie'];
            const keywords = desiredFacingMode === 'environment' ? environmentKeywords : userKeywords;

            return keywords.some(keyword => normalizedLabel.includes(keyword));
        }

        function getCameraStreamDeviceId(stream) {
            const [track] = stream?.getVideoTracks?.() || [];
            return track?.getSettings?.().deviceId || '';
        }

        function streamMatchesFacingMode(stream, desiredFacingMode) {
            const [track] = stream?.getVideoTracks?.() || [];
            if (!track) return false;

            const settingsFacingMode = String(track.getSettings?.().facingMode || '').toLowerCase();
            if (settingsFacingMode) {
                return settingsFacingMode === desiredFacingMode;
            }

            return labelMatchesFacingMode(track.label, desiredFacingMode);
        }

        function getPreferredCameraDevice(desiredFacingMode) {
            const devices = state.cameraDevices || [];
            if (!devices.length) return null;

            if (desiredFacingMode === 'environment') {
                for (let index = devices.length - 1; index >= 0; index -= 1) {
                    if (labelMatchesFacingMode(devices[index].label, 'environment')) {
                        return devices[index];
                    }
                }
                return devices[devices.length - 1];
            }

            for (const device of devices) {
                if (labelMatchesFacingMode(device.label, 'user')) {
                    return device;
                }
            }

            return devices[0];
        }

        async function detectCameraDevices() {
            if (!navigator.mediaDevices?.enumerateDevices) {
                state.cameraDevices = [];
                state.cameraCanFlip = false;
                updateCameraFlipButton();
                return;
            }

            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                state.cameraDevices = videoInputs;
                state.cameraCanFlip = videoInputs.length > 1;
            } catch (error) {
                console.error('Camera device detection failed:', error);
                state.cameraDevices = [];
                state.cameraCanFlip = false;
            } finally {
                updateCameraFlipButton();
            }
        }

        async function flipCamera() {
            if (!state.cameraCanFlip) {
                alert(
                    translations[state.lang]?.cameraSwitchUnavailable ||
                    translations.en.cameraSwitchUnavailable ||
                    'Camera switch is unavailable on this device.'
                );
                return;
            }

            state.cameraFacingMode = state.cameraFacingMode === 'environment' ? 'user' : 'environment';
            await startCamera(true);
        }

        async function startCamera(forceRetry = false) {
            const video = document.getElementById('camera-video');
            const placeholder = document.getElementById('camera-placeholder');

            if (!video || !placeholder) return;

            if (state.cameraStream && !forceRetry) {
                video.srcObject = state.cameraStream;
                video.classList.remove('hidden');
                placeholder.classList.add('hidden');
                updateCameraFlipButton();
                return;
            }

            stopCamera();

            const supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() || {};
            const supportsFacingMode = Boolean(supportedConstraints.facingMode);
            const desiredFacingMode = state.cameraFacingMode || 'environment';
            const constraintsList = [];
            const preferredDevice = getPreferredCameraDevice(desiredFacingMode);

            if (supportsFacingMode) {
                constraintsList.push({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: { exact: desiredFacingMode }
                    },
                    audio: false
                });
                constraintsList.push({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: { ideal: desiredFacingMode }
                    },
                    audio: false
                });
            }

            if (preferredDevice?.deviceId) {
                constraintsList.push({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        deviceId: { exact: preferredDevice.deviceId }
                    },
                    audio: false
                });
            }

            constraintsList.push({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('getUserMedia is not supported in this browser.');
                }

                let stream = null;
                let lastError = null;

                for (const constraints of constraintsList) {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia(constraints);
                        break;
                    } catch (error) {
                        lastError = error;
                    }
                }

                if (!stream) {
                    throw lastError || new Error('Unable to acquire camera stream.');
                }

                await detectCameraDevices();

                const preferredDeviceAfterPermission = getPreferredCameraDevice(desiredFacingMode);
                const activeDeviceId = getCameraStreamDeviceId(stream);
                const shouldRetryWithPreferredDevice =
                    state.cameraDevices.length > 1 &&
                    preferredDeviceAfterPermission?.deviceId &&
                    preferredDeviceAfterPermission.deviceId !== activeDeviceId &&
                    !streamMatchesFacingMode(stream, desiredFacingMode);

                if (shouldRetryWithPreferredDevice) {
                    stream.getTracks().forEach(track => track.stop());
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            deviceId: { exact: preferredDeviceAfterPermission.deviceId }
                        },
                        audio: false
                    });
                }

                state.cameraStream = stream;
                video.srcObject = stream;
                await video.play();

                video.classList.remove('hidden');
                placeholder.classList.add('hidden');
                await detectCameraDevices();
            } catch (error) {
                console.error('Camera access failed:', error);
                video.classList.add('hidden');
                placeholder.classList.remove('hidden');
                const hint = placeholder.querySelector('[data-i18n="cameraPermissionHint"]');
                const permissionErrorText =
                    translations[state.lang]?.cameraPermissionError ||
                    translations.en.cameraPermissionError;
                if (hint && permissionErrorText) {
                    hint.innerText = permissionErrorText;
                }
                state.cameraDevices = [];
                state.cameraCanFlip = false;
                updateCameraFlipButton();
            }
        }

        function stopCamera() {
            if (state.cameraStream) {
                state.cameraStream.getTracks().forEach(track => track.stop());
                state.cameraStream = null;
            }
            const video = document.getElementById('camera-video');
            if (video) {
                video.pause();
                video.srcObject = null;
                video.classList.add('hidden');
            }
            const placeholder = document.getElementById('camera-placeholder');
            if (placeholder) {
                placeholder.classList.remove('hidden');
                const hint = placeholder.querySelector('[data-i18n="cameraPermissionHint"]');
                if (hint) applyLanguage();
            }
            state.cameraDevices = [];
            state.cameraCanFlip = false;
            updateCameraFlipButton();
        }

        function capturePhoto() {
            const video = document.getElementById('camera-video');
            const canvas = document.getElementById('camera-canvas');

            if (!state.cameraStream || video.readyState < 2) {
                alert(translations[state.lang].cameraNotReady);
                return;
            }

            const flash = document.getElementById('camera-flash');
            flash.classList.remove('animate-flash');
            void flash.offsetWidth;
            flash.classList.add('animate-flash');

            const width = video.videoWidth || 720;
            const height = video.videoHeight || 960;
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, width, height);

            setSelectedPhoto(canvas.toDataURL('image/jpeg', 0.92));
            state.userPhotos.unshift({
                id: `camera-${Date.now()}`,
                name: 'camera-capture.jpg',
                url: state.selectedPhoto,
                source: 'camera'
            });

            if (state.cameraMode === 'collage' && state.collageActiveSlot !== null) {
                state.pendingCapturedPhoto = {
                    id: `collage-camera-${Date.now()}`,
                    name: 'camera-capture.jpg',
                    url: state.selectedPhoto,
                    source: 'camera'
                };
                state.collageSelectionSource = 'camera';
                stopCamera();
                setTimeout(() => {
                    navigate('collage');
                    showCollageCaptureChoice('camera');
                }, 120);
                return;
            }

            state.cameraMode = null;
            setTimeout(() => navigate('review'), 250);
        }

        // Library
        function openPhotoPicker() {
            document.getElementById('photo-input').click();
        }

        function handlePhotoSelection(event) {
            const files = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/'));
            if (!files.length) {
                renderLibrary();
                return;
            }

            const additions = files.map((file, index) => ({
                id: `local-${Date.now()}-${index}`,
                name: file.name,
                url: URL.createObjectURL(file),
                source: 'library'
            }));
            state.userPhotos = [...additions, ...state.userPhotos];

            renderLibrary();
            event.target.value = '';
        }

        function renderLibrary() {
            const grid = document.getElementById('library-grid');
            const empty = document.getElementById('library-empty-state');
            const photos = state.userPhotos;

            if (!photos.length) {
                grid.innerHTML = '';
                empty.classList.remove('hidden');
                lucide.createIcons();
                return;
            }

            empty.classList.add('hidden');
            grid.innerHTML = photos.map(photo => `
                <div onclick="selectPhoto('${photo.url}')" class="aspect-square bg-gray-200 dark:bg-gray-800 cursor-pointer hover:opacity-80 active:scale-95 transition-all overflow-hidden relative">
                    <img src="${photo.url}" alt="${photo.name || 'photo'}" class="w-full h-full object-cover" loading="lazy" />
                </div>
            `).join('');
        }

        function selectPhoto(url) {
            setSelectedPhoto(url);
            navigate('review');
        }

        // Editor

        function getEditorDock() {
            return document.getElementById('editor-tool-dock');
        }

        function getEditorDockButtons() {
            const dock = getEditorDock();
            return dock ? Array.from(dock.querySelectorAll('.editor-tool-btn')) : [];
        }

        function getEditorDockIndicator() {
            return document.getElementById('editor-tool-indicator');
        }

        function findNearestEditorDockButton(clientX) {
            const buttons = getEditorDockButtons();
            if (!buttons.length) return null;

            let nearest = buttons[0];
            let minDistance = Number.POSITIVE_INFINITY;

            buttons.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const distance = Math.abs(clientX - centerX);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = btn;
                }
            });

            return nearest;
        }

        function updateEditorDockIndicator({ tool = null, button = null, pointerX = null, dragging = false } = {}) {
            const dock = getEditorDock();
            const indicator = getEditorDockIndicator();
            if (!dock || !indicator) return;

            const dockRect = dock.getBoundingClientRect();
            if (dockRect.width === 0 || dockRect.height === 0) return;

            const targetButton =
                button ||
                getEditorDockButtons().find(btn => btn.dataset.tool === tool) ||
                dock.querySelector('.editor-tool-btn.is-active') ||
                dock.querySelector('.editor-tool-btn');

            if (!targetButton) return;

            const btnRect = targetButton.getBoundingClientRect();
            let width = btnRect.width;
            let x = btnRect.left - dockRect.left;

            if (dragging) {
                const expandedWidth = Math.min(dockRect.width - 10, btnRect.width + 18);
                const baseCenter = x + btnRect.width / 2;
                let center = baseCenter;

                if (typeof pointerX === 'number') {
                    const relativeX = pointerX - dockRect.left;
                    const drift = (relativeX - baseCenter) * 0.26;
                    center = Math.max(expandedWidth / 2 + 4, Math.min(dockRect.width - expandedWidth / 2 - 4, baseCenter + drift));
                }

                width = expandedWidth;
                x = center - width / 2;
                dock.classList.add('is-dragging');
                indicator.classList.add('is-dragging');
            } else {
                dock.classList.remove('is-dragging');
                indicator.classList.remove('is-dragging');
            }

            indicator.style.width = `${width}px`;
            indicator.style.transform = `translateX(${x}px) scale(${dragging ? 1.045 : 1})`;
            indicator.style.opacity = '1';
        }

        function previewNearestEditorTool(clientX) {
            const previewBtn = findNearestEditorDockButton(clientX);
            if (!previewBtn) return;

            const previewTool = previewBtn.dataset.tool;
            state.editorDockDrag.previewTool = previewTool;

            getEditorDockButtons().forEach(btn => {
                const isPreviewed = btn === previewBtn && btn.dataset.tool !== state.editorActiveTool;
                btn.classList.toggle('is-previewed', isPreviewed);
            });

            updateEditorDockIndicator({ button: previewBtn, pointerX: clientX, dragging: true });
        }

        function clearEditorDockPreview() {
            state.editorDockDrag.previewTool = null;
            getEditorDockButtons().forEach(btn => btn.classList.remove('is-previewed'));
            updateEditorDockIndicator({ tool: state.editorActiveTool, dragging: false });
        }

        function startEditorDockDrag(event) {
            const dock = getEditorDock();
            if (!dock) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            state.editorDockDrag.active = true;
            state.editorDockDrag.pointerId = event.pointerId;
            dock.setPointerCapture?.(event.pointerId);
            previewNearestEditorTool(event.clientX);
            event.preventDefault();
        }

        function handleEditorDockDragGesture(event) {
            if (!state.editorDockDrag.active || event.pointerId !== state.editorDockDrag.pointerId) return;
            previewNearestEditorTool(event.clientX);
            event.preventDefault();
        }

        function finishEditorDockDrag(pointerId = null, revert = false) {
            const dock = getEditorDock();
            if (!state.editorDockDrag.active) return;
            if (pointerId !== null && pointerId !== state.editorDockDrag.pointerId) return;

            if (dock && state.editorDockDrag.pointerId !== null && dock.hasPointerCapture?.(state.editorDockDrag.pointerId)) {
                try {
                    dock.releasePointerCapture(state.editorDockDrag.pointerId);
                } catch (error) {
                    // ignore pointer capture release errors
                }
            }

            const finalTool = revert ? state.editorActiveTool : (state.editorDockDrag.previewTool || state.editorActiveTool);
            state.editorDockDrag.active = false;
            state.editorDockDrag.pointerId = null;
            state.editorDockDrag.suppressClickUntil = performance.now() + 220;

            clearEditorDockPreview();
            setEditorTool(finalTool);
        }

        function initEditorDock() {
            const dock = getEditorDock();
            if (!dock || dock.dataset.ready === 'true') {
                updateEditorDockIndicator({ tool: state.editorActiveTool, dragging: false });
                return;
            }

            dock.dataset.ready = 'true';
            dock.addEventListener('pointerdown', startEditorDockDrag);
            dock.addEventListener('pointermove', handleEditorDockDragGesture);
            dock.addEventListener('pointerup', event => finishEditorDockDrag(event.pointerId, false));
            dock.addEventListener('pointercancel', event => finishEditorDockDrag(event.pointerId, true));
            dock.addEventListener('lostpointercapture', () => {
                if (state.editorDockDrag.active) finishEditorDockDrag(null, false);
            });

            getEditorDockButtons().forEach(btn => {
                btn.addEventListener('click', event => {
                    if (performance.now() < state.editorDockDrag.suppressClickUntil) {
                        event.preventDefault();
                        return;
                    }
                    setEditorTool(btn.dataset.tool);
                });
            });

            window.addEventListener('resize', () => {
                updateEditorDockIndicator({ tool: state.editorActiveTool, dragging: false });
            });

            updateEditorDockIndicator({ tool: state.editorActiveTool, dragging: false });
        }

        function initEditor() {
            state.editSourcePhoto = getSelectedEditableSource();
            state.editSettings = { brightness: 100, contrast: 100, frame: 'classic', zoom: 1, offsetX: 0, offsetY: 0 };
            state.editorActiveTool = 'crop';
            state.editorImageMeta = { naturalWidth: 0, naturalHeight: 0 };
            state.editorDrag = { active: false, pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 };
            state.editorDockDrag = { active: false, pointerId: null, previewTool: null, suppressClickUntil: 0 };

            const actionBtn = document.querySelector('#view-editor .editor-primary-action');
            if (actionBtn) actionBtn.setAttribute('data-i18n', state.collageEditSlot !== null ? 'usePhoto' : 'print');
            applyLanguage();
            initEditorDock();

            const img = document.getElementById('editor-img');
            img.onload = () => {
                state.editorImageMeta = {
                    naturalWidth: img.naturalWidth || 0,
                    naturalHeight: img.naturalHeight || 0
                };
                clampEditorOffsets();
                applyEditorFilters();
            };
            img.src = state.editSourcePhoto;
            setEditorTool('crop');

            if (img.complete && img.naturalWidth) {
                img.onload();
            }
        }

        
function setEditorTool(tool) {
            state.editorActiveTool = tool;

            ['crop', 'frame', 'brightness', 'contrast'].forEach(t => {
                const btn = document.getElementById(`editor-tool-btn-${t}`);
                if (!btn) return;
                const active = t === tool;
                btn.classList.toggle('is-active', active);
                btn.classList.remove('is-previewed');
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });

            updateEditorDockIndicator({ tool, dragging: false });

            const controls = document.getElementById('editor-controls');
            if (tool === 'crop') {
                controls.innerHTML = `
                    <div class="editor-control-stack">
                        <div class="editor-control-row">
                            <span class="editor-crop-meta text-[15px] min-w-[40px]">${translations[state.lang].zoom}</span>
                            <input type="range" min="1" max="3" step="0.01" value="${state.editSettings.zoom}" oninput="updateCropZoom(this.value)" class="editor-slider" />
                            <span class="editor-crop-meta text-[15px] min-w-[44px] text-right" id="editor-zoom-value">${Number(state.editSettings.zoom).toFixed(2)}x</span>
                        </div>
                        <div class="flex justify-center">
                            <button onclick="resetCrop()" class="editor-reset-chip px-5 py-2.5 rounded-full text-sm font-semibold" data-i18n="resetCrop"></button>
                        </div>
                    </div>
                `;
                applyLanguage();
            } else if (tool === 'brightness') {
                controls.innerHTML = `
                    <div class="editor-control-stack">
                        <div class="editor-control-row">
                            <span class="editor-crop-meta text-[15px] min-w-[92px]">${translations[state.lang].brightness}</span>
                            <input type="range" min="50" max="150" value="${state.editSettings.brightness}" oninput="updateEditSetting('brightness', this.value)" class="editor-slider" />
                            <span class="editor-crop-meta text-[15px] min-w-[44px] text-right">${Math.round(state.editSettings.brightness)}%</span>
                        </div>
                    </div>
                `;
            } else if (tool === 'contrast') {
                controls.innerHTML = `
                    <div class="editor-control-stack">
                        <div class="editor-control-row">
                            <span class="editor-crop-meta text-[15px] min-w-[92px]">${translations[state.lang].contrast}</span>
                            <input type="range" min="50" max="150" value="${state.editSettings.contrast}" oninput="updateEditSetting('contrast', this.value)" class="editor-slider" />
                            <span class="editor-crop-meta text-[15px] min-w-[44px] text-right">${Math.round(state.editSettings.contrast)}%</span>
                        </div>
                    </div>
                `;
            } else if (tool === 'frame') {
                controls.innerHTML = `
                    <div class="w-full flex justify-center">
                        <div class="editor-segmented lh-reverse">
                            <button onclick="updateEditSetting('frame', 'classic')" class="editor-segmented-btn ${state.editSettings.frame==='classic' ? 'is-active' : ''}" data-i18n="classicFrame"></button>
                            <button onclick="updateEditSetting('frame', 'brand')" class="editor-segmented-btn ${state.editSettings.frame==='brand' ? 'is-active' : ''}" data-i18n="brandFrame"></button>
                            <button onclick="updateEditSetting('frame', 'thin')" class="editor-segmented-btn ${state.editSettings.frame==='thin' ? 'is-active' : ''}" data-i18n="thinFrame"></button>
                        </div>
                    </div>
                `;
                applyLanguage();
            }
        }

        function updateEditSetting(key, value) {
            state.editSettings[key] = key === 'frame' ? value : Number(value);
            applyEditorFilters();
            if (key === 'frame') setEditorTool('frame');
        }

        function updateCropZoom(value) {
            state.editSettings.zoom = Number(value);
            clampEditorOffsets();
            applyEditorFilters();
            const zoomValue = document.getElementById('editor-zoom-value');
            if (zoomValue) zoomValue.innerText = `${state.editSettings.zoom.toFixed(2)}x`;
        }

        function resetCrop() {
            state.editSettings.zoom = 1;
            state.editSettings.offsetX = 0;
            state.editSettings.offsetY = 0;
            applyEditorFilters();
            if (state.editorActiveTool === 'crop') setEditorTool('crop');
        }

        function getEditorSurfaceMetrics() {
            const surface = document.getElementById('editor-crop-surface');
            return {
                width: surface?.clientWidth || 280,
                height: surface?.clientHeight || 374
            };
        }

        function clampEditorOffsets() {
            const { naturalWidth, naturalHeight } = state.editorImageMeta;
            if (!naturalWidth || !naturalHeight) return;

            const { width, height } = getEditorSurfaceMetrics();
            const coverScale = Math.max(width / naturalWidth, height / naturalHeight);
            const drawWidth = naturalWidth * coverScale * state.editSettings.zoom;
            const drawHeight = naturalHeight * coverScale * state.editSettings.zoom;
            const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
            const maxOffsetY = Math.max(0, (drawHeight - height) / 2);

            state.editSettings.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, state.editSettings.offsetX));
            state.editSettings.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, state.editSettings.offsetY));
        }

        function renderEditorImage() {
            const img = document.getElementById('editor-img');
            const { naturalWidth, naturalHeight } = state.editorImageMeta;
            if (!naturalWidth || !naturalHeight) return;

            const { width, height } = getEditorSurfaceMetrics();
            const coverScale = Math.max(width / naturalWidth, height / naturalHeight);
            const drawWidth = naturalWidth * coverScale * state.editSettings.zoom;
            const drawHeight = naturalHeight * coverScale * state.editSettings.zoom;

            img.style.width = `${drawWidth}px`;
            img.style.height = `${drawHeight}px`;
            img.style.left = `calc(50% + ${state.editSettings.offsetX}px)`;
            img.style.top = `calc(50% + ${state.editSettings.offsetY}px)`;
        }

        function getTodayStamp() {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            return `${yyyy}.${mm}.${dd}`;
        }

        function updateEditorFrameMeta() {
            const footer = document.getElementById('editor-frame-footer');
            const dateEl = document.getElementById('editor-frame-date');
            const showBrandFooter = state.editSettings.frame === 'brand';
            if (dateEl) dateEl.innerText = getTodayStamp();
            if (footer) footer.classList.toggle('is-visible', showBrandFooter);
        }

        function applyEditorFilters() {
            clampEditorOffsets();
            renderEditorImage();

            const img = document.getElementById('editor-img');
            const frame = document.getElementById('editor-frame');
            const surface = document.getElementById('editor-crop-surface');

            img.style.filter = `brightness(${state.editSettings.brightness}%) contrast(${state.editSettings.contrast}%)`;

            const classes = {
                classic: 'transition-all duration-300 w-full flex flex-col gap-3 p-4 bg-white shadow-md rounded-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-100',
                brand: 'transition-all duration-300 w-full flex flex-col gap-3 p-4 bg-white shadow-md rounded-sm border border-gray-200 dark:border-gray-700 dark:bg-white',
                thin: 'transition-all duration-300 w-full flex flex-col gap-3 p-4 bg-white shadow-sm rounded-sm border border-gray-300 dark:border-gray-600 dark:bg-white'
            };
            frame.className = classes[state.editSettings.frame] || classes.classic;
            surface.classList.remove('rounded-sm', 'rounded-lg', 'shadow-md', 'shadow-lg', 'border', 'border-gray-200', 'border-gray-300', 'dark:border-gray-600', 'dark:border-gray-700');
            if (state.editSettings.frame === 'thin') {
                surface.classList.add('rounded-sm', 'shadow-md', 'border', 'border-gray-300', 'dark:border-gray-600');
            } else {
                surface.classList.add('rounded-lg', 'shadow-lg', 'border', 'border-gray-200', 'dark:border-gray-700');
            }
            updateEditorFrameMeta();
        }

        function startEditorDrag(event) {
            if (state.currentView !== 'editor' || state.editorActiveTool !== 'crop') return;
            const surface = document.getElementById('editor-crop-surface');
            state.editorDrag = {
                active: true,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: state.editSettings.offsetX,
                originY: state.editSettings.offsetY
            };
            surface.classList.add('is-dragging');
            if (surface.setPointerCapture) {
                surface.setPointerCapture(event.pointerId);
            }
        }

        function handleEditorDrag(event) {
            if (!state.editorDrag.active) return;
            event.preventDefault();
            state.editSettings.offsetX = state.editorDrag.originX + (event.clientX - state.editorDrag.startX);
            state.editSettings.offsetY = state.editorDrag.originY + (event.clientY - state.editorDrag.startY);
            applyEditorFilters();
        }

        function endEditorDrag(event) {
            if (!state.editorDrag.active) return;
            const surface = document.getElementById('editor-crop-surface');
            if (surface.releasePointerCapture && event?.pointerId !== undefined) {
                try { surface.releasePointerCapture(event.pointerId); } catch (e) {}
            }
            surface.classList.remove('is-dragging');
            state.editorDrag.active = false;
        }

        function loadImage(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                if (typeof src === 'string' && !src.startsWith('blob:') && !src.startsWith('data:')) {
                    img.crossOrigin = 'anonymous';
                }
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });
        }

        
        function drawRoundedRectPath(ctx, x, y, w, h, r) {
            const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }

        function parsePixelValue(value) {
            return Number.parseFloat(String(value || '0')) || 0;
        }

        function buildCanvasFont(style, scale = 1) {
            const fontSize = Math.max(1, parsePixelValue(style.fontSize) * scale);
            const fontWeight = style.fontWeight || '400';
            const fontFamily = style.fontFamily || 'sans-serif';
            return `${fontWeight} ${fontSize}px ${fontFamily}`;
        }

        function getEditorExportLayout() {
            const frame = document.getElementById('editor-frame');
            const surface = document.getElementById('editor-crop-surface');
            const footer = document.getElementById('editor-frame-footer');
            const dateEl = document.getElementById('editor-frame-date');
            const chipEl = footer?.querySelector('.editor-brand-chip');
            const brandTextEl = footer?.querySelector('div:last-child span:last-child');

            const frameRect = frame?.getBoundingClientRect() || { left: 0, top: 0, width: 320, height: 426 };
            const surfaceRect = surface?.getBoundingClientRect() || { left: 16, top: 16, width: 288, height: 384 };
            const footerRect = footer?.getBoundingClientRect() || { left: 16, top: 412, width: 288, height: 44 };
            const dateRect = dateEl?.getBoundingClientRect() || { left: footerRect.left, top: footerRect.top, width: 80, height: footerRect.height };
            const chipRect = chipEl?.getBoundingClientRect() || { left: footerRect.left + footerRect.width - 120, top: footerRect.top, width: 32, height: 32 };
            const brandRect = brandTextEl?.getBoundingClientRect() || { left: chipRect.left + chipRect.width + 8, top: footerRect.top, width: 80, height: footerRect.height };

            const frameStyle = window.getComputedStyle(frame);
            const surfaceStyle = window.getComputedStyle(surface);
            const footerDateStyle = dateEl ? window.getComputedStyle(dateEl) : { color: '#6b7280', fontSize: '12px', fontWeight: '500', fontFamily: 'sans-serif' };
            const chipStyle = chipEl ? window.getComputedStyle(chipEl) : { backgroundColor: '#111827', color: '#ffffff', fontSize: '12px', fontWeight: '700', fontFamily: 'sans-serif' };
            const brandTextStyle = brandTextEl ? window.getComputedStyle(brandTextEl) : { color: '#111827', fontSize: '14px', fontWeight: '600', fontFamily: 'sans-serif' };

            const canvasWidth = 900;
            const scale = canvasWidth / Math.max(frameRect.width || 1, 1);
            const canvasHeight = Math.round(Math.max(frameRect.height || 1, 1) * scale);
            const footerVisible = footer?.classList.contains('is-visible') || false;

            return {
                canvasWidth,
                canvasHeight,
                frameBackground: frameStyle.backgroundColor || '#ffffff',
                frameBorderColor: frameStyle.borderTopColor || 'rgba(229,231,235,1)',
                frameBorderWidth: parsePixelValue(frameStyle.borderTopWidth) * scale,
                frameRadius: parsePixelValue(frameStyle.borderTopLeftRadius) * scale,
                frameBorderInset: (parsePixelValue(frameStyle.borderTopWidth) * scale) / 2,
                innerX: (surfaceRect.left - frameRect.left) * scale,
                innerY: (surfaceRect.top - frameRect.top) * scale,
                innerW: surfaceRect.width * scale,
                innerH: surfaceRect.height * scale,
                surfaceRadius: parsePixelValue(surfaceStyle.borderTopLeftRadius) * scale,
                footerVisible,
                footerDateText: dateEl?.innerText || getTodayStamp(),
                footerDateColor: footerDateStyle.color || '#6b7280',
                footerDateFont: buildCanvasFont(footerDateStyle, scale),
                footerDateX: (dateRect.left - frameRect.left) * scale,
                footerDateBaselineY: (dateRect.bottom - frameRect.top) * scale,
                footerChipBackground: chipStyle.backgroundColor || '#111827',
                footerChipColor: chipStyle.color || '#ffffff',
                footerChipFont: buildCanvasFont(chipStyle, scale),
                footerChipText: chipEl?.innerText || 'dn',
                footerChipX: (chipRect.left - frameRect.left) * scale,
                footerChipY: (chipRect.top - frameRect.top) * scale,
                footerChipW: chipRect.width * scale,
                footerChipH: chipRect.height * scale,
                footerChipRadius: parsePixelValue(chipStyle.borderTopLeftRadius) * scale,
                footerChipCenterX: (chipRect.left - frameRect.left + chipRect.width / 2) * scale,
                footerChipCenterY: (chipRect.top - frameRect.top + chipRect.height / 2) * scale,
                footerBrandColor: brandTextStyle.color || '#111827',
                footerBrandFont: buildCanvasFont(brandTextStyle, scale),
                footerBrandText: brandTextEl?.innerText || 'DropNow',
                footerBrandX: (brandRect.left - frameRect.left) * scale,
                footerBrandBaselineY: (brandRect.bottom - frameRect.top) * scale
            };
        }

        function createDownloadFilename(prefix = 'dropnow-polaroid', ext = 'jpg') {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const mi = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            return `${prefix}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.${ext}`;
        }

        function dataURLToBlob(dataUrl) {
            const parts = dataUrl.split(',');
            const header = parts[0] || '';
            const data = parts[1] || '';
            const mimeMatch = header.match(/data:(.*?);base64/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const binary = atob(data);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: mime });
        }

        function triggerDownloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        }

        function downloadPrintableDataUrl(dataUrl, filename) {
            const blob = dataURLToBlob(dataUrl);
            triggerDownloadBlob(blob, filename);
            return filename;
        }

        async function exportClassicPolaroidPhoto(source) {
            const img = await loadImage(source);
            const canvas = document.createElement('canvas');
            canvas.width = 900;
            canvas.height = 1200;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#fdfcf8';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#e7e5df';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

            const photoX = 92;
            const photoY = 92;
            const photoW = canvas.width - 184;
            const photoH = 874;
            const radius = 28;

            ctx.save();
            drawRoundedRectPath(ctx, photoX, photoY, photoW, photoH, radius);
            ctx.clip();

            const coverScale = Math.max(photoW / img.width, photoH / img.height);
            const drawW = img.width * coverScale;
            const drawH = img.height * coverScale;
            const drawX = photoX + (photoW - drawW) / 2;
            const drawY = photoY + (photoH - drawH) / 2;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            ctx.restore();

            ctx.strokeStyle = 'rgba(17,24,39,0.06)';
            ctx.lineWidth = 2;
            drawRoundedRectPath(ctx, photoX, photoY, photoW, photoH, radius);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, 26);
            ctx.fillRect(0, canvas.height - 26, canvas.width, 26);

            return canvas.toDataURL('image/jpeg', 0.94);
        }

        async function preparePrintableAsset(kind = 'direct', source = getSelectedEditableSource()) {
            if (kind === 'editor') {
                return exportEditedPhoto();
            }
            if (kind === 'collage') {
                return exportClassicPolaroidPhoto(source);
            }
            return exportClassicPolaroidPhoto(source);
        }

        async function handleDirectPrint() {
            const button = document.querySelector('#view-review [data-i18n="directPrint"]');
            if (button) button.disabled = true;
            try {
                const sourcePhoto = getSelectedEditableSource();
                state.lastPrintedSourcePhoto = sourcePhoto;
                state.selectedPhoto = await preparePrintableAsset('direct', sourcePhoto);
                state.selectedPhotoSource = sourcePhoto;
                const filename = createDownloadFilename();
                state.lastPrintedFilename = downloadPrintableDataUrl(state.selectedPhoto, filename);
                navigate('printing');
            } finally {
                if (button) button.disabled = false;
            }
        }

async function exportEditedPhoto() {
            const source = getSelectedEditableSource();
            const img = await loadImage(source);
            const layout = getEditorExportLayout();
            const canvas = document.createElement('canvas');
            canvas.width = layout.canvasWidth;
            canvas.height = layout.canvasHeight;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = layout.frameBackground;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (layout.frameBorderWidth > 0) {
                ctx.strokeStyle = layout.frameBorderColor;
                ctx.lineWidth = layout.frameBorderWidth;
                drawRoundedRectPath(
                    ctx,
                    layout.frameBorderInset,
                    layout.frameBorderInset,
                    canvas.width - layout.frameBorderInset * 2,
                    canvas.height - layout.frameBorderInset * 2,
                    Math.max(0, layout.frameRadius - layout.frameBorderInset)
                );
                ctx.stroke();
            }

            const { innerX, innerY, innerW, innerH } = layout;
            const metrics = getEditorSurfaceMetrics();
            const coverScale = Math.max(innerW / img.width, innerH / img.height);
            const drawWidth = img.width * coverScale * state.editSettings.zoom;
            const drawHeight = img.height * coverScale * state.editSettings.zoom;
            const offsetScaleX = innerW / metrics.width;
            const offsetScaleY = innerH / metrics.height;
            const drawX = innerX + (innerW - drawWidth) / 2 + state.editSettings.offsetX * offsetScaleX;
            const drawY = innerY + (innerH - drawHeight) / 2 + state.editSettings.offsetY * offsetScaleY;

            ctx.save();
            drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, layout.surfaceRadius);
            ctx.clip();
            ctx.filter = `brightness(${state.editSettings.brightness}%) contrast(${state.editSettings.contrast}%)`;
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
            ctx.filter = 'none';

            if (layout.footerVisible) {
                ctx.fillStyle = layout.footerDateColor;
                ctx.font = layout.footerDateFont;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(layout.footerDateText, layout.footerDateX, layout.footerDateBaselineY);

                ctx.fillStyle = layout.footerChipBackground;
                drawRoundedRectPath(
                    ctx,
                    layout.footerChipX,
                    layout.footerChipY,
                    layout.footerChipW,
                    layout.footerChipH,
                    layout.footerChipRadius
                );
                ctx.fill();

                ctx.fillStyle = layout.footerChipColor;
                ctx.font = layout.footerChipFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(layout.footerChipText, layout.footerChipCenterX, layout.footerChipCenterY);

                ctx.fillStyle = layout.footerBrandColor;
                ctx.font = layout.footerBrandFont;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(layout.footerBrandText, layout.footerBrandX, layout.footerBrandBaselineY);
            }

            return canvas.toDataURL('image/jpeg', 0.92);
        }

        async function handleEditorPrint() {
            const printBtn = document.querySelector('#view-editor .editor-primary-action');
            if (printBtn) printBtn.disabled = true;
            try {
                if (state.collageEditSlot !== null) {
                    const editedPhoto = await exportEditorSurfaceImage();
                    state.collagePhotos[state.collageEditSlot] = {
                        id: `collage-edited-${Date.now()}`,
                        name: 'collage-edited.jpg',
                        url: editedPhoto,
                        source: 'edited'
                    };
                    setSelectedPhoto(editedPhoto);
                    state.collageEditSlot = null;
                    state.collageActiveSlot = null;
                    navigate('collage');
                    return;
                }
                const sourcePhoto = getSelectedEditableSource();
                state.lastPrintedSourcePhoto = sourcePhoto;
                state.selectedPhoto = await preparePrintableAsset('editor', sourcePhoto);
                state.selectedPhotoSource = sourcePhoto;
                const filename = createDownloadFilename();
                state.lastPrintedFilename = downloadPrintableDataUrl(state.selectedPhoto, filename);
                navigate('printing');
            } finally {
                if (printBtn) printBtn.disabled = false;
            }
        }

        function getVisibleCollageSlotCount(layout = state.collageLayout) {
            if (layout === 'rows-2' || layout === 'cols-2') return 2;
            return 4;
        }

        function getCameraOnlyPhotos() {
            return state.userPhotos.filter(photo => photo && photo.source === 'camera');
        }

        
        function ensureCollageSlots() {
            if (!Array.isArray(state.collagePhotos) || state.collagePhotos.length < 4) {
                state.collagePhotos = [null, null, null, null];
            }
        }

        function clearCollagePressTimer() {
            if (state.collagePressTimer) {
                clearTimeout(state.collagePressTimer);
                state.collagePressTimer = null;
            }
        }

        function getCollageSlotElement(index) {
            return document.querySelector(`#collage-grid .collage-slot[data-slot-index="${index}"]`);
        }

        function getCollageSlotButton(index) {
            const slot = getCollageSlotElement(index);
            return slot ? slot.querySelector('.collage-slot-btn') : null;
        }

        function resetCollageDropTargets() {
            document.querySelectorAll('#collage-grid .collage-slot').forEach(slot => {
                slot.classList.remove('is-drop-target', 'is-source-slot');
            });
        }

        function resetCollageDragState() {
            const drag = state.collageDrag;
            if (drag && drag.sourceIndex !== null) {
                const sourceBtn = getCollageSlotButton(drag.sourceIndex);
                if (sourceBtn) {
                    sourceBtn.classList.remove('is-dragging', 'is-returning');
                    sourceBtn.style.removeProperty('--drag-x');
                    sourceBtn.style.removeProperty('--drag-y');
                }
            }
            const grid = document.getElementById('collage-grid');
            if (grid) grid.classList.remove('is-dragging');
            resetCollageDropTargets();
            state.collageDrag = {
                active: false,
                pointerId: null,
                sourceIndex: null,
                targetIndex: null,
                phase: 'idle',
                startX: 0,
                startY: 0,
                lastX: 0,
                lastY: 0
            };
        }

        function getCollageDropTargetIndex(clientX, clientY, sourceIndex) {
            const elements = document.elementsFromPoint(clientX, clientY);
            for (const element of elements) {
                const slot = element.closest?.('.collage-slot');
                if (!slot) continue;
                const index = Number(slot.dataset.slotIndex);
                if (Number.isFinite(index) && index !== sourceIndex) return index;
            }
            return null;
        }

        function setCollageDropTarget(index) {
            document.querySelectorAll('#collage-grid .collage-slot').forEach(slot => {
                const slotIndex = Number(slot.dataset.slotIndex);
                slot.classList.toggle('is-drop-target', index !== null && slotIndex === index);
            });
        }

        function beginCollageSlotDrag(event, index) {
            const drag = state.collageDrag;
            const btn = getCollageSlotButton(index);
            const slot = getCollageSlotElement(index);
            const grid = document.getElementById('collage-grid');
            if (!drag.active || !btn || !slot || !grid) return;

            clearCollagePressTimer();
            drag.phase = 'dragging';
            state.collagePressHandled = true;
            state.collagePressSlot = index;

            grid.classList.add('is-dragging');
            slot.classList.add('is-source-slot');
            btn.classList.add('is-dragging');
            updateCollageDragVisual(event);
        }

        function updateCollageDragVisual(event) {
            const drag = state.collageDrag;
            if (!drag.active || drag.phase !== 'dragging') return;

            const btn = getCollageSlotButton(drag.sourceIndex);
            if (!btn) return;

            drag.lastX = event.clientX;
            drag.lastY = event.clientY;

            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;

            btn.style.setProperty('--drag-x', `${dx}px`);
            btn.style.setProperty('--drag-y', `${dy}px`);

            const targetIndex = getCollageDropTargetIndex(event.clientX, event.clientY, drag.sourceIndex);
            drag.targetIndex = targetIndex;
            setCollageDropTarget(targetIndex);
        }

        function animateCollageSlotSettle(indices = []) {
            const unique = [...new Set(indices.filter(index => Number.isInteger(index) && index >= 0))];
            unique.forEach(index => {
                const btn = getCollageSlotButton(index);
                if (!btn) return;
                btn.classList.remove('is-settling');
                void btn.offsetWidth;
                btn.classList.add('is-settling');
                setTimeout(() => btn.classList.remove('is-settling'), 430);
            });
        }

        function commitCollageSlotSwap(sourceIndex, targetIndex) {
            if (sourceIndex === null || targetIndex === null || sourceIndex === targetIndex) return;
            const sourcePhoto = state.collagePhotos[sourceIndex];
            state.collagePhotos[sourceIndex] = state.collagePhotos[targetIndex];
            state.collagePhotos[targetIndex] = sourcePhoto;
            setCollageLayout(state.collageLayout);
            animateCollageSlotSettle([sourceIndex, targetIndex]);
        }

        function releaseCollagePointerCapture(event, index) {
            const btn = typeof index === 'number' ? getCollageSlotButton(index) : null;
            if (!btn || !event || event.pointerId == null) return;
            try {
                if (btn.hasPointerCapture?.(event.pointerId)) btn.releasePointerCapture(event.pointerId);
            } catch (error) {
                // ignore pointer capture release errors
            }
        }

        function startCollageSlotPress(event, index) {
            const photo = state.collagePhotos[index];
            state.collagePressHandled = false;
            state.collagePressSlot = index;
            clearCollagePressTimer();

            if (!photo) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            const btn = event.currentTarget;
            btn?.setPointerCapture?.(event.pointerId);

            state.collageDrag = {
                active: true,
                pointerId: event.pointerId,
                sourceIndex: index,
                targetIndex: null,
                phase: 'pending',
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY
            };

            if (event.pointerType !== 'mouse') {
                state.collagePressTimer = setTimeout(() => {
                    if (state.collageDrag.active && state.collageDrag.phase === 'pending' && state.collageDrag.sourceIndex === index) {
                        state.collagePressHandled = true;
                        releaseCollagePointerCapture(event, index);
                        resetCollageDragState();
                        openCollageSlotPicker(index);
                    }
                }, 420);
            }
        }

        function handleCollageSlotMove(event, index) {
            const drag = state.collageDrag;
            if (!drag.active || drag.pointerId !== event.pointerId || drag.sourceIndex !== index) return;

            if (drag.phase === 'pending') {
                const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                const threshold = event.pointerType === 'mouse' ? 5 : 8;
                if (distance >= threshold) {
                    beginCollageSlotDrag(event, index);
                }
                return;
            }

            updateCollageDragVisual(event);
            event.preventDefault();
        }

        function endCollageSlotPress(event, index) {
            const drag = state.collageDrag;
            clearCollagePressTimer();

            if (!drag.active || drag.pointerId !== event.pointerId || drag.sourceIndex !== index) {
                return;
            }

            releaseCollagePointerCapture(event, index);

            if (drag.phase === 'dragging') {
                const sourceIndex = drag.sourceIndex;
                const targetIndex = drag.targetIndex;
                resetCollageDragState();
                if (targetIndex !== null && targetIndex !== sourceIndex) {
                    commitCollageSlotSwap(sourceIndex, targetIndex);
                } else {
                    const btn = getCollageSlotButton(sourceIndex);
                    if (btn) {
                        btn.classList.add('is-returning');
                        setTimeout(() => btn.classList.remove('is-returning'), 430);
                    }
                }
                return;
            }

            resetCollageDragState();
        }

        function cancelCollageSlotPress(event, index) {
            clearCollagePressTimer();
            if (!state.collageDrag.active) return;
            if (event && state.collageDrag.pointerId !== null && event.pointerId !== state.collageDrag.pointerId) return;
            if (typeof index === 'number' && state.collageDrag.sourceIndex !== null && index !== state.collageDrag.sourceIndex) return;

            releaseCollagePointerCapture(event, state.collageDrag.sourceIndex);
            resetCollageDragState();
        }

function handleEditorBack() {
            if (state.collageEditSlot !== null) {
                state.collageEditSlot = null;
                state.collageActiveSlot = null;
                state.pendingCapturedPhoto = null;
                state.collageSelectionSource = null;
                navigate('collage');
                return;
            }
            navigate('review');
        }

        function getCollageSlotPhoto(index) {
            ensureCollageSlots();
            return state.collagePhotos[index] || null;
        }

        function handleCollageSlotTap(index) {
            if (state.collagePressHandled && state.collagePressSlot === index) {
                state.collagePressHandled = false;
                state.collagePressSlot = null;
                return;
            }
            const photo = getCollageSlotPhoto(index);
            if (photo) {
                openCollageSlotManageSheet(index);
                return;
            }
            openCollageSlotPicker(index);
        }

        function openCollageSlotManageFromButton(event, index) {
            event.preventDefault();
            event.stopPropagation();
            cancelCollageSlotPress(event, index);
            state.collagePressHandled = false;
            state.collagePressSlot = null;
            openCollageSlotManageSheet(index);
        }

        function openCollageSlotPicker(index) {
            ensureCollageSlots();
            state.collageActiveSlot = index;
            const existingBtn = document.getElementById('collage-existing-btn');
            if (existingBtn) existingBtn.classList.toggle('hidden', getCameraOnlyPhotos().length === 0);
            toggleCollageSlotManageSheet(false);
            toggleCollageTakenSheet(false);
            toggleCollageCaptureSheet(false);
            toggleCollageSlotSheet(true);
        }

        function openCollageSlotManageSheet(index) {
            ensureCollageSlots();
            state.collageActiveSlot = index;
            toggleCollageSlotSheet(false);
            toggleCollageTakenSheet(false);
            toggleCollageCaptureSheet(false);
            toggleCollageSlotManageSheet(true);
        }

        function toggleCollageSlotManageSheet(show) {
            const sheet = document.getElementById('collage-slot-manage-sheet');
            if (!sheet) return;
            sheet.classList.toggle('hidden', !show);
            sheet.classList.toggle('flex', show);
            if (show) applyLanguage();
            lucide.createIcons();
        }

        function replaceCollageSlotPhoto() {
            if (state.collageActiveSlot === null) return;
            toggleCollageSlotManageSheet(false);
            openCollageSlotPicker(state.collageActiveSlot);
        }

        function editCurrentCollageSlotPhoto() {
            const photo = getCollageSlotPhoto(state.collageActiveSlot);
            if (!photo || state.collageActiveSlot === null) return;
            setSelectedPhoto(photo.url);
            state.collageEditSlot = state.collageActiveSlot;
            state.pendingCapturedPhoto = null;
            state.collageSelectionSource = null;
            toggleCollageSlotManageSheet(false);
            navigate('editor');
        }

        function removeCurrentCollageSlotPhoto() {
            if (state.collageActiveSlot === null) return;
            state.collagePhotos[state.collageActiveSlot] = null;
            state.collageActiveSlot = null;
            state.pendingCapturedPhoto = null;
            state.collageSelectionSource = null;
            toggleCollageSlotManageSheet(false);
            setCollageLayout(state.collageLayout);
        }

        function toggleCollageSlotSheet(show) {
            const sheet = document.getElementById('collage-slot-sheet');
            if (!sheet) return;
            sheet.classList.toggle('hidden', !show);
            sheet.classList.toggle('flex', show);
            if (show) applyLanguage();
            lucide.createIcons();
        }

        function toggleCollageTakenSheet(show) {
            const sheet = document.getElementById('collage-taken-sheet');
            if (!sheet) return;
            sheet.classList.toggle('hidden', !show);
            sheet.classList.toggle('flex', show);
            if (show) renderCollageTakenPhotoGrid();
            lucide.createIcons();
        }

        function toggleCollageCaptureSheet(show) {
            const sheet = document.getElementById('collage-capture-sheet');
            if (!sheet) return;
            sheet.classList.toggle('hidden', !show);
            sheet.classList.toggle('flex', show);
            if (show) {
                updateCollageCaptureSheet();
                applyLanguage();
            }
            lucide.createIcons();
        }

        function openCollagePhotoPicker() {
            toggleCollageSlotSheet(false);
            const input = document.getElementById('collage-photo-input');
            if (input) {
                input.value = '';
                input.click();
            }
        }

        function handleCollagePhotoSelection(event) {
            const file = Array.from(event.target.files || []).find(file => file.type.startsWith('image/'));
            if (!file || state.collageActiveSlot === null) {
                event.target.value = '';
                return;
            }
            const photo = {
                id: `collage-local-${Date.now()}`,
                name: file.name,
                url: URL.createObjectURL(file),
                source: 'library'
            };
            state.userPhotos.unshift(photo);
            state.pendingCapturedPhoto = photo;
            state.collageSelectionSource = 'library';
            event.target.value = '';
            toggleCollageSlotSheet(false);
            showCollageCaptureChoice('library');
        }

        function startCollageCameraFlow() {
            toggleCollageSlotSheet(false);
            toggleCollageSlotManageSheet(false);
            state.pendingCapturedPhoto = null;
            state.collageSelectionSource = null;
            state.cameraMode = 'collage';
            navigate('camera');
        }

        function showCollageCaptureChoice(source = state.collageSelectionSource || 'camera') {
            state.collageSelectionSource = source;
            toggleCollageSlotSheet(false);
            toggleCollageSlotManageSheet(false);
            toggleCollageTakenSheet(false);
            toggleCollageCaptureSheet(true);
        }

        function updateCollageCaptureSheet() {
            const label = document.getElementById('collage-reselect-label');
            const icon = document.getElementById('collage-reselect-icon');
            if (!label || !icon) return;
            let key = 'retakePhoto';
            let iconName = 'camera';
            if (state.collageSelectionSource === 'library') {
                key = 'chooseAnotherPhoto';
                iconName = 'image';
            } else if (state.collageSelectionSource === 'taken') {
                key = 'chooseAnotherTakenPhoto';
                iconName = 'history';
            }
            label.setAttribute('data-i18n', key);
            icon.setAttribute('data-lucide', iconName);
        }

        function useCapturedPhotoDirectly() {
            if (state.collageActiveSlot === null || !state.pendingCapturedPhoto) return;
            state.collagePhotos[state.collageActiveSlot] = { ...state.pendingCapturedPhoto };
            state.pendingCapturedPhoto = null;
            state.collageSelectionSource = null;
            state.collageActiveSlot = null;
            toggleCollageCaptureSheet(false);
            setCollageLayout(state.collageLayout);
        }

        function editCapturedPhotoForCollage() {
            if (state.collageActiveSlot === null || !state.pendingCapturedPhoto) return;
            setSelectedPhoto(state.pendingCapturedPhoto.url);
            state.collageEditSlot = state.collageActiveSlot;
            state.pendingCapturedPhoto = null;
            state.collageSelectionSource = null;
            toggleCollageCaptureSheet(false);
            navigate('editor');
        }

        function reselectPendingCollagePhoto() {
            const source = state.collageSelectionSource;
            toggleCollageCaptureSheet(false);
            if (source === 'library') {
                openCollagePhotoPicker();
                return;
            }
            if (source === 'taken') {
                openCollageTakenPhotoSheet();
                return;
            }
            state.pendingCapturedPhoto = null;
            state.cameraMode = 'collage';
            navigate('camera');
        }

        function retakeCollagePhoto() {
            reselectPendingCollagePhoto();
        }

        function openCollageTakenPhotoSheet() {
            toggleCollageSlotSheet(false);
            toggleCollageSlotManageSheet(false);
            state.collageSelectionSource = 'taken';
            toggleCollageTakenSheet(true);
        }

        function renderCollageTakenPhotoGrid() {
            const photos = getCameraOnlyPhotos();
            const grid = document.getElementById('collage-taken-grid');
            const empty = document.getElementById('collage-taken-empty');
            if (!grid || !empty) return;
            if (!photos.length) {
                grid.innerHTML = '';
                empty.classList.remove('hidden');
                applyLanguage();
                return;
            }
            empty.classList.add('hidden');
            grid.innerHTML = photos.map(photo => `
                <button type="button" onclick="selectCapturedPhotoForCollage('${photo.id}')" class="collage-shot-thumb active:scale-95 transition-transform">
                    <img src="${photo.url}" alt="captured photo" />
                </button>
            `).join('');
        }

        function selectCapturedPhotoForCollage(photoId) {
            const photo = getCameraOnlyPhotos().find(item => item.id === photoId);
            if (!photo || state.collageActiveSlot === null) return;
            state.pendingCapturedPhoto = { ...photo };
            toggleCollageTakenSheet(false);
            showCollageCaptureChoice('taken');
        }

        async function exportEditorSurfaceImage() {
            const source = getSelectedEditableSource();
            const img = await loadImage(source);
            const canvas = document.createElement('canvas');
            canvas.width = 900;
            canvas.height = 1200;
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const coverScale = Math.max(width / img.width, height / img.height);
            const drawWidth = img.width * coverScale * state.editSettings.zoom;
            const drawHeight = img.height * coverScale * state.editSettings.zoom;
            const metrics = getEditorSurfaceMetrics();
            const offsetScaleX = width / metrics.width;
            const offsetScaleY = height / metrics.height;
            const drawX = (width - drawWidth) / 2 + state.editSettings.offsetX * offsetScaleX;
            const drawY = (height - drawHeight) / 2 + state.editSettings.offsetY * offsetScaleY;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.filter = `brightness(${state.editSettings.brightness}%) contrast(${state.editSettings.contrast}%)`;
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            ctx.filter = 'none';
            return canvas.toDataURL('image/jpeg', 0.92);
        }

        // ====== Collage Setup & Generation (FIXED) ======
        function initCollage() {
            ensureCollageSlots();
            setCollageLayout(state.collageLayout || '2x2');
        }

        function setCollageLayout(layout) {
            ensureCollageSlots();
            state.collageLayout = layout;

            document.querySelectorAll('.layout-btn').forEach(btn => {
                btn.classList.remove('border-gray-900', 'dark:border-white');
                btn.classList.add('border-transparent');
            });
            const activeBtn = document.getElementById(`btn-layout-${layout}`);
            if(activeBtn) {
                activeBtn.classList.remove('border-transparent');
                activeBtn.classList.add('border-gray-900', 'dark:border-white');
            }

            const grid = document.getElementById('collage-grid');
            grid.className = "w-full max-w-[280px] aspect-[3/4] bg-white dark:bg-gray-800 p-2 shadow-xl rounded-lg grid gap-2 transition-all duration-300";
            const displayCount = getVisibleCollageSlotCount(layout);
            if (layout === '2x2') {
                grid.classList.add('grid-cols-2', 'grid-rows-2');
            } else if (layout === 'rows-2') {
                grid.classList.add('grid-cols-1', 'grid-rows-2');
            } else if (layout === 'cols-2') {
                grid.classList.add('grid-cols-2', 'grid-rows-1');
            }

            grid.innerHTML = Array.from({ length: displayCount }).map((_, index) => {
                const photo = state.collagePhotos[index];
                return `
                    <div class="collage-slot" data-slot-index="${index}">
                        <button
                            type="button"
                            onclick="handleCollageSlotTap(${index})"
                            onpointerdown="startCollageSlotPress(event, ${index})"
                            onpointermove="handleCollageSlotMove(event, ${index})"
                            onpointerup="endCollageSlotPress(event, ${index})"
                            onpointercancel="cancelCollageSlotPress(event, ${index})"
                            class="collage-slot-btn ${photo ? 'has-photo' : ''} active:scale-[0.985] transition-transform">
                            ${photo ? `<img src="${photo.url}" alt="collage item" crossorigin="anonymous" draggable="false" />` : `<div class="collage-slot-empty"><span class="collage-slot-plus">+</span></div>`}
                        </button>
                        ${photo ? `<button type="button" class="collage-slot-manage-btn" onclick="openCollageSlotManageFromButton(event, ${index})" aria-label="Manage photo"><i data-lucide="ellipsis"></i></button>` : ``}
                    </div>
                `;
            }).join('');
            lucide.createIcons();
        }

        // Draw image mimicking CSS object-fit: cover
        function drawImageCover(ctx, img, x, y, w, h) {
            const imgAspect = img.width / img.height;
            const targetAspect = w / h;
            let drawW, drawH, drawX, drawY;

            if (imgAspect > targetAspect) {
                drawH = img.height;
                drawW = img.height * targetAspect;
                drawX = (img.width - drawW) / 2;
                drawY = 0;
            } else {
                drawW = img.width;
                drawH = img.width / targetAspect;
                drawX = 0;
                drawY = (img.height - drawH) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawW, drawH, x, y, w, h);
        }

        // Generate the collage payload
        async function printCollage() {
            const printBtn = document.getElementById('btn-collage-print');
            const originalText = printBtn.innerText;
            printBtn.setAttribute('data-i18n', 'generating');
            applyLanguage();

            const canvas = document.createElement('canvas');
            canvas.width = 600;
            canvas.height = 800;
            const ctx = canvas.getContext('2d');

            // White Background Base
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const padding = 20;
            const gap = 15;
            const layout = state.collageLayout;
            
            const photoCount = getVisibleCollageSlotCount(layout);
            const visiblePhotos = state.collagePhotos.slice(0, photoCount);
            if (visiblePhotos.some(photo => !photo || !photo.url)) {
                alert(translations[state.lang].fillCollageSlots);
                printBtn.setAttribute('data-i18n', 'print');
                applyLanguage();
                return;
            }
            const photosToLoad = visiblePhotos;

            // Image Loader with fallback
            const loadImg = (src) => new Promise(res => {
                const img = new Image();
                if (!src.startsWith('blob:') && !src.startsWith('data:')) {
                    img.crossOrigin = 'Anonymous';
                }
                img.onload = () => res(img);
                img.onerror = () => {
                    // Fallback block if network fails
                    const errCanvas = document.createElement('canvas');
                    errCanvas.width = 400; errCanvas.height = 400;
                    const errCtx = errCanvas.getContext('2d');
                    errCtx.fillStyle = '#cccccc';
                    errCtx.fillRect(0,0,400,400);
                    const fbImg = new Image();
                    fbImg.onload = () => res(fbImg);
                    fbImg.src = errCanvas.toDataURL();
                };
                img.src = src;
            });

            // Wait for images
            const loadedImages = await Promise.all(photosToLoad.map(p => loadImg(p.url)));

            // Draw based on selected grid layout
            const drawAreaW = canvas.width - padding * 2;
            const drawAreaH = canvas.height - padding * 2;

            if (layout === '2x2') {
                const cellW = (drawAreaW - gap) / 2;
                const cellH = (drawAreaH - gap) / 2;
                const positions = [
                    {x: padding, y: padding},
                    {x: padding + cellW + gap, y: padding},
                    {x: padding, y: padding + cellH + gap},
                    {x: padding + cellW + gap, y: padding + cellH + gap}
                ];
                loadedImages.forEach((img, i) => drawImageCover(ctx, img, positions[i].x, positions[i].y, cellW, cellH));
            } else if (layout === 'rows-2') {
                const cellW = drawAreaW;
                const cellH = (drawAreaH - gap) / 2;
                const positions = [
                    {x: padding, y: padding},
                    {x: padding, y: padding + cellH + gap}
                ];
                loadedImages.forEach((img, i) => drawImageCover(ctx, img, positions[i].x, positions[i].y, cellW, cellH));
            } else if (layout === 'cols-2') {
                const cellW = (drawAreaW - gap) / 2;
                const cellH = drawAreaH;
                const positions = [
                    {x: padding, y: padding},
                    {x: padding + cellW + gap, y: padding}
                ];
                loadedImages.forEach((img, i) => drawImageCover(ctx, img, positions[i].x, positions[i].y, cellW, cellH));
            }

            // Export collage, wrap it in a real instant-photo card, download it, then go to Print screen
            const collageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
            setSelectedPhoto(collageDataUrl);
            state.lastPrintedSourcePhoto = collageDataUrl;
            state.selectedPhoto = await preparePrintableAsset('collage', collageDataUrl);
            state.lastPrintedFilename = downloadPrintableDataUrl(
                state.selectedPhoto,
                createDownloadFilename('dropnow-collage')
            );
            printBtn.setAttribute('data-i18n', 'print');
            applyLanguage();

            navigate('printing');
        }

        // ====== Printing & Works (Remains untouched but now works nicely) ======
        function startPrinting() {
            document.getElementById('print-active').classList.remove('hidden');
            document.getElementById('print-active').classList.add('flex');
            document.getElementById('print-done').classList.add('hidden');
            document.getElementById('print-done').classList.remove('flex');
            
            // This is now properly populated by Editor OR Canvas Collage Generation
            document.getElementById('printing-img').src = state.selectedPhoto;
            
            let progress = 0;
            const bar = document.getElementById('print-progress-bar');
            const text = document.getElementById('print-progress-text');
            bar.style.width = '0%';
            
            if (state.printInterval) clearInterval(state.printInterval);
            
            state.printInterval = setInterval(() => {
                progress += 2;
                bar.style.width = `${progress}%`;
                text.innerText = `${progress}%`;
                
                if (progress >= 100) {
                    clearInterval(state.printInterval);
                    finishPrinting();
                }
            }, 50);
        }

        function finishPrinting() {
            document.getElementById('print-active').classList.add('hidden');
            document.getElementById('print-active').classList.remove('flex');
            document.getElementById('print-done').classList.remove('hidden');
            document.getElementById('print-done').classList.add('flex');

            state.lastPrintedPhoto = state.selectedPhoto;
            state.lastPrintedSourcePhoto = state.lastPrintedSourcePhoto || getSelectedEditableSource();

            // Pushing the final image payload (single photo or generated collage)
            state.works.unshift({
                id: Date.now(),
                photo: state.selectedPhoto,
                date: new Date().toLocaleDateString()
            });
        }

        function handlePrintAgain() {
            if (state.lastPrintedPhoto || state.selectedPhoto) {
                state.selectedPhoto = state.lastPrintedPhoto || state.selectedPhoto;
                state.lastPrintedFilename = downloadPrintableDataUrl(
                    state.selectedPhoto,
                    createDownloadFilename('dropnow-polaroid-reprint')
                );
                navigate('printing');
                return;
            }
            navigate('main');
        }

        function handleCustomizePrint() {
            if (state.lastPrintedPhoto || state.selectedPhoto) {
                const sourcePhoto = state.lastPrintedSourcePhoto || state.selectedPhotoSource || state.selectedPhoto;
                setSelectedPhoto(sourcePhoto);
                state.editSourcePhoto = sourcePhoto;
                navigate('editor');
                return;
            }
            navigate('main');
        }

        function renderWorks() {
            const container = document.getElementById('works-container');
            const empty = document.getElementById('works-empty');
            
            if (state.works.length === 0) {
                container.classList.add('hidden');
                empty.classList.remove('hidden');
            } else {
                empty.classList.add('hidden');
                container.classList.remove('hidden');
                container.innerHTML = state.works.map(w => `
                    <div class="bg-white dark:bg-gray-900 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <div class="aspect-[3/4] bg-gray-100 overflow-hidden rounded relative group">
                            <img src="${w.photo}" class="w-full h-full object-cover" loading="lazy" alt="work" />
                        </div>
                        <p class="text-xs text-center mt-2 text-gray-500 font-medium">${w.date}</p>
                    </div>
                `).join('');
            }
        }

        // --- Initialization ---
        document.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
            applyLanguage();
            applyTheme();
            applyAccessibility();
            initMainDock();
            initEditorDock();
            renderLibrary();
            initCollage();
            
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                if(state.theme === 'system') document.documentElement.classList.add('dark');
            }
        });
