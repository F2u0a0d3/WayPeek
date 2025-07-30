class StorageManager {
    static async storeUrls(domain, urls) {
        try {
            const key = `wayback_${domain}`;
            const data = {
                domain: domain,
                urls: urls,
                timestamp: Date.now(),
                count: urls.length
            };
            
            // Store using Chrome storage API
            await chrome.storage.local.set({ [key]: data });
            
            // Update metadata
            await this.updateMetadata(domain, urls.length);
            
            return true;
        } catch (error) {
            console.error('Error storing URLs:', error);
            throw error;
        }
    }

    static async getUrls(domain) {
        try {
            const key = `wayback_${domain}`;
            const result = await chrome.storage.local.get(key);
            
            if (result[key]) {
                return result[key].urls || [];
            }
            
            return [];
        } catch (error) {
            console.error('Error retrieving URLs:', error);
            throw error;
        }
    }

    static async getDomainData(domain) {
        try {
            const key = `wayback_${domain}`;
            const result = await chrome.storage.local.get(key);
            
            return result[key] || null;
        } catch (error) {
            console.error('Error retrieving domain data:', error);
            throw error;
        }
    }

    static async getAllDomains() {
        try {
            const metadata = await this.getMetadata();
            return Object.keys(metadata.domains || {});
        } catch (error) {
            console.error('Error retrieving domains:', error);
            return [];
        }
    }

    static async deleteDomain(domain) {
        try {
            const key = `wayback_${domain}`;
            await chrome.storage.local.remove(key);
            
            // Update metadata
            const metadata = await this.getMetadata();
            if (metadata.domains && metadata.domains[domain]) {
                delete metadata.domains[domain];
                await chrome.storage.local.set({ 'wayback_metadata': metadata });
            }
            
            return true;
        } catch (error) {
            console.error('Error deleting domain:', error);
            throw error;
        }
    }

    static async clearAll() {
        try {
            // Get all storage keys
            const allData = await chrome.storage.local.get(null);
            const waybackKeys = Object.keys(allData).filter(key => key.startsWith('wayback_'));
            
            // Remove all wayback-related data
            await chrome.storage.local.remove(waybackKeys);
            
            return true;
        } catch (error) {
            console.error('Error clearing all data:', error);
            throw error;
        }
    }

    static async getStorageUsage() {
        try {
            const usage = await chrome.storage.local.getBytesInUse();
            return {
                used: usage,
                quota: chrome.storage.local.QUOTA_BYTES || 5242880, // 5MB default
                percentage: Math.round((usage / (chrome.storage.local.QUOTA_BYTES || 5242880)) * 100)
            };
        } catch (error) {
            console.error('Error getting storage usage:', error);
            return { used: 0, quota: 5242880, percentage: 0 };
        }
    }

    static async updateMetadata(domain, urlCount) {
        try {
            const metadata = await this.getMetadata();
            
            metadata.domains = metadata.domains || {};
            metadata.domains[domain] = {
                urlCount: urlCount,
                lastUpdated: Date.now()
            };
            
            metadata.totalDomains = Object.keys(metadata.domains).length;
            metadata.totalUrls = Object.values(metadata.domains).reduce((sum, d) => sum + d.urlCount, 0);
            
            await chrome.storage.local.set({ 'wayback_metadata': metadata });
        } catch (error) {
            console.error('Error updating metadata:', error);
        }
    }

    static async getMetadata() {
        try {
            const result = await chrome.storage.local.get('wayback_metadata');
            return result.wayback_metadata || {
                version: '1.0.0',
                created: Date.now(),
                domains: {},
                totalDomains: 0,
                totalUrls: 0
            };
        } catch (error) {
            console.error('Error getting metadata:', error);
            return {
                version: '1.0.0',
                created: Date.now(),
                domains: {},
                totalDomains: 0,
                totalUrls: 0
            };
        }
    }

    static async exportDomainData(domain, format = 'json') {
        try {
            const data = await this.getDomainData(domain);
            if (!data) {
                throw new Error('No data found for domain');
            }

            switch (format.toLowerCase()) {
                case 'json':
                    return JSON.stringify(data, null, 2);
                
                case 'txt':
                    return data.urls.map(url => url.url).join('\n');
                
                case 'csv':
                    const headers = 'URL,Status Code,Timestamp\n';
                    const rows = data.urls.map(url => 
                        `"${url.url.replace(/"/g, '""')}",${url.statuscode},"${url.timestamp}"`
                    ).join('\n');
                    return headers + rows;
                
                default:
                    throw new Error('Unsupported export format');
            }
        } catch (error) {
            console.error('Error exporting domain data:', error);
            throw error;
        }
    }

    static async importDomainData(domain, data, format = 'json') {
        try {
            let urls = [];

            switch (format.toLowerCase()) {
                case 'json':
                    const parsed = JSON.parse(data);
                    urls = parsed.urls || parsed; // Handle both wrapped and raw arrays
                    break;
                
                case 'txt':
                    urls = data.split('\n')
                        .filter(line => line.trim())
                        .map(url => ({
                            url: url.trim(),
                            statuscode: 200,
                            timestamp: new Date().toISOString()
                        }));
                    break;
                
                case 'csv':
                    const lines = data.split('\n');
                    const hasHeader = lines[0] && lines[0].toLowerCase().includes('url');
                    const startIndex = hasHeader ? 1 : 0;
                    
                    urls = lines.slice(startIndex)
                        .filter(line => line.trim())
                        .map(line => {
                            const [url, statuscode, timestamp] = this.parseCSVLine(line);
                            return {
                                url: url || '',
                                statuscode: parseInt(statuscode) || 200,
                                timestamp: timestamp || new Date().toISOString()
                            };
                        })
                        .filter(url => url.url);
                    break;
                
                default:
                    throw new Error('Unsupported import format');
            }

            // Validate URLs
            urls = urls.filter(urlData => {
                try {
                    new URL(urlData.url);
                    return true;
                } catch {
                    return false;
                }
            });

            if (urls.length === 0) {
                throw new Error('No valid URLs found in import data');
            }

            await this.storeUrls(domain, urls);
            return urls.length;
            
        } catch (error) {
            console.error('Error importing domain data:', error);
            throw error;
        }
    }

    static parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    static async cleanupOldData(daysOld = 30) {
        try {
            const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
            const allData = await chrome.storage.local.get(null);
            const keysToDelete = [];
            
            Object.entries(allData).forEach(([key, value]) => {
                if (key.startsWith('wayback_') && key !== 'wayback_metadata') {
                    if (value.timestamp && value.timestamp < cutoffTime) {
                        keysToDelete.push(key);
                    }
                }
            });
            
            if (keysToDelete.length > 0) {
                await chrome.storage.local.remove(keysToDelete);
                
                // Update metadata
                const metadata = await this.getMetadata();
                keysToDelete.forEach(key => {
                    const domain = key.replace('wayback_', '');
                    if (metadata.domains && metadata.domains[domain]) {
                        delete metadata.domains[domain];
                    }
                });
                
                metadata.totalDomains = Object.keys(metadata.domains).length;
                metadata.totalUrls = Object.values(metadata.domains).reduce((sum, d) => sum + d.urlCount, 0);
                
                await chrome.storage.local.set({ 'wayback_metadata': metadata });
            }
            
            return keysToDelete.length;
        } catch (error) {
            console.error('Error cleaning up old data:', error);
            throw error;
        }
    }

    static async searchUrls(domain, searchTerm, options = {}) {
        try {
            const urls = await this.getUrls(domain);
            const term = searchTerm.toLowerCase();
            
            let filtered = urls.filter(urlData => {
                const url = urlData.url.toLowerCase();
                return url.includes(term);
            });
            
            // Apply additional filters
            if (options.extensions && options.extensions.length > 0) {
                filtered = filtered.filter(urlData => {
                    const ext = this.getFileExtension(urlData.url);
                    return ext && options.extensions.includes(ext);
                });
            }
            
            if (options.statusCodes && options.statusCodes.length > 0) {
                filtered = filtered.filter(urlData => 
                    options.statusCodes.includes(urlData.statuscode)
                );
            }
            
            // Sort by relevance (exact matches first)
            filtered.sort((a, b) => {
                const aExact = a.url.toLowerCase().includes(term);
                const bExact = b.url.toLowerCase().includes(term);
                
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                return a.url.localeCompare(b.url);
            });
            
            return filtered;
        } catch (error) {
            console.error('Error searching URLs:', error);
            throw error;
        }
    }

    static getFileExtension(url) {
        const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
        return match ? match[1].toLowerCase() : null;
    }
}

// Make StorageManager available globally
if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
} else if (typeof global !== 'undefined') {
    global.StorageManager = StorageManager;
}