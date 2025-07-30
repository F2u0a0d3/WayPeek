class WaybackPopup {
    constructor() {
        this.currentDomain = '';
        this.allUrls = [];
        this.filteredUrls = [];
        this.activeFilters = {
            extensions: new Set(),
            statusCodes: new Set(),
            pattern: ''
        };

        this.initializeElements();
        this.bindEvents();
        this.loadCurrentDomain();
        this.loadStoredData();
        this.refreshStorageStats();
    }

    initializeElements() {
        this.domainInput = document.getElementById('domainInput');
        this.extractBtn = document.getElementById('extractBtn');
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.urlList = document.getElementById('urlList');
        this.searchInput = document.getElementById('searchInput');
        this.stats = document.getElementById('stats');
        this.totalUrls = document.getElementById('totalUrls');
        this.filteredUrlsElement = document.getElementById('filteredUrls');
        this.filteredCount = document.getElementById('filteredCount');
    }

    bindEvents() {
        this.extractBtn.addEventListener('click', () => this.extractUrls());
        this.searchInput.addEventListener('input', (e) => this.searchUrls(e.target.value));
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Filter events
        document.getElementById('applyFilters').addEventListener('click', () => this.applyAdvancedFilters());
        document.getElementById('clearFilters').addEventListener('click', () => this.clearAdvancedFilters());
        document.getElementById('presetFilters').addEventListener('click', () => this.toggleSecurityPresets());
        

        // Security preset buttons - will be bound when presets are shown
        // Moved to toggleSecurityPresets method
        
        // Real-time pattern filter
        document.getElementById('patternFilter').addEventListener('input', (e) => {
            this.activeFilters.pattern = e.target.value;
            this.applyFilters();
        });
        
        // Real-time extension input filtering
        document.getElementById('extensionInput').addEventListener('input', (e) => {
            this.syncExtensionInputToCheckboxes(e.target.value);
        });
        
        // Real-time status input filtering
        document.getElementById('statusInput').addEventListener('input', (e) => {
            this.syncStatusInputToCheckboxes(e.target.value);
        });

        // Export events
        document.getElementById('exportBtn').addEventListener('click', () => this.exportUrls());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());

        // Storage events
        document.getElementById('refreshStorage').addEventListener('click', () => this.refreshStorageStats());
        document.getElementById('historySearch').addEventListener('input', (e) => this.filterHistory(e.target.value));
        document.getElementById('sortHistory').addEventListener('change', (e) => this.sortHistory(e.target.value));
        document.getElementById('exportAllData').addEventListener('click', () => this.exportAllStorageData());
        document.getElementById('importData').addEventListener('click', () => this.importStorageData());
        document.getElementById('clearOldData').addEventListener('click', () => this.clearOldStorageData());
        document.getElementById('clearAllStorage').addEventListener('click', () => this.clearAllStorageData());

        // Domain input validation
        this.domainInput.addEventListener('input', (e) => {
            const domain = e.target.value.trim();
            this.extractBtn.disabled = !this.isValidDomain(domain);
        });

        this.domainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.extractBtn.disabled) {
                this.extractUrls();
            }
        });
    }

    async loadCurrentDomain() {
        try {
            // First check if there's a context domain from right-click menu
            const storage = await chrome.storage.local.get('contextDomain');
            if (storage.contextDomain) {
                this.domainInput.value = storage.contextDomain;
                this.extractBtn.disabled = false;
                // Clear the context domain after using it
                chrome.storage.local.remove('contextDomain');
                return;
            }

            // Otherwise, get domain from current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url) {
                const url = new URL(tab.url);
                if (url.hostname && !url.hostname.startsWith('chrome')) {
                    this.domainInput.value = url.hostname.replace(/^www\./, '');
                    this.extractBtn.disabled = false;
                }
            }
        } catch (error) {
            console.log('Could not get current tab domain:', error);
        }
    }

    async loadStoredData() {
        const domain = this.domainInput.value.trim();
        if (domain) {
            try {
                const key = `wayback_${domain}`;
                const result = await chrome.storage.local.get([key]);
                if (result[key] && result[key].urls && result[key].urls.length > 0) {
                    this.allUrls = result[key].urls;
                    this.currentDomain = domain;
                    this.displayUrls(this.allUrls);
                    this.generateFilters(this.allUrls);
                }
            } catch (error) {
                console.error('Error loading stored data:', error);
            }
        }
    }

    isValidDomain(domain) {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        return domain && domainRegex.test(domain);
    }

    async extractUrls() {
        const domain = this.domainInput.value.trim();
        if (!this.isValidDomain(domain)) {
            this.showError('Please enter a valid domain');
            return;
        }

        this.currentDomain = domain;
        this.extractBtn.disabled = true;
        this.showProgress('Initializing...');

        try {
            const options = {
                removeWWW: document.getElementById('removeWWW').checked,
                includeSubdomains: document.getElementById('includeSubdomains').checked,
                fastMode: document.getElementById('fastMode').checked
            };

            const urls = await this.fetchWaybackUrls(domain, options);
            
            console.log('Extracted URLs:', urls.length, urls.slice(0, 3)); // Debug log
            
            if (urls.length === 0) {
                this.hideProgress();
                this.showError('No URLs found for this domain');
                return;
            }

            this.allUrls = urls;
            
            // Store URLs with metadata
            const storageData = {
                domain: domain,
                urls: urls,
                timestamp: Date.now(),
                count: urls.length
            };
            const key = `wayback_${domain}`;
            await chrome.storage.local.set({ [key]: storageData });
            
            this.displayUrls(urls);
            this.generateFilters(urls);
            this.hideProgress();
            
        } catch (error) {
            this.hideProgress();
            this.showError(`Error: ${error.message}`);
        } finally {
            this.extractBtn.disabled = false;
        }
    }

    async fetchWaybackUrls(domain, options = {}) {
        return new Promise((resolve, reject) => {
            // Use Wayback CDX API with correct parameters
            const searchDomain = options.removeWWW ? domain.replace(/^www\./, '') : domain;
            const wildcardDomain = options.includeSubdomains ? `*.${searchDomain}` : searchDomain;
            
            // Determine limit based on fast mode
            const limit = options.fastMode ? '10000' : '50000';
            
            // Build API URL with base parameters
            let apiUrl = `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(wildcardDomain)}/*&output=json&fl=timestamp,original,statuscode&collapse=urlkey&limit=${limit}`;
            
            
            chrome.runtime.sendMessage({
                action: 'fetchWayback',
                url: apiUrl
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response.error) {
                    reject(new Error(response.error));
                } else if (response.success) {
                    const processedUrls = this.processWaybackResponse(response.data, domain);
                    resolve(processedUrls);
                } else {
                    reject(new Error('Unknown response format'));
                }
            });
        });
    }

    processWaybackResponse(rawData, domain) {
        if (!Array.isArray(rawData) || rawData.length <= 1) {
            return [];
        }
        
        console.log('Processing', rawData.length, 'raw entries...');
        
        // First row might be headers, rest are data
        const dataRows = rawData[0] && Array.isArray(rawData[0]) && rawData[0].includes('timestamp') ? rawData.slice(1) : rawData;
        
        // Use Map for faster duplicate detection
        const urlMap = new Map();
        
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const [timestamp, original, statuscode] = Array.isArray(row) ? row : row.split(' ');
            
            if (original && this.isValidUrl(original)) {
                const urlKey = original.toLowerCase();
                const urlData = {
                    url: original,
                    timestamp: this.parseTimestamp(timestamp),
                    statuscode: parseInt(statuscode) || 200
                };
                
                // Keep the most recent entry for each URL
                if (!urlMap.has(urlKey) || urlMap.get(urlKey).timestamp < urlData.timestamp) {
                    urlMap.set(urlKey, urlData);
                }
            }
            
            // Show progress every 1000 items
            if (i % 1000 === 0) {
                const progress = Math.round((i / dataRows.length) * 70) + 20; // 20-90% range
                this.updateProgress(progress, `Processing ${i}/${dataRows.length} URLs...`);
            }
        }
        
        const uniqueUrls = Array.from(urlMap.values());
        console.log('Processed to', uniqueUrls.length, 'unique URLs');
        
        this.updateProgress(90, 'Sorting results...');
        
        // Sort by timestamp (newest first)
        return uniqueUrls.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    parseTimestamp(timestamp) {
        // Wayback timestamp format: YYYYMMDDHHMMSS
        if (timestamp && timestamp.length >= 14) {
            const year = timestamp.substring(0, 4);
            const month = timestamp.substring(4, 6);
            const day = timestamp.substring(6, 8);
            const hour = timestamp.substring(8, 10);
            const minute = timestamp.substring(10, 12);
            const second = timestamp.substring(12, 14);
            
            return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
        }
        return new Date().toISOString();
    }

    isValidUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    showProgress(text) {
        this.progressSection.style.display = 'block';
        this.progressText.textContent = text;
        this.progressFill.style.width = '0%';
    }

    updateProgress(percent, text) {
        if (this.progressFill) {
            this.progressFill.style.width = `${percent}%`;
        }
        if (text && this.progressText) {
            this.progressText.textContent = text;
        }
    }

    hideProgress() {
        this.progressSection.style.display = 'none';
    }

    displayUrls(urls) {
        try {
            console.log('Displaying URLs:', urls.length); // Debug log
            this.filteredUrls = urls;
            
            if (!urls || urls.length === 0) {
                this.urlList.innerHTML = `
                    <div class="empty-state">
                        <p>No URLs match current filters</p>
                    </div>
                `;
                this.stats.style.display = 'none';
                return;
            }

            this.stats.style.display = 'block';
            this.totalUrls.textContent = this.allUrls.length;
            
            if (this.allUrls.length !== urls.length) {
                this.filteredUrlsElement.style.display = 'inline';
                this.filteredCount.textContent = urls.length;
            } else {
                this.filteredUrlsElement.style.display = 'none';
            }

            // Limit displayed URLs for performance (show first 1000, rest can be searched/filtered)
            const maxDisplay = 1000;
            const urlsToShow = urls.slice(0, maxDisplay);
            
            const urlsHtml = urlsToShow.map(url => this.createUrlItem(url)).join('');
            this.urlList.innerHTML = urlsHtml;
            
            // Show message if there are more URLs
            if (urls.length > maxDisplay) {
                const moreMessage = document.createElement('div');
                moreMessage.className = 'more-results-message';
                moreMessage.innerHTML = `
                    <p>Showing first ${maxDisplay} of ${urls.length} URLs</p>
                    <p>Use search or filters to find specific URLs</p>
                `;
                this.urlList.appendChild(moreMessage);
            }

            // Add click handlers for copying URLs
            this.urlList.querySelectorAll('.url-item').forEach((item, index) => {
                item.addEventListener('click', () => {
                    navigator.clipboard.writeText(urlsToShow[index].url);
                    this.showToast('URL copied to clipboard');
                });
            });
        } catch (error) {
            console.error('Error displaying URLs:', error);
            this.showError('Error displaying URLs: ' + error.message);
        }
    }

    createUrlItem(urlData) {
        const statusClass = this.getStatusClass(urlData.statuscode);
        const extension = this.getFileExtension(urlData.url);
        let timestamp = 'Unknown';
        try {
            if (urlData.timestamp) {
                const date = new Date(urlData.timestamp);
                timestamp = date.toLocaleDateString();
            }
        } catch (e) {
            timestamp = 'Invalid Date';
        }

        return `
            <div class="url-item">
                <div class="url-main">${this.escapeHtml(urlData.url)}</div>
                <div class="url-meta">
                    <span class="status-code ${statusClass}">${urlData.statuscode}</span>
                    <span class="timestamp">${timestamp}</span>
                    ${extension ? `<span class="extension">.${extension}</span>` : ''}
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        if (status >= 200 && status < 300) return 'status-200';
        if (status >= 300 && status < 400) return 'status-300';
        if (status >= 400 && status < 500) return 'status-400';
        if (status >= 500) return 'status-500';
        return '';
    }

    getFileExtension(url) {
        const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
        return match ? match[1].toLowerCase() : null;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateFilters(urls) {
        const extensions = new Set();
        const statusCodes = new Set();

        urls.forEach(url => {
            const ext = this.getFileExtension(url.url);
            if (ext) extensions.add(ext);
            statusCodes.add(url.statuscode);
        });

        this.generateExtensionFilters([...extensions].sort());
        this.generateStatusFilters([...statusCodes].sort());
    }

    generateExtensionFilters(extensions) {
        const container = document.getElementById('extensionFilters');
        container.innerHTML = extensions.map(ext => `
            <label>
                <input type="checkbox" value="${ext}" data-filter="extension">
                .${ext}
            </label>
        `).join('');

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => this.updateExtensionFilters());
        });
    }

    generateStatusFilters(statusCodes) {
        const container = document.getElementById('statusFilters');
        container.innerHTML = statusCodes.map(code => `
            <label>
                <input type="checkbox" value="${code}" data-filter="status">
                ${code}
            </label>
        `).join('');

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => this.updateStatusFilters());
        });
    }

    updateExtensionFilters() {
        this.activeFilters.extensions.clear();
        document.querySelectorAll('#extensionFilters input:checked').forEach(input => {
            this.activeFilters.extensions.add(input.value);
        });
        this.applyFilters();
    }

    updateStatusFilters() {
        this.activeFilters.statusCodes.clear();
        document.querySelectorAll('#statusFilters input:checked').forEach(input => {
            this.activeFilters.statusCodes.add(parseInt(input.value));
        });
        this.applyFilters();
    }

    applyFilters() {
        if (!this.allUrls || this.allUrls.length === 0) {
            this.displayUrls([]);
            return;
        }

        let filtered = [...this.allUrls];
        console.log('Starting filtering with', filtered.length, 'URLs');

        // Extension filter from checkboxes
        if (this.activeFilters.extensions.size > 0) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(url => {
                const ext = this.getFileExtension(url.url);
                return ext && this.activeFilters.extensions.has(ext);
            });
            console.log('Extension filter:', beforeCount, '->', filtered.length);
        }

        // Status code filter from checkboxes
        if (this.activeFilters.statusCodes.size > 0) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(url => 
                this.activeFilters.statusCodes.has(url.statuscode)
            );
            console.log('Status filter:', beforeCount, '->', filtered.length);
        }

        // Pattern filter from input field
        if (this.activeFilters.pattern) {
            const beforeCount = filtered.length;
            try {
                // Try as regex first, fallback to simple string match
                const regex = new RegExp(this.activeFilters.pattern, 'i');
                filtered = filtered.filter(url => regex.test(url.url));
            } catch {
                // Fallback to simple string matching
                const pattern = this.activeFilters.pattern.toLowerCase();
                filtered = filtered.filter(url => 
                    url.url.toLowerCase().includes(pattern)
                );
            }
            console.log('Pattern filter:', beforeCount, '->', filtered.length);
        }

        // Date range filter
        const fromDateInput = document.getElementById('fromDate');
        const toDateInput = document.getElementById('toDate');
        const fromDate = fromDateInput ? fromDateInput.value.trim() : '';
        const toDate = toDateInput ? toDateInput.value.trim() : '';
        
        if (fromDate && /^\d{8}$/.test(fromDate)) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(url => {
                const urlDate = url.timestamp.replace(/[-:TZ]/g, '').substring(0, 8);
                return urlDate >= fromDate;
            });
            console.log('From date filter:', beforeCount, '->', filtered.length);
        }
        
        if (toDate && /^\d{8}$/.test(toDate)) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(url => {
                const urlDate = url.timestamp.replace(/[-:TZ]/g, '').substring(0, 8);
                return urlDate <= toDate;
            });
            console.log('To date filter:', beforeCount, '->', filtered.length);
        }

        // Search filter from search box
        const searchTerm = this.searchInput ? this.searchInput.value.toLowerCase().trim() : '';
        if (searchTerm) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(url => 
                url.url.toLowerCase().includes(searchTerm)
            );
            console.log('Search filter:', beforeCount, '->', filtered.length);
        }

        console.log('Final filtered results:', filtered.length);
        this.displayUrls(filtered);
    }

    clearFilters() {
        this.activeFilters.extensions.clear();
        this.activeFilters.statusCodes.clear();
        this.activeFilters.pattern = '';
        
        document.querySelectorAll('#extensionFilters input, #statusFilters input').forEach(input => {
            input.checked = false;
        });
        document.getElementById('patternFilter').value = '';
        document.getElementById('fromDate').value = '';
        document.getElementById('toDate').value = '';
        
        this.applyFilters();
    }

    searchUrls(searchTerm) {
        this.applyFilters();
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');
    }

    exportUrls() {
        const format = document.getElementById('exportFormat').value;
        const scope = document.querySelector('input[name="exportScope"]:checked').value;
        const urls = scope === 'all' ? this.allUrls : this.filteredUrls;

        if (urls.length === 0) {
            this.showError('No URLs to export');
            return;
        }

        let content = '';
        let filename = `wayback-${this.currentDomain}-${Date.now()}`;

        switch (format) {
            case 'txt':
                content = urls.map(url => url.url).join('\n');
                filename += '.txt';
                break;
            case 'json':
                content = JSON.stringify(urls, null, 2);
                filename += '.json';
                break;
            case 'csv':
                content = 'URL,Status Code,Timestamp\n' + 
                    urls.map(url => `"${url.url}",${url.statuscode},"${url.timestamp}"`).join('\n');
                filename += '.csv';
                break;
        }

        this.downloadFile(content, filename);
    }

    downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    async copyToClipboard() {
        const scope = document.querySelector('input[name="exportScope"]:checked').value;
        const urls = scope === 'all' ? this.allUrls : this.filteredUrls;
        
        if (urls.length === 0) {
            this.showError('No URLs to copy');
            return;
        }

        const text = urls.map(url => url.url).join('\n');
        
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('URLs copied to clipboard');
        } catch (error) {
            this.showError('Failed to copy to clipboard');
        }
    }

    async clearAllData() {
        if (confirm('Are you sure you want to clear all stored data?')) {
            try {
                // Get all storage keys and remove wayback-related ones
                const allData = await chrome.storage.local.get(null);
                const waybackKeys = Object.keys(allData).filter(key => key.startsWith('wayback_'));
                
                if (waybackKeys.length > 0) {
                    await chrome.storage.local.remove(waybackKeys);
                }
                
                this.allUrls = [];
                this.filteredUrls = [];
                this.urlList.innerHTML = `
                    <div class="empty-state">
                        <p>No URLs extracted yet</p>
                        <p>Enter a domain above to get started</p>
                    </div>
                `;
                this.stats.style.display = 'none';
                this.showToast('All data cleared');
            } catch (error) {
                this.showError('Failed to clear data');
            }
        }
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            background: ${type === 'error' ? '#f44336' : '#4CAF50'};
            color: white;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
            style.remove();
        }, 3000);
    }

    // Storage Management Methods
    async refreshStorageStats() {
        try {
            const allData = await chrome.storage.local.get(null);
            const waybackData = Object.entries(allData).filter(([key]) => key.startsWith('wayback_'));
            
            let totalUrls = 0;
            const domains = waybackData.map(([key, data]) => {
                if (data.urls) {
                    totalUrls += data.urls.length;
                }
                return {
                    domain: key.replace('wayback_', ''),
                    data: data
                };
            });

            // Calculate storage usage
            const storageSize = JSON.stringify(allData).length;
            const storageSizeKB = Math.round(storageSize / 1024 * 100) / 100;

            // Update UI
            document.getElementById('totalDomains').textContent = domains.length;
            document.getElementById('totalStoredUrls').textContent = totalUrls;
            document.getElementById('storageUsed').textContent = `${storageSizeKB} KB`;

            // Update history list
            this.updateHistoryList(domains);

        } catch (error) {
            console.error('Error refreshing storage stats:', error);
            this.showError('Failed to load storage statistics');
        }
    }

    updateHistoryList(domains) {
        const historyList = document.getElementById('historyList');
        
        if (domains.length === 0) {
            historyList.innerHTML = '<div class="no-data">No search history yet</div>';
            return;
        }

        const sortBy = document.getElementById('sortHistory').value;
        const searchTerm = document.getElementById('historySearch').value.toLowerCase();

        // Filter domains
        let filteredDomains = domains.filter(item => 
            item.domain.toLowerCase().includes(searchTerm)
        );

        // Sort domains
        filteredDomains.sort((a, b) => {
            switch (sortBy) {
                case 'date':
                    return (b.data.timestamp || 0) - (a.data.timestamp || 0);
                case 'domain':
                    return a.domain.localeCompare(b.domain);
                case 'urls':
                    return (b.data.count || 0) - (a.data.count || 0);
                default:
                    return 0;
            }
        });

        const historyHtml = filteredDomains.map(item => {
            const date = item.data.timestamp ? new Date(item.data.timestamp).toLocaleDateString() : 'Unknown';
            const urlCount = item.data.count || 0;
            
            return `
                <div class="history-item" data-domain="${item.domain}">
                    <div class="history-info">
                        <div class="history-domain">${item.domain}</div>
                        <div class="history-meta">
                            <span>${urlCount} URLs</span>
                            <span>${date}</span>
                        </div>
                    </div>
                    <div class="history-actions">
                        <button class="history-action-btn load-btn" data-domain="${item.domain}">Load</button>
                        <button class="history-action-btn export-btn" data-domain="${item.domain}">Export</button>
                        <button class="history-action-btn danger delete-btn" data-domain="${item.domain}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        historyList.innerHTML = historyHtml;

        // Add event listeners for history action buttons
        historyList.querySelectorAll('.load-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const domain = btn.dataset.domain;
                this.loadHistoryItem(domain);
            });
        });

        historyList.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const domain = btn.dataset.domain;
                this.exportHistoryItem(domain);
            });
        });

        historyList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const domain = btn.dataset.domain;
                this.deleteHistoryItem(domain);
            });
        });
    }

    filterHistory(searchTerm) {
        this.refreshStorageStats();
    }

    sortHistory(sortBy) {
        this.refreshStorageStats();
    }

    async loadHistoryItem(domain) {
        try {
            const key = `wayback_${domain}`;
            const result = await chrome.storage.local.get([key]);
            
            if (result[key] && result[key].urls) {
                this.domainInput.value = domain;
                this.allUrls = result[key].urls;
                this.currentDomain = domain;
                this.displayUrls(this.allUrls);
                this.generateFilters(this.allUrls);
                
                // Switch to results tab
                this.switchTab('results');
                
                this.showToast(`Loaded ${this.allUrls.length} URLs for ${domain}`);
            }
        } catch (error) {
            console.error('Error loading history item:', error);
            this.showError('Failed to load domain data');
        }
    }

    async exportHistoryItem(domain) {
        try {
            const key = `wayback_${domain}`;
            const result = await chrome.storage.local.get([key]);
            
            if (result[key] && result[key].urls) {
                const urls = result[key].urls;
                const content = urls.map(url => url.url).join('\n');
                const filename = `wayback-${domain}-${Date.now()}.txt`;
                
                this.downloadFile(content, filename);
                this.showToast(`Exported ${urls.length} URLs for ${domain}`);
            }
        } catch (error) {
            console.error('Error exporting history item:', error);
            this.showError('Failed to export domain data');
        }
    }

    async deleteHistoryItem(domain) {
        if (confirm(`Delete all data for ${domain}?`)) {
            try {
                const key = `wayback_${domain}`;
                await chrome.storage.local.remove([key]);
                this.refreshStorageStats();
                this.showToast(`Deleted data for ${domain}`);
            } catch (error) {
                console.error('Error deleting history item:', error);
                this.showError('Failed to delete domain data');
            }
        }
    }

    async exportAllStorageData() {
        try {
            const allData = await chrome.storage.local.get(null);
            const waybackData = Object.entries(allData)
                .filter(([key]) => key.startsWith('wayback_'))
                .reduce((obj, [key, value]) => {
                    obj[key] = value;
                    return obj;
                }, {});

            const exportData = {
                exportDate: new Date().toISOString(),
                version: '1.0.0',
                totalDomains: Object.keys(waybackData).length,
                data: waybackData
            };

            const content = JSON.stringify(exportData, null, 2);
            const filename = `wayback-all-data-${Date.now()}.json`;
            
            this.downloadFile(content, filename);
            this.showToast(`Exported data for ${Object.keys(waybackData).length} domains`);
        } catch (error) {
            console.error('Error exporting all data:', error);
            this.showError('Failed to export all data');
        }
    }

    importStorageData() {
        const fileInput = document.getElementById('importFile');
        fileInput.click();
        
        fileInput.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const importData = JSON.parse(text);
                
                if (importData.data && typeof importData.data === 'object') {
                    const domainCount = Object.keys(importData.data).length;
                    
                    if (confirm(`Import data for ${domainCount} domains? This will overwrite existing data for those domains.`)) {
                        await chrome.storage.local.set(importData.data);
                        this.refreshStorageStats();
                        this.showToast(`Imported data for ${domainCount} domains`);
                    }
                } else {
                    this.showError('Invalid import file format');
                }
            } catch (error) {
                console.error('Error importing data:', error);
                this.showError('Failed to import data: ' + error.message);
            }
            
            // Clear file input
            fileInput.value = '';
        };
    }

    async clearOldStorageData() {
        if (confirm('Clear data older than 30 days?')) {
            try {
                const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000);
                const allData = await chrome.storage.local.get(null);
                const keysToDelete = [];
                
                Object.entries(allData).forEach(([key, value]) => {
                    if (key.startsWith('wayback_') && value.timestamp && value.timestamp < cutoffTime) {
                        keysToDelete.push(key);
                    }
                });
                
                if (keysToDelete.length > 0) {
                    await chrome.storage.local.remove(keysToDelete);
                    this.refreshStorageStats();
                    this.showToast(`Deleted ${keysToDelete.length} old domain entries`);
                } else {
                    this.showToast('No old data found to delete');
                }
            } catch (error) {
                console.error('Error clearing old data:', error);
                this.showError('Failed to clear old data');
            }
        }
    }

    async clearAllStorageData() {
        if (confirm('Clear ALL storage data? This cannot be undone!')) {
            try {
                const allData = await chrome.storage.local.get(null);
                const waybackKeys = Object.keys(allData).filter(key => key.startsWith('wayback_'));
                
                if (waybackKeys.length > 0) {
                    await chrome.storage.local.remove(waybackKeys);
                }
                
                // Clear current data
                this.allUrls = [];
                this.filteredUrls = [];
                this.urlList.innerHTML = `
                    <div class="empty-state">
                        <p>No URLs extracted yet</p>
                        <p>Enter a domain above to get started</p>
                    </div>
                `;
                this.stats.style.display = 'none';
                
                this.refreshStorageStats();
                this.showToast('All storage data cleared');
            } catch (error) {
                console.error('Error clearing all storage:', error);
                this.showError('Failed to clear all storage');
            }
        }
    }

    // Advanced Filter Methods
    
    syncExtensionInputToCheckboxes(inputValue) {
        const extensions = inputValue.split(',').map(ext => ext.trim().replace(/^\./, '').toLowerCase()).filter(ext => ext);
        
        // Clear current extension filters
        this.activeFilters.extensions.clear();
        
        // Update checkboxes to match input
        document.querySelectorAll('#extensionFilters input[type="checkbox"]').forEach(checkbox => {
            const shouldBeChecked = extensions.includes(checkbox.value.toLowerCase());
            checkbox.checked = shouldBeChecked;
            if (shouldBeChecked) {
                this.activeFilters.extensions.add(checkbox.value);
            }
        });
        
        // Apply filters immediately
        this.applyFilters();
    }
    
    syncStatusInputToCheckboxes(inputValue) {
        const statusCodes = inputValue.split(',').map(code => parseInt(code.trim())).filter(code => !isNaN(code));
        
        // Clear current status filters
        this.activeFilters.statusCodes.clear();
        
        // Update checkboxes to match input
        document.querySelectorAll('#statusFilters input[type="checkbox"]').forEach(checkbox => {
            const statusCode = parseInt(checkbox.value);
            const shouldBeChecked = statusCodes.includes(statusCode);
            checkbox.checked = shouldBeChecked;
            if (shouldBeChecked) {
                this.activeFilters.statusCodes.add(statusCode);
            }
        });
        
        // Apply filters immediately
        this.applyFilters();
    }

    toggleSecurityPresets() {
        const presets = document.getElementById('securityPresets');
        const button = document.getElementById('presetFilters');
        
        if (presets.style.display === 'none' || presets.style.display === '') {
            presets.style.display = 'block';
            button.textContent = 'Security Presets ▲';
            
            // Bind preset button events when showing
            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.applySecurityPreset(btn.dataset.preset);
                });
            });
        } else {
            presets.style.display = 'none';
            button.textContent = 'Security Presets ▼';
        }
    }

    applySecurityPreset(preset) {
        const presets = {
            admin: {
                urlPattern: '/admin.*|/administrator.*|/wp-admin.*|/control.*|/manage.*|/dashboard.*',
                extensions: ['php', 'asp', 'aspx'],
                description: 'Admin panels and management interfaces'
            },
            api: {
                urlPattern: '/api/.*|/v[0-9]+/.*|\\.json$|/rest/.*|/graphql.*',
                extensions: ['json', 'xml'],
                description: 'API endpoints and data services'
            },
            config: {
                urlPattern: '\\.config$|\\.conf$|\\.ini$|\\.env$|\\.yml$|\\.yaml$|web\\.config|htaccess',
                extensions: ['config', 'conf', 'ini', 'env', 'yml', 'yaml'],
                description: 'Configuration and settings files'
            },
            backups: {
                urlPattern: 'backup.*|.*\\.bak$|.*\\.backup$|.*\\.old$|.*\\.tmp$|\\.sql$',
                extensions: ['bak', 'backup', 'old', 'tmp', 'sql'],
                description: 'Backup and temporary files'
            },
            php: {
                extensions: ['php', 'php3', 'php4', 'php5', 'phtml'],
                statusCodes: ['200'],
                description: 'PHP files with successful responses'
            },
            errors: {
                statusCodes: ['404', '500', '403', '401'],
                description: 'Error pages and restricted content'
            }
        };

        const config = presets[preset];
        if (config) {
            // Clear all inputs first
            document.getElementById('extensionInput').value = '';
            document.getElementById('statusInput').value = '';
            document.getElementById('patternFilter').value = '';
            
            // Set filter inputs
            if (config.extensions) {
                document.getElementById('extensionInput').value = config.extensions.join(',');
            }
            if (config.statusCodes) {
                document.getElementById('statusInput').value = config.statusCodes.join(',');
            }
            if (config.urlPattern) {
                document.getElementById('patternFilter').value = config.urlPattern;
            }

            this.showToast(`Applied ${preset} preset: ${config.description}`);
            
            // Hide presets menu
            this.toggleSecurityPresets();
        }
    }

    async applyAdvancedFilters() {
        console.log('Apply advanced filters called');
        
        // Sync input fields to active filters
        this.syncAllFilters();
        
        // Apply unified filtering
        this.applyFilters();
        
        // Switch to results tab
        this.switchTab('results');
    }



    clearAdvancedFilters() {
        try {
            // Use helper method to reset UI
            this.resetFilterUI();
            
            // Reset display to all URLs
            if (this.allUrls && this.allUrls.length > 0) {
                this.displayUrls(this.allUrls);
            }
            
            this.showToast('All filters cleared');
        } catch (error) {
            this.handleFilterError(error, 'clearing filters');
        }
    }
    
    // Method to sync all filter states
    syncAllFilters() {
        // Sync extension input with checkboxes
        const extensionInput = document.getElementById('extensionInput');
        if (extensionInput && extensionInput.value) {
            this.syncExtensionInputToCheckboxes(extensionInput.value);
        }
        
        // Sync status input with checkboxes
        const statusInput = document.getElementById('statusInput');
        if (statusInput && statusInput.value) {
            this.syncStatusInputToCheckboxes(statusInput.value);
        }
        
        // Sync pattern filter
        const patternInput = document.getElementById('patternFilter');
        if (patternInput) {
            this.activeFilters.pattern = patternInput.value;
        }
    }
    
    // Method to reset all filter UI elements
    resetFilterUI() {
        // Reset input fields
        const inputs = ['extensionInput', 'statusInput', 'patternFilter', 'fromDate', 'toDate'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
        
        // Reset checkboxes
        document.querySelectorAll('#extensionFilters input, #statusFilters input').forEach(input => {
            input.checked = false;
        });
        
        // Reset search
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        
        // Reset active filters
        this.activeFilters.extensions.clear();
        this.activeFilters.statusCodes.clear();
        this.activeFilters.pattern = '';
    }
    
    // Enhanced error handling for filtering
    handleFilterError(error, context = 'filtering') {
        console.error(`Filter error in ${context}:`, error);
        
        let message = `Error during ${context}: `;
        if (error.message) {
            message += error.message;
        } else {
            message += 'Unknown error occurred';
        }
        
        this.showError(message);
    }
}

// Listen for background script progress updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
        if (window.waybackPopup) {
            window.waybackPopup.updateProgress(message.percent, message.text);
        }
    }
});

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.waybackPopup = new WaybackPopup();
});