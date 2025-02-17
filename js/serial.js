class FlipperSerial {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.buffer = '';
    }

    async connect() {
        try {
            debugLog.info('Requesting serial port...');
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            
            // Start reading loop
            this.readLoop();
            
            // Send initial break
            await this.write('\x03');
            await this.write('\r');
            
            // Wait for prompt
            await this.waitForPrompt();
            
            debugLog.success('Connected to Flipper');
            return true;
        } catch (error) {
            debugLog.error('Connection failed:', error);
            return false;
        }
    }

    async readLoop() {
        while (true) {
            try {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                const text = new TextDecoder().decode(value);
                this.buffer += text;
                
                if (text.includes('\n')) {
                    debugLog.info('Received:', text);
                }
            } catch (error) {
                debugLog.error('Read error:', error);
                break;
            }
        }
    }

    async write(data) {
        await this.writer.write(new TextEncoder().encode(data));
    }

    async waitForPrompt(timeout = 5000) {
        const startTime = Date.now();
        while (!this.buffer.includes('>:')) {
            if (Date.now() - startTime > timeout) {
                throw new Error('Timeout waiting for prompt');
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const response = this.buffer;
        this.buffer = '';
        return response;
    }

    async sendCommand(cmd) {
        await this.write(cmd + '\r');
        // Wait for command to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        const response = this.buffer;
        this.buffer = '';
        return response;
    }

    async listDirectory(path) {
        try {
            debugLog.info(`Listing directory: ${path}`);
            await this.write(`storage list ${path}\r`);
            
            // Wait for listing to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const response = this.buffer;
            this.buffer = '';
            
            const lines = response.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.includes('>:') && !line.includes('storage list'));
            
            debugLog.info(`Found ${lines.length} items`);
            
            return lines.map(line => {
                if (line.startsWith('[D]')) {
                    const name = line.substring(3).trim();
                    return {
                        name,
                        type: 'directory',
                        path: path + (path.endsWith('/') ? '' : '/') + name
                    };
                } else if (line.startsWith('[F]')) {
                    const parts = line.substring(3).trim().split(' ');
                    const name = parts[0];
                    const size = parts[1] || '';
                    return {
                        name,
                        type: 'file',
                        path: path + (path.endsWith('/') ? '' : '/') + name,
                        size
                    };
                }
                return null;
            }).filter(item => item !== null);
        } catch (error) {
            debugLog.error(`List directory error: ${error.message}`);
            return [];
        }
    }

    async readFile(path) {
        try {
            await this.write(`storage read ${path}\r`);
            
            // Wait for read to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const response = this.buffer;
            this.buffer = '';
            const lines = response.split('\n');
            
            // Filter out command echo and prompt
            const content = lines
                .filter(line => 
                    !line.includes('storage read') && 
                    !line.includes('>:') &&
                    line.trim()
                )
                .join('\n')
                .trim();
                
            debugLog.success(`File read successfully: ${path}`);
            return content;
        } catch (error) {
            debugLog.error(`Read error: ${error.message}`);
            return null;
        }
    }

    async writeFile(path, content) {
        try {
            // First delete existing file
            await this.sendCommand(`storage remove ${path}`);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Start write command and wait for text data prompt
            await this.write(`storage write ${path}\r`);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Write content in chunks
            const CHUNK_SIZE = 512; // Match Flipper's buffer size
            let offset = 0;
            
            while (offset < content.length) {
                const chunk = content.slice(offset, offset + CHUNK_SIZE);
                await this.write(chunk);
                offset += CHUNK_SIZE;
                
                // Small delay between chunks
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Ensure final newline
            if (!content.endsWith('\n')) {
                await this.write('\n');
            }
            
            // End write with Ctrl+C
            await new Promise(resolve => setTimeout(resolve, 200));
            await this.write('\x03');
            
            // Final delay to ensure write completes
            await new Promise(resolve => setTimeout(resolve, 500));
            
            debugLog.success(`File written successfully: ${path}`);
            return true;
        } catch (error) {
            debugLog.error(`Write error: ${error.message}`);
            return false;
        }
    }

    async deleteFile(path) {
        try {
            // Send delete command
            await this.sendCommand(`storage remove ${path}`);
            
            // Wait a bit to ensure file is deleted
            await new Promise(resolve => setTimeout(resolve, 100));
            
            debugLog.success(`File deleted: ${path}`);
            return true;
        } catch (error) {
            debugLog.error(`Delete error: ${error.message}`);
            return false;
        }
    }

    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
            this.reader = null;
        }
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
        this.buffer = '';
        debugLog.info('Disconnected');
    }
}