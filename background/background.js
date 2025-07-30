class WaybackBackgroundService {
    constructor() {
        this.setupMessageListener();
        this.rateLimitDelay = 1000; // 1 second between requests
        this.maxRetries = 3;
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'fetchWaybackUrls') {
                this.handleFetchRequest(message, sendResponse);
                return true; // Keep message channel open for async response
            }
        });
    }

    async handleFetchRequest(message, sendResponse) {
        try {
            const { domain, options = {} } = message;
            
            if (!this.isValidDomain(domain)) {
                sendResponse({ error: 'Invalid domain format' });
                return;
            }

            const urls = await this.fetchWaybackUrls(domain, options);
            sendResponse({ urls });
            
        } catch (error) {
            console.error('Background fetch error:', error);
            sendResponse({ error: error.message });
        }
    }

    async fetchWaybackUrls(domain, options = {}) {
        try {
            this.sendProgressUpdate(10, 'Querying Wayback Machine...');
            
            // Prepare search URL
            const searchDomain = options.removeWWW ? domain.replace(/^www\./, '') : domain;
            const wildcardDomain = options.includeSubdomains ? `*.${searchDomain}` : searchDomain;
            
            const params = new URLSearchParams({
                url: wildcardDomain,
                output: 'json',
                fl: 'timestamp,original,statuscode',
                collapse: 'urlkey',
                limit: '50000'  // Reasonable limit to prevent overwhelming
            });

            const apiUrl = `http://web.archive.org/cdx/search/cdx?${params}`;
            
            this.sendProgressUpdate(30, 'Fetching data from archive...');
            
            const response = await this.fetchWithRetry(apiUrl);
            
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            
            this.sendProgressUpdate(60, 'Processing results...');
            
            const urls = this.parseWaybackResponse(text, domain, options);
            
            this.sendProgressUpdate(80, 'Deduplicating URLs...');
            
            const processedUrls = this.processUrls(urls, options);
            
            this.sendProgressUpdate(100, `Found ${processedUrls.length} URLs`);
            
            return processedUrls;
            
        } catch (error) {
            console.error('Error fetching Wayback URLs:', error);
            throw error;
        }
    }

    async fetchWithRetry(url, retries = this.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                
                if (response.status === 429) { // Rate limited
                    if (i < retries - 1) {
                        await this.delay(this.rateLimitDelay * (i + 1));
                        continue;
                    }
                }
                
                return response;
                
            } catch (error) {
                if (i === retries - 1) throw error;
                await this.delay(this.rateLimitDelay);
            }
        }
    }

    parseWaybackResponse(text, domain, options) {
        const lines = text.trim().split('\n');
        const urls = [];
        
        // Skip header if present
        const startIndex = lines[0] && lines[0].includes('timestamp') ? 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const parts = JSON.parse(`[${line}]`);
                if (parts.length >= 3) {
                    const [timestamp, original, statuscode] = parts;
                    
                    // Validate URL
                    if (this.isValidUrl(original)) {
                        urls.push({
                            timestamp: this.parseTimestamp(timestamp),
                            url: original,
                            statuscode: parseInt(statuscode) || 0
                        });
                    }
                }
            } catch (e) {
                // Handle non-JSON format (space-separated)
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                    const [timestamp, original, statuscode] = parts;
                    
                    if (this.isValidUrl(original)) {
                        urls.push({
                            timestamp: this.parseTimestamp(timestamp),
                            url: original,
                            statuscode: parseInt(statuscode) || 0
                        });
                    }
                }
            }
        }
        
        return urls;
    }

    processUrls(urls, options) {
        // Remove duplicates by URL
        const uniqueUrls = new Map();
        
        urls.forEach(urlData => {
            const key = urlData.url.toLowerCase();
            if (!uniqueUrls.has(key) || uniqueUrls.get(key).timestamp < urlData.timestamp) {
                uniqueUrls.set(key, urlData);
            }
        });
        
        let processed = Array.from(uniqueUrls.values());
        
        // Sort by URL for consistent ordering
        processed.sort((a, b) => a.url.localeCompare(b.url));
        
        // Filter common non-interesting files if specified
        if (options.filterCommon) {
            processed = processed.filter(urlData => !this.isCommonFile(urlData.url));
        }
        
        return processed;
    }

    isValidDomain(domain) {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        return domain && domainRegex.test(domain);
    }

    isValidUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    parseTimestamp(timestamp) {
        // Wayback timestamp format: YYYYMMDDHHMMSS
        if (timestamp.length >= 14) {
            const year = timestamp.substring(0, 4);
            const month = timestamp.substring(4, 6);
            const day = timestamp.substring(6, 8);
            const hour = timestamp.substring(8, 10);
            const minute = timestamp.substring(10, 12);
            const second = timestamp.substring(12, 14);
            
            return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
        }
        return timestamp;
    }

    isCommonFile(url) {
        const commonExtensions = [
            '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
            '.css', '.js', '.woff', '.woff2', '.ttf', '.eot',
            '.mp4', '.mp3', '.wav', '.avi', '.mov', '.pdf',
            '.zip', '.rar', '.tar', '.gz'
        ];
        
        const lowerUrl = url.toLowerCase();
        return commonExtensions.some(ext => lowerUrl.includes(ext));
    }

    sendProgressUpdate(percent, text) {
        chrome.runtime.sendMessage({
            action: 'updateProgress',
            percent: percent,
            text: text
        }).catch(() => {
            // Popup might be closed, ignore error
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize background service
const waybackService = new WaybackBackgroundService();

// Handle extension lifecycle
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Wayback URLs extension installed');
        // Create context menu for quick domain extraction
        chrome.contextMenus.create({
            id: 'wayback-extract',
            title: 'Extract Wayback URLs for "%s"',
            contexts: ['selection'],
            documentUrlPatterns: ['http://*/*', 'https://*/*']
        });
    } else if (details.reason === 'update') {
        console.log('Wayback URLs extension updated');
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Wayback URLs extension started');
});

chrome.contextMenus.onClicked.addListener((info, _tab) => {
    if (info.menuItemId === 'wayback-extract' && info.selectionText) {
        const domain = info.selectionText.trim();
        if (waybackService.isValidDomain(domain)) {
            // Store the selected domain for the popup to use
            chrome.storage.local.set({ 'contextDomain': domain });
            // Open popup
            chrome.action.openPopup();
        }
    }
});