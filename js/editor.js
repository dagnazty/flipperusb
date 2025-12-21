/* ============================================
   FlipperUSB Editor - Enhanced Version
   ============================================ */

const DEBUG = true;

// Debug logging with toast integration
const debugLog = {
    log: function (message, type = 'info') {
        if (!DEBUG) return;

        const consoleOutput = document.getElementById('consoleOutput');
        if (consoleOutput) {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.className = type;
            logEntry.textContent = `[${timestamp}] ${message}`;
            consoleOutput.appendChild(logEntry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }

        // Also log to browser console
        console.log(`[${type.toUpperCase()}] ${message}`);
    },
    error: function (message) {
        this.log(message, 'error');
    },
    warning: function (message) {
        this.log(message, 'warning');
    },
    success: function (message) {
        this.log(message, 'success');
    },
    info: function (message) {
        this.log(message, 'info');
    }
};

// State
let flipper = new FlipperSerial();
let currentFile = null;
let currentPath = '/';
let hasUnsavedChanges = false;
let allFiles = []; // Cache for search filtering
let isFileExplorerOpen = true;

// DOM Elements
const elements = {
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    statusIndicator: document.getElementById('statusIndicator'),
    fileList: document.getElementById('fileList'),
    currentPath: document.getElementById('currentPath'),
    parentDir: document.getElementById('parentDir'),
    editor: document.getElementById('editor'),
    currentFile: document.getElementById('currentFile'),
    saveBtn: document.getElementById('saveBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    newFileBtn: document.getElementById('newFileBtn'),
    fileUpload: document.getElementById('fileUpload'),
    fileActions: document.getElementById('fileActions'),
    searchInput: document.getElementById('searchInput'),
    dropZone: document.getElementById('dropZone'),
    fileExplorer: document.getElementById('fileExplorer'),
    mobileMenuToggle: document.getElementById('mobileMenuToggle'),
    consoleOutput: document.getElementById('consoleOutput'),
    toggleConsole: document.getElementById('toggleConsole'),
    clearConsole: document.getElementById('clearConsole')
};

// ============================================
// Connection Status
// ============================================

function updateConnectionStatus(status) {
    elements.statusIndicator.className = 'status-dot ' + status;

    const titles = {
        connected: 'Connected to Flipper Zero',
        disconnected: 'Disconnected',
        connecting: 'Connecting...'
    };
    elements.statusIndicator.title = titles[status] || status;

    // Update page title
    document.title = status === 'connected'
        ? 'FlipperUSB - Connected'
        : 'FlipperUSB - Web File Manager';

    switch (status) {
        case 'connected':
            toast.success('Connected to Flipper Zero');
            debugLog.success('Connected to Flipper Zero');
            break;
        case 'disconnected':
            debugLog.warning('Disconnected from Flipper Zero');
            break;
        case 'connecting':
            debugLog.info('Attempting to connect to Flipper Zero...');
            break;
    }
}

// ============================================
// Console Controls
// ============================================

elements.clearConsole.addEventListener('click', () => {
    elements.consoleOutput.innerHTML = '';
    toast.info('Console cleared');
});

elements.toggleConsole.addEventListener('click', (e) => {
    const isHidden = elements.consoleOutput.style.display === 'none';
    elements.consoleOutput.style.display = isHidden ? 'block' : 'none';
    e.currentTarget.querySelector('span').textContent = isHidden ? 'Hide Console' : 'Console';
});

// ============================================
// Mobile Menu Toggle
// ============================================

elements.mobileMenuToggle.addEventListener('click', () => {
    isFileExplorerOpen = !isFileExplorerOpen;
    elements.fileExplorer.classList.toggle('collapsed', !isFileExplorerOpen);

    // Update icon
    const svg = elements.mobileMenuToggle.querySelector('svg');
    if (isFileExplorerOpen) {
        svg.innerHTML = `
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
        `;
    } else {
        svg.innerHTML = `
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
        `;
    }
});

// ============================================
// Connection Handling
// ============================================

elements.connectBtn.addEventListener('click', async () => {
    updateConnectionStatus('connecting');
    elements.connectBtn.disabled = true;

    try {
        if (await flipper.connect()) {
            elements.connectBtn.style.display = 'none';
            elements.disconnectBtn.style.display = 'inline-flex';
            updateConnectionStatus('connected');
            await loadFileList();
        } else {
            throw new Error('Connection failed');
        }
    } catch (error) {
        toast.error('Connection failed: ' + error.message, {
            title: 'Connection Error'
        });
        debugLog.error('Connection error: ' + error.message);
        updateConnectionStatus('disconnected');
    } finally {
        elements.connectBtn.disabled = false;
    }
});

elements.disconnectBtn.addEventListener('click', async () => {
    try {
        debugLog.info('Starting disconnect process...');
        await new Promise(resolve => setTimeout(resolve, 100));
        await flipper.disconnect();

        elements.connectBtn.style.display = 'inline-flex';
        elements.disconnectBtn.style.display = 'none';
        updateConnectionStatus('disconnected');

        // Clear the file list
        elements.fileList.innerHTML = `
            <div class="empty-dir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Connect your Flipper to get started</p>
                <button class="flipper-button small" onclick="document.getElementById('connectBtn').click()">
                    Connect Now
                </button>
            </div>
        `;
        elements.currentPath.innerHTML = '/';
        currentPath = '/';
        currentFile = null;
        elements.fileActions.style.display = 'none';

        // Reset editor
        elements.editor.value = '';
        elements.editor.disabled = true;
        elements.saveBtn.disabled = true;
        elements.downloadBtn.disabled = true;
        elements.currentFile.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            No file selected
        `;

        toast.info('Disconnected from Flipper');
        debugLog.success('Disconnect completed');
    } catch (error) {
        toast.error('Disconnect error: ' + error.message);
        debugLog.error('Disconnect error: ' + error.message);
    }
});

// ============================================
// File Navigation
// ============================================

elements.parentDir.addEventListener('click', async () => {
    if (currentPath === '/') return;

    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    currentPath = parts.length ? '/' + parts.join('/') : '/';
    await loadFileList();
});

function getPathBreadcrumbs(path) {
    const parts = path.split('/').filter(p => p);
    let breadcrumbs = '';
    let fullPath = '';

    breadcrumbs += `<span class="breadcrumb-item" data-path="/">root</span>`;
    parts.forEach(part => {
        fullPath += '/' + part;
        breadcrumbs += ` / <span class="breadcrumb-item" data-path="${fullPath}">${part}</span>`;
    });

    return breadcrumbs;
}

// ============================================
// Search Functionality
// ============================================

elements.searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    filterFiles(query);
});

function filterFiles(query) {
    const fileItems = document.querySelectorAll('.file-item');
    let visibleCount = 0;

    fileItems.forEach(item => {
        const name = item.querySelector('.name').textContent.toLowerCase();
        const matches = !query || name.includes(query);
        item.style.display = matches ? 'flex' : 'none';
        if (matches) visibleCount++;
    });

    // Show "no results" if nothing matches
    const existingNoResults = document.querySelector('.no-results');
    if (existingNoResults) existingNoResults.remove();

    if (visibleCount === 0 && query) {
        const noResults = document.createElement('div');
        noResults.className = 'empty-dir no-results';
        noResults.innerHTML = `<p>No files matching "${query}"</p>`;
        elements.fileList.appendChild(noResults);
    }
}

// ============================================
// Drag and Drop Upload
// ============================================

const dropEvents = ['dragenter', 'dragover', 'dragleave', 'drop'];

dropEvents.forEach(eventName => {
    elements.fileExplorer.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    elements.fileExplorer.addEventListener(eventName, () => {
        if (currentPath !== '/') {
            elements.dropZone.style.display = 'flex';
            elements.dropZone.classList.add('active');
        }
    });
});

['dragleave', 'drop'].forEach(eventName => {
    elements.fileExplorer.addEventListener(eventName, () => {
        elements.dropZone.style.display = 'none';
        elements.dropZone.classList.remove('active');
    });
});

elements.fileExplorer.addEventListener('drop', handleDrop);

async function handleDrop(e) {
    if (currentPath === '/') {
        toast.warning('Cannot upload to root directory');
        return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    toast.info(`Uploading ${files.length} file(s)...`);

    for (const file of files) {
        await uploadFile(file);
    }

    await loadFileList();
}

async function uploadFile(file) {
    try {
        const reader = new FileReader();

        return new Promise((resolve, reject) => {
            reader.onload = async (event) => {
                const content = event.target.result;
                const path = currentPath + (currentPath.endsWith('/') ? '' : '/') + file.name;

                if (await flipper.writeFile(path, content)) {
                    toast.success(`Uploaded: ${file.name}`);
                    debugLog.success(`File uploaded: ${path}`);
                    resolve();
                } else {
                    toast.error(`Failed to upload: ${file.name}`);
                    reject(new Error('Upload failed'));
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    } catch (error) {
        toast.error(`Upload error: ${error.message}`);
        debugLog.error(`Upload error: ${error.message}`);
    }
}

// Standard file input upload
elements.fileUpload.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    for (const file of files) {
        await uploadFile(file);
    }

    await loadFileList();
    e.target.value = '';
});

// ============================================
// File List Loading
// ============================================

async function loadFileList(resetScroll = true) {
    const scrollPos = elements.fileList.scrollTop;

    // Update breadcrumb navigation
    elements.currentPath.innerHTML = getPathBreadcrumbs(currentPath);

    // Add click handlers for breadcrumbs
    document.querySelectorAll('.breadcrumb-item').forEach(item => {
        item.addEventListener('click', async () => {
            currentPath = item.dataset.path;
            await loadFileList();
        });
    });

    // Show loading state
    elements.fileList.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <span>Loading files...</span>
        </div>
    `;

    try {
        const items = await flipper.listDirectory(currentPath);
        elements.fileList.innerHTML = '';
        allFiles = items; // Cache for search

        // Handle root directory
        if (currentPath === '/') {
            elements.fileActions.style.display = 'none';
            renderQuickAccess();
        } else {
            elements.fileActions.style.display = 'flex';
            updateNewFileButtonLabel();
            renderFileItems(items);
        }
    } catch (error) {
        elements.fileList.innerHTML = `
            <div class="empty-dir error">
                <p>Error loading directory: ${error.message}</p>
                <button class="flipper-button small" onclick="loadFileList()">Retry</button>
            </div>
        `;
        toast.error('Failed to load directory');
        debugLog.error('Directory load error: ' + error.message);
    }

    if (!resetScroll) {
        elements.fileList.scrollTop = scrollPos;
    }

    // Clear search
    elements.searchInput.value = '';
}

function renderQuickAccess() {
    const quickAccessHTML = `
        <div class="quick-access">
            <button data-path="/ext/badusb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                    <path d="M9 9h6M9 12h6M9 15h4"/>
                </svg>
                BadUSB
            </button>
            <button data-path="/ext/nfc">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M7 15V9l3 3 3-3v6"/>
                    <circle cx="17" cy="12" r="2"/>
                </svg>
                NFC
            </button>
            <button data-path="/ext/subghz">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                    <circle cx="12" cy="20" r="1"/>
                </svg>
                SubGHz
            </button>
            <button data-path="/ext/infrared">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="12" cy="12" r="6" stroke-dasharray="2 2"/>
                    <circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/>
                </svg>
                Infrared
            </button>
        </div>
    `;

    elements.fileList.innerHTML = quickAccessHTML;

    // Add click handlers
    document.querySelectorAll('.quick-access button').forEach(btn => {
        btn.addEventListener('click', async () => {
            currentPath = btn.dataset.path;
            await loadFileList();
        });
    });
}

function renderFileItems(items) {
    if (items.length === 0) {
        elements.fileList.innerHTML = `
            <div class="empty-dir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>This directory is empty</p>
                <button class="flipper-button small secondary" onclick="document.getElementById('newFileBtn').click()">
                    Create a file
                </button>
            </div>
        `;
        return;
    }

    // Sort: directories first, then alphabetically
    const sortedItems = items.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
    });

    sortedItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-item';
        if (currentFile === item.path) {
            div.classList.add('active');
        }

        const icon = getFileIcon(item.name, item.type === 'directory');
        const iconClass = item.type === 'directory' ? 'icon folder' : 'icon';

        div.innerHTML = `
            <span class="${iconClass}">${icon}</span>
            <span class="name">${item.name}</span>
            ${item.type === 'file' ? `
                <span class="size">${item.size || ''}</span>
                <button class="download-btn" title="Download">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
                <button class="delete-btn" title="Delete">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            ` : ''}
        `;

        if (item.type === 'directory') {
            div.addEventListener('click', async () => {
                currentPath = item.path;
                await loadFileList();
            });
        } else {
            div.addEventListener('click', (e) => {
                // Don't trigger if clicking action buttons
                if (!e.target.closest('.download-btn') && !e.target.closest('.delete-btn')) {
                    loadFile(item.path);
                }
            });

            // Download button
            const downloadBtn = div.querySelector('.download-btn');
            downloadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await downloadFile(item.path, item.name);
            });

            // Delete button
            const deleteBtn = div.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                showConfirmModal(
                    'Delete File',
                    `Are you sure you want to delete "${item.name}"?`,
                    async () => {
                        if (await flipper.deleteFile(item.path)) {
                            toast.success(`Deleted: ${item.name}`);
                            if (currentFile === item.path) {
                                currentFile = null;
                                elements.editor.value = '';
                                elements.editor.disabled = true;
                                elements.saveBtn.disabled = true;
                                elements.downloadBtn.disabled = true;
                                elements.currentFile.innerHTML = `
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    No file selected
                                `;
                            }
                            await loadFileList();
                        } else {
                            toast.error('Failed to delete file');
                        }
                    }
                );
            });
        }

        elements.fileList.appendChild(div);
    });
}

function updateNewFileButtonLabel() {
    const newFileBtn = document.getElementById('newFileBtn');
    const span = newFileBtn.querySelector('span');

    if (currentPath.includes('/badusb')) {
        span.textContent = 'New Script';
    } else if (currentPath.includes('/nfc')) {
        span.textContent = 'New NFC';
    } else if (currentPath.includes('/subghz')) {
        span.textContent = 'New SubGHz';
    } else if (currentPath.includes('/infrared')) {
        span.textContent = 'New IR';
    } else {
        span.textContent = 'New File';
    }
}

// ============================================
// File Operations
// ============================================

async function loadFile(path) {
    // Check for unsaved changes
    if (hasUnsavedChanges) {
        showConfirmModal(
            'Unsaved Changes',
            'You have unsaved changes. Discard them and open this file?',
            async () => {
                hasUnsavedChanges = false;
                await doLoadFile(path);
            }
        );
        return;
    }

    await doLoadFile(path);
}

async function doLoadFile(path) {
    debugLog.info(`Loading file: ${path}`);

    // Show loading state
    elements.editor.value = 'Loading...';
    elements.editor.disabled = true;

    const content = await flipper.readFile(path);

    if (content !== null) {
        currentFile = path;
        const filename = path.split('/').pop();
        elements.currentFile.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            ${filename}
        `;
        elements.editor.value = content;
        elements.editor.disabled = false;
        elements.saveBtn.disabled = false;
        elements.downloadBtn.disabled = false;
        hasUnsavedChanges = false;

        // Update active state in file list
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
            if (item.querySelector('.name').textContent === filename) {
                item.classList.add('active');
            }
        });

        toast.success(`Opened: ${filename}`);
        debugLog.success(`File loaded: ${path}`);

        // On mobile, collapse file explorer after opening file
        if (window.innerWidth <= 768) {
            isFileExplorerOpen = false;
            elements.fileExplorer.classList.add('collapsed');
        }
    } else {
        elements.editor.value = '';
        elements.editor.disabled = true;
        elements.saveBtn.disabled = true;
        elements.downloadBtn.disabled = true;
        toast.error('Failed to load file');
        debugLog.error(`Failed to load file: ${path}`);
    }
}

// Track unsaved changes
elements.editor.addEventListener('input', () => {
    if (!hasUnsavedChanges && currentFile) {
        hasUnsavedChanges = true;
        const filename = currentFile.split('/').pop();
        elements.currentFile.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            ${filename} <span class="unsaved">●</span>
        `;
    }
});

// Save file
elements.saveBtn.addEventListener('click', saveCurrentFile);

async function saveCurrentFile() {
    if (!currentFile) return;

    const content = elements.editor.value;
    const saveBtn = elements.saveBtn;
    const originalHTML = saveBtn.innerHTML;

    saveBtn.disabled = true;
    saveBtn.innerHTML = `
        <div class="loading-spinner" style="width: 14px; height: 14px;"></div>
        <span>Saving...</span>
    `;

    try {
        const success = await flipper.writeFile(currentFile, content);
        if (!success) {
            throw new Error('Save failed');
        }

        hasUnsavedChanges = false;
        const filename = currentFile.split('/').pop();
        elements.currentFile.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            ${filename}
        `;

        toast.success(`Saved: ${filename}`);
        debugLog.success(`File saved: ${currentFile}`);

        await loadFileList(false);
    } catch (error) {
        toast.error('Failed to save file');
        debugLog.error(`Save error: ${error.message}`);
    } finally {
        saveBtn.innerHTML = originalHTML;
        saveBtn.disabled = false;
    }
}

// Download file
elements.downloadBtn.addEventListener('click', async () => {
    if (currentFile) {
        const filename = currentFile.split('/').pop();
        await downloadFile(currentFile, filename, elements.editor.value);
    }
});

async function downloadFile(path, filename, content = null) {
    try {
        // If content not provided, read from device
        if (content === null) {
            content = await flipper.readFile(path);
            if (content === null) {
                toast.error('Failed to read file for download');
                return;
            }
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(`Downloaded: ${filename}`);
    } catch (error) {
        toast.error('Download failed: ' + error.message);
    }
}

// New file
elements.newFileBtn.addEventListener('click', async () => {
    let defaultExt = '';
    if (currentPath.includes('/badusb')) {
        defaultExt = '.txt';
    } else if (currentPath.includes('/nfc')) {
        defaultExt = '.nfc';
    } else if (currentPath.includes('/subghz')) {
        defaultExt = '.sub';
    } else if (currentPath.includes('/infrared')) {
        defaultExt = '.ir';
    }

    const filename = prompt(`Enter filename${defaultExt ? ` (will add ${defaultExt})` : ''}:`);
    if (!filename) return;

    const fullFilename = filename.endsWith(defaultExt) ? filename : filename + defaultExt;
    const path = currentPath + (currentPath.endsWith('/') ? '' : '/') + fullFilename;

    try {
        if (await flipper.writeFile(path, '')) {
            toast.success(`Created: ${fullFilename}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadFileList();
            await doLoadFile(path);
        } else {
            toast.error('Failed to create file');
        }
    } catch (error) {
        toast.error('Error creating file: ' + error.message);
    }
});

// ============================================
// Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', (e) => {
    // Ctrl+S - Save
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (currentFile && !elements.saveBtn.disabled) {
            saveCurrentFile();
        }
    }

    // Ctrl+D - Download
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        if (currentFile && !elements.downloadBtn.disabled) {
            elements.downloadBtn.click();
        }
    }

    // Escape - Close mobile menu
    if (e.key === 'Escape') {
        if (window.innerWidth <= 768 && isFileExplorerOpen) {
            isFileExplorerOpen = false;
            elements.fileExplorer.classList.add('collapsed');
        }
    }

    // Ctrl+/ - Focus search
    if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        elements.searchInput.focus();
    }
});

// ============================================
// Warn on unsaved changes before leaving
// ============================================

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ============================================
// Initialize
// ============================================

// Set initial state
updateConnectionStatus('disconnected');