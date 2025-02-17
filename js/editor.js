const DEBUG = true;

const debugLog = {
    log: function(message, type = 'info') {
        if (!DEBUG) return;
        
        const consoleOutput = document.getElementById('consoleOutput');
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = type;
        logEntry.textContent = `[${timestamp}] ${message}`;
        consoleOutput.appendChild(logEntry);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        
        // Also log to browser console
        console.log(`[${type.toUpperCase()}] ${message}`);
    },
    error: function(message) {
        this.log(message, 'error');
    },
    warning: function(message) {
        this.log(message, 'warning');
    },
    success: function(message) {
        this.log(message, 'success');
    },
    info: function(message) {
        this.log(message, 'info');
    }
};

document.getElementById('clearConsole').addEventListener('click', () => {
    document.getElementById('consoleOutput').innerHTML = '';
});

document.getElementById('toggleConsole').addEventListener('click', (e) => {
    const consoleOutput = document.getElementById('consoleOutput');
    const isHidden = consoleOutput.style.display === 'none';
    consoleOutput.style.display = isHidden ? 'block' : 'none';
    e.target.textContent = isHidden ? 'Hide' : 'Show';
});

function updateConnectionStatus(status) {
    const indicator = document.getElementById('statusIndicator');
    indicator.className = 'status-dot ' + status;
    
    switch(status) {
        case 'connected':
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

let flipper = new FlipperSerial();
let currentFile = null;
let currentPath = '/';

document.getElementById('connectBtn').addEventListener('click', async () => {
    updateConnectionStatus('connecting');
    
    try {
        if (await flipper.connect()) {
            document.getElementById('connectBtn').textContent = 'Connected';
            document.getElementById('disconnectBtn').style.display = 'inline-block';
            updateConnectionStatus('connected');
            await loadFileList();
        } else {
            throw new Error('Connection failed');
        }
    } catch (error) {
        debugLog.error('Connection error: ' + error.message);
        updateConnectionStatus('disconnected');
    }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!currentFile) return;
    
    const content = document.getElementById('editor').value;
    const saveBtn = document.getElementById('saveBtn');
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const success = await flipper.writeFile(currentFile, content);
        if (!success) {
            throw new Error('Save failed');
        }
        
        saveBtn.textContent = 'Saved!';
        debugLog.success(`File saved: ${currentFile}`);
        
        // Refresh file list after successful save
        await loadFileList(false);
    } catch (error) {
        debugLog.error(`Save error: ${error.message}`);
        saveBtn.textContent = 'Save Failed!';
        alert('Failed to save file. Please try again.');
    } finally {
        setTimeout(() => {
            saveBtn.textContent = 'Save';
            saveBtn.disabled = false;
        }, 2000);
    }
});

document.getElementById('parentDir').addEventListener('click', async () => {
    if (currentPath === '/') return;
    
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    currentPath = parts.length ? '/' + parts.join('/') : '/';
    await loadFileList();
});

function getPathBreadcrumbs(path) {
    const parts = path.split('/').filter(p => p);
    let breadcrumbs = '';
    let currentPath = '';
    
    breadcrumbs += `<span class="breadcrumb-item" data-path="/">root</span>`;
    parts.forEach(part => {
        currentPath += '/' + part;
        breadcrumbs += ` / <span class="breadcrumb-item" data-path="${currentPath}">${part}</span>`;
    });
    
    return breadcrumbs;
}

// Add these event listeners outside loadFileList, near the top with other listeners
document.getElementById('newFileBtn').addEventListener('click', async () => {
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

    const filename = prompt(`Enter filename${defaultExt ? ` (will end with ${defaultExt})` : ''}:`);
    if (!filename) return;
    
    const fullFilename = filename.endsWith(defaultExt) ? filename : filename + defaultExt;
    const path = currentPath + (currentPath.endsWith('/') ? '' : '/') + fullFilename;
    
    if (await flipper.writeFile(path, '')) {
        // Wait a bit before refreshing to ensure the file is written
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadFileList();  // Refresh directory
        await loadFile(path);  // Open the new file
    } else {
        alert('Failed to create file');
    }
});

document.getElementById('fileUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target.result;
            const path = currentPath + (currentPath.endsWith('/') ? '' : '/') + file.name;
            
            if (await flipper.writeFile(path, content)) {
                debugLog.success(`File uploaded: ${path}`);
                await loadFileList();  // Refresh directory
                await loadFile(path);   // Open the new file
            } else {
                throw new Error('Upload failed');
            }
        };
        reader.readAsText(file);
    } catch (error) {
        debugLog.error(`Upload error: ${error.message}`);
        alert('Failed to upload file. Please try again.');
    } finally {
        e.target.value = '';
    }
});

// Then in loadFileList, just update visibility and text
async function loadFileList(resetScroll = true) {
    const fileList = document.getElementById('fileList');
    const scrollPos = fileList.scrollTop;
    
    // Update breadcrumb navigation
    document.getElementById('currentPath').innerHTML = getPathBreadcrumbs(currentPath);
    
    // Add click handlers for breadcrumbs
    document.querySelectorAll('.breadcrumb-item').forEach(item => {
        item.addEventListener('click', async () => {
            currentPath = item.dataset.path;
            await loadFileList();
        });
    });
    
    // Show loading state
    fileList.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const items = await flipper.listDirectory(currentPath);
        fileList.innerHTML = '';
        
        // Handle root directory
        if (currentPath === '/') {
            // Hide file actions
            document.querySelector('.file-actions').style.display = 'none';
            
            // Add quick access buttons
            fileList.innerHTML = `
                <div class="quick-access">
                    <button data-path="/ext/badusb">BadUSB</button>
                    <button data-path="/ext/nfc">NFC</button>
                    <button data-path="/ext/subghz">SubGHz</button>
                    <button data-path="/ext/infrared">Infrared</button>
                </div>
            `;
            
            // Add quick access click handlers
            document.querySelectorAll('.quick-access button').forEach(btn => {
                btn.addEventListener('click', async () => {
                    currentPath = btn.dataset.path;
                    await loadFileList();
                });
            });
        } else {
            // Show file actions in directories
            const fileActions = document.querySelector('.file-actions');
            fileActions.style.display = 'flex';
            
            // Update new file button label
            const newFileBtn = document.getElementById('newFileBtn');
            if (currentPath.includes('/badusb')) {
                newFileBtn.textContent = 'New BadUSB Script';
            } else if (currentPath.includes('/nfc')) {
                newFileBtn.textContent = 'New NFC Data';
            } else if (currentPath.includes('/subghz')) {
                newFileBtn.textContent = 'New SubGHz Data';
            } else if (currentPath.includes('/infrared')) {
                newFileBtn.textContent = 'New IR Signal';
            } else {
                newFileBtn.textContent = 'New File';
            }
        }
        
        // Display files and directories
        if (items.length === 0) {
            fileList.insertAdjacentHTML('beforeend', '<p class="empty-dir">Directory is empty</p>');
        } else {
            const sortedItems = items.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });
            
            sortedItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML = `
                    <span class="icon">${item.type === 'directory' ? 'DIR' : 'FILE'}</span>
                    <span class="name">${item.name}</span>
                    ${item.type === 'file' ? `
                        <span class="size">${item.size || ''}</span>
                        <button class="delete-btn">X</button>
                    ` : ''}
                `;
                
                if (item.type === 'directory') {
                    div.addEventListener('click', async () => {
                        currentPath = item.path;
                        await loadFileList();
                    });
                } else {
                    div.addEventListener('click', () => loadFile(item.path));
                }
                
                if (item.type === 'file') {
                    const deleteBtn = div.querySelector('.delete-btn');
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete ${item.name}?`)) {
                            if (await flipper.deleteFile(item.path)) {
                                await loadFileList();
                            } else {
                                alert('Failed to delete file');
                            }
                        }
                    });
                }
                
                fileList.appendChild(div);
            });
        }
    } catch (error) {
        fileList.innerHTML = `<p class="error">Error loading directory: ${error.message}</p>`;
        debugLog.error('Directory load error: ' + error.message);
    }
    
    if (!resetScroll) {
        fileList.scrollTop = scrollPos;
    }
}

async function loadFile(path) {
    debugLog.info(`Loading file: ${path}`);
    const content = await flipper.readFile(path);
    const editor = document.getElementById('editor');
    
    if (content !== null) {
        currentFile = path;
        document.getElementById('currentFile').textContent = path;
        editor.value = content;
        editor.disabled = false;  // Enable the editor
        document.getElementById('saveBtn').disabled = false;
        debugLog.success(`File loaded: ${path}`);
    } else {
        editor.value = '';
        editor.disabled = true;   // Disable if load failed
        document.getElementById('saveBtn').disabled = true;
        debugLog.error(`Failed to load file: ${path}`);
    }
}

async function disconnect() {
    if (flipper.port) {
        try {
            await flipper.port.close();
            debugLog.success('Port closed successfully');
        } catch (error) {
            debugLog.error('Error closing port: ' + error.message);
        }
        flipper.port = null;
        flipper.reader = null;
        flipper.writer = null;
    }
    document.getElementById('connectBtn').textContent = 'Connect to Flipper';
    document.getElementById('disconnectBtn').style.display = 'none';
    updateConnectionStatus('disconnected');
}

document.querySelector('header').insertAdjacentHTML('beforeend', `
    <button id="disconnectBtn" style="display: none;">Disconnect</button>
`);

document.getElementById('disconnectBtn').addEventListener('click', async () => {
    try {
        debugLog.info('Starting disconnect process...');
        
        // Wait a bit before disconnecting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Then disconnect the flipper
        await flipper.disconnect();
        
        // Update UI
        document.getElementById('connectBtn').textContent = 'Connect to Flipper';
        document.getElementById('disconnectBtn').style.display = 'none';
        updateConnectionStatus('disconnected');
        
        // Clear the file list
        document.getElementById('fileList').innerHTML = '';
        document.getElementById('currentPath').textContent = '/';
        currentPath = '/';
        
        debugLog.success('Disconnect completed');
    } catch (error) {
        debugLog.error('Disconnect error: ' + error.message);
    }
});

window.addEventListener('beforeunload', async () => {
    await disconnect();
});

// Update the CSS
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .path-navigator {
            margin-bottom: 10px;
            padding: 5px;
            background-color: #f8f9fa;
            border-radius: 4px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        #currentPath {
            font-family: monospace;
            color: #666;
        }
        
        .file-item:hover {
            background-color: #e9ecef !important;
        }
        
        .file-item .icon {
            font-size: 1.2em;
        }
    </style>
`); 