/**
 * Gemini Navigator - Firefox Extension
 * Content script for gemini.google.com
 * 
 * Provides a floating navigation menu to quickly jump to user questions
 * in long Gemini AI conversations.
 */

(function () {
    'use strict';

    // ============================================
    // Configuration
    // ============================================
    const CONFIG = {
        // Minimum messages before showing menu
        minMessages: 1, // Reduced to 1 for debugging

        // Debounce delay for DOM updates (ms)
        debounceDelay: 500,

        // Default menu position
        defaultPosition: { x: 20, y: 100 },

        // Default menu size
        defaultSize: { width: 320, height: 450 },

        // CSS selectors to find user messages in Gemini
        userMessageSelectors: [
            'user-query',
            '[data-test-id="user-query"]',
            '[data-message-author-role="user"]',
            '.user-query',
            '.query-text',
            '.user-message',
            'message-content[data-role="user"]',
            '.conversation-turn.user-turn'
        ],

        // CSS selectors to find AI/model messages in Gemini
        aiMessageSelectors: [
            'model-response',
            '[data-test-id="model-response"]',
            '[data-message-author-role="model"]',
            '[data-message-author-role="assistant"]',
            '.model-response',
            '.assistant-message',
            'message-content[data-role="model"]',
            '.conversation-turn.model-turn'
        ],

        // Container for conversation
        conversationContainerSelectors: [
            'main',
            '[role="main"]',
            '.conversation-container',
            '.chat-container'
        ]
    };

    // ============================================
    // State
    // ============================================
    let menuElement = null;
    let menuListElement = null;
    let isResizing = false;
    let isMenuClosed = false;  // Track if user manually closed the menu
    let isMinimized = true;    // Default to minimized mode
    let currentQuestions = [];
    let observer = null;
    let debounceTimer = null;

    // ============================================
    // Storage Helpers (Promise-based for Firefox)
    // ============================================
    const Storage = {
        async get(keys) {
            try {
                return await browser.storage.local.get(keys);
            } catch (e) {
                console.warn('[Gemini Navigator] Storage get error:', e);
                return {};
            }
        },

        async set(data) {
            try {
                await browser.storage.local.set(data);
            } catch (e) {
                console.warn('[Gemini Navigator] Storage set error:', e);
            }
        }
    };

    // ============================================
    // Message Detection (Both User and AI)
    // ============================================
    function findMessages(selectors, role) {
        const elements = [];

        for (const selector of selectors) {
            try {
                const found = document.querySelectorAll(selector);
                found.forEach(el => {
                    // Check if this element is not already added or is not a child of an already added element
                    const isDuplicate = elements.some(existing =>
                        existing === el || existing.contains(el) || el.contains(existing)
                    );
                    if (!isDuplicate) {
                        elements.push(el);
                    }
                });
            } catch (e) {
                // Invalid selector, skip
            }
        }

        return elements.map(el => ({ element: el, role: role }));
    }

    function findAllMessages() {
        const userMessages = findMessages(CONFIG.userMessageSelectors, 'user');
        const aiMessages = findMessages(CONFIG.aiMessageSelectors, 'ai');

        // Combine all messages
        let allMessages = [...userMessages, ...aiMessages];

        // Remove duplicates by checking if elements are nested or have same text
        const seenTexts = new Set();
        allMessages = allMessages.filter(msg => {
            const text = msg.element.textContent?.trim().substring(0, 100) || '';
            if (text.length < 5 || seenTexts.has(text)) {
                return false;
            }
            seenTexts.add(text);
            return true;
        });

        // Sort by document order
        allMessages.sort((a, b) => {
            const position = a.element.compareDocumentPosition(b.element);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        return allMessages;
    }

    function extractMessageText(element) {
        let text = element.textContent?.trim() || '';

        // Truncate long text
        if (text.length > 60) {
            text = text.substring(0, 57) + '...';
        }

        return text;
    }

    function updateMessages() {
        // console.log('[Gemini Navigator] Scanning for messages...');
        const messageElements = findAllMessages();
        // console.log(`[Gemini Navigator] Found ${messageElements.length} total raw messages`);

        currentQuestions = messageElements.map((msg, index) => ({
            element: msg.element,
            text: extractMessageText(msg.element),
            role: msg.role,
            index: index + 1
        })).filter(q => q.text.length > 0);

        console.log(`[Gemini Navigator] Processed ${currentQuestions.length} valid messages for menu`);

        updateMenuUI();
    }

    // ============================================
    // Menu UI
    // ============================================
    function createMenu() {
        // Remove existing menu if any
        if (menuElement) {
            menuElement.remove();
        }

        // Create menu container
        menuElement = document.createElement('div');
        menuElement.id = 'gemini-navigator-menu';

        // Header
        const header = document.createElement('div');
        header.className = 'gemini-nav-header';

        const title = document.createElement('span');
        title.className = 'gemini-nav-title';
        title.textContent = '📍 Navigator';

        const controls = document.createElement('div');
        controls.className = 'gemini-nav-controls';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'gemini-nav-btn gemini-nav-minimize';
        minimizeBtn.title = 'Minimize';
        minimizeBtn.textContent = '−';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'gemini-nav-btn gemini-nav-close';
        closeBtn.title = 'Close';
        closeBtn.textContent = '×';

        controls.appendChild(minimizeBtn);
        controls.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(controls);

        // Content
        const content = document.createElement('div');
        content.className = 'gemini-nav-content';

        menuListElement = document.createElement('ul');
        menuListElement.className = 'gemini-nav-list';
        content.appendChild(menuListElement);

        // Resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'gemini-nav-resize-handle';

        // Assemble
        menuElement.appendChild(header);
        menuElement.appendChild(content);
        menuElement.appendChild(resizeHandle);

        document.body.appendChild(menuElement);

        // Setup event listeners
        setupMenuEvents();

        return menuElement;
    }

    function setupMenuEvents() {
        const closeBtn = menuElement.querySelector('.gemini-nav-close');
        const minimizeBtn = menuElement.querySelector('.gemini-nav-minimize');
        const resizeHandle = menuElement.querySelector('.gemini-nav-resize-handle');

        // Resize functionality
        resizeHandle.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);

        // Close button
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isMenuClosed = true;
            menuElement.style.display = 'none';
        });

        // Minimize button
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimize();
        });
    }

    function toggleMinimize() {
        const content = menuElement.querySelector('.gemini-nav-content');
        const resizeHandle = menuElement.querySelector('.gemini-nav-resize-handle');
        const minimizeBtn = menuElement.querySelector('.gemini-nav-minimize');
        const closeBtn = menuElement.querySelector('.gemini-nav-close');
        const title = menuElement.querySelector('.gemini-nav-title');

        isMinimized = !isMinimized;

        if (isMinimized) {
            // Save current size before minimizing
            saveMenuState();

            // Transform into floating icon
            menuElement.classList.add('minimized');
            content.style.display = 'none';
            resizeHandle.style.display = 'none';
            closeBtn.style.display = 'none';
            title.style.display = 'none';
            minimizeBtn.textContent = '📍';
            minimizeBtn.title = 'Expand Navigator';

            // Move to right side center
            menuElement.style.width = 'auto';
            menuElement.style.height = 'auto';
            menuElement.style.right = '10px';
            menuElement.style.top = '50%';
            menuElement.style.transform = 'translateY(-50%)';
        } else {
            // Restore full menu
            menuElement.classList.remove('minimized');
            content.style.display = '';
            resizeHandle.style.display = '';
            closeBtn.style.display = '';
            title.style.display = '';
            minimizeBtn.textContent = '−';
            minimizeBtn.title = 'Minimize';

            // Reset to normal position (fixed right side)
            menuElement.style.right = '10px';
            menuElement.style.top = '100px';
            menuElement.style.transform = 'none';

            // Restore saved size
            loadMenuState();
        }
    }

    function updateMenuUI() {
        if (!menuElement) {
            createMenu();
        }

        // Don't reopen if user manually closed it
        if (isMenuClosed) {
            return;
        }

        // Check if we should show the menu
        if (currentQuestions.length < CONFIG.minMessages) {
            menuElement.style.display = 'none';
            return;
        }

        menuElement.style.display = 'flex';

        // Clear existing list
        menuListElement.innerHTML = '';

        // Update list with role indicators
        currentQuestions.forEach(q => {
            const li = document.createElement('li');
            li.className = `gemini-nav-item gemini-nav-${q.role}`;
            li.dataset.index = (q.index - 1).toString();

            const roleSpan = document.createElement('span');
            roleSpan.className = `gemini-nav-role gemini-nav-role-${q.role}`;
            roleSpan.textContent = q.role === 'user' ? 'U' : 'A';

            const textSpan = document.createElement('span');
            textSpan.className = 'gemini-nav-text';
            textSpan.textContent = q.text;

            li.appendChild(roleSpan);
            li.appendChild(textSpan);

            li.addEventListener('click', () => {
                const index = parseInt(li.dataset.index);
                scrollToQuestion(index);
            });

            menuListElement.appendChild(li);
        });
    }

    function scrollToQuestion(index) {
        const question = currentQuestions[index];
        if (!question || !question.element) return;

        // Scroll to element
        question.element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        // Highlight briefly
        question.element.classList.add('gemini-nav-highlight');
        setTimeout(() => {
            question.element.classList.remove('gemini-nav-highlight');
        }, 2000);
    }

    // ============================================
    // Resize
    // ============================================

    function startResize(e) {
        isResizing = true;
        menuElement.classList.add('resizing');
        e.preventDefault();
    }

    function onResize(e) {
        if (!isResizing) return;

        const rect = menuElement.getBoundingClientRect();
        const width = Math.max(200, e.clientX - rect.left);
        const height = Math.max(150, e.clientY - rect.top);

        menuElement.style.width = width + 'px';
        menuElement.style.height = height + 'px';
    }

    function stopResize() {
        if (isResizing) {
            isResizing = false;
            menuElement.classList.remove('resizing');
            saveMenuState();
        }
    }

    // ============================================
    // State Persistence
    // ============================================
    async function saveMenuState() {
        if (!menuElement) return;

        const rect = menuElement.getBoundingClientRect();
        await Storage.set({
            geminiNavSize: { width: rect.width, height: rect.height }
        });
    }

    async function loadMenuState() {
        const data = await Storage.get(['geminiNavSize']);
        const size = data.geminiNavSize || CONFIG.defaultSize;

        menuElement.style.width = size.width + 'px';
        menuElement.style.height = size.height + 'px';
    }

    // ============================================
    // DOM Observation
    // ============================================
    function setupObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver(() => {
            // Debounce updates
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateMessages, CONFIG.debounceDelay);
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function setupURLObserver() {
        let lastUrl = location.href;

        // Check for URL changes periodically (for SPA navigation)
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log('[Gemini Navigator] URL changed, refreshing...');

                // Reset and re-scan
                currentQuestions = [];
                setTimeout(updateMessages, 500);
            }
        }, 1000);
    }

    // ============================================
    // Initialization
    // ============================================
    function init() {
        console.log('[Gemini Navigator] Initializing...');

        // Wait a bit for page to load
        setTimeout(() => {
            createMenu();
            updateMessages();
            setupObserver();
            setupURLObserver();

            // Apply minimized state by default
            applyMinimizedState();

            console.log('[Gemini Navigator] Ready!');
        }, 1000);
    }

    function applyMinimizedState() {
        if (!menuElement) return;

        const content = menuElement.querySelector('.gemini-nav-content');
        const resizeHandle = menuElement.querySelector('.gemini-nav-resize-handle');
        const minimizeBtn = menuElement.querySelector('.gemini-nav-minimize');
        const closeBtn = menuElement.querySelector('.gemini-nav-close');
        const title = menuElement.querySelector('.gemini-nav-title');

        if (isMinimized) {
            menuElement.classList.add('minimized');
            content.style.display = 'none';
            resizeHandle.style.display = 'none';
            closeBtn.style.display = 'none';
            title.style.display = 'none';
            minimizeBtn.textContent = '📍';
            minimizeBtn.title = 'Expand Navigator';

            menuElement.style.width = 'auto';
            menuElement.style.height = 'auto';
            menuElement.style.right = '10px';
            menuElement.style.left = 'auto';
            menuElement.style.top = '50%';
            menuElement.style.transform = 'translateY(-50%)';
        }
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
