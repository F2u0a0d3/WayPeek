class WaybackContentScript {
    constructor() {
        this.setupDomainExtraction();
        this.setupMessageListener();
    }

    setupDomainExtraction() {
        try {
            const currentDomain = this.extractDomainFromPage();
            if (currentDomain) {
                // Store current domain for popup to use
                chrome.storage.local.set({ 'currentDomain': currentDomain });
            }
        } catch (error) {
            console.error('Error extracting domain:', error);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'getCurrentDomain':
                    sendResponse({ domain: this.extractDomainFromPage() });
                    break;
                    
                case 'extractLinksFromPage':
                    sendResponse({ links: this.extractLinksFromPage() });
                    break;
                    
                case 'highlightUrls':
                    this.highlightUrlsOnPage(message.urls);
                    sendResponse({ success: true });
                    break;
                    
                case 'getPageMetadata':
                    sendResponse({ metadata: this.getPageMetadata() });
                    break;
            }
        });
    }

    extractDomainFromPage() {
        try {
            const url = new URL(window.location.href);
            let domain = url.hostname;
            
            // Remove www prefix if present
            domain = domain.replace(/^www\./, '');
            
            // Validate domain
            if (this.isValidDomain(domain)) {
                return domain;
            }
            
            return null;
        } catch (error) {
            console.error('Error parsing current URL:', error);
            return null;
        }
    }

    extractLinksFromPage() {
        const links = [];
        const seenUrls = new Set();
        
        try {
            // Extract from anchor tags
            document.querySelectorAll('a[href]').forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const absoluteUrl = this.resolveUrl(href);
                    if (absoluteUrl && !seenUrls.has(absoluteUrl)) {
                        seenUrls.add(absoluteUrl);
                        links.push({
                            url: absoluteUrl,
                            text: link.textContent.trim(),
                            title: link.title || '',
                            source: 'anchor'
                        });
                    }
                }
            });

            // Extract from form actions
            document.querySelectorAll('form[action]').forEach(form => {
                const action = form.getAttribute('action');
                if (action) {
                    const absoluteUrl = this.resolveUrl(action);
                    if (absoluteUrl && !seenUrls.has(absoluteUrl)) {
                        seenUrls.add(absoluteUrl);
                        links.push({
                            url: absoluteUrl,
                            text: 'Form action',
                            title: form.name || form.id || '',
                            source: 'form'
                        });
                    }
                }
            });

            // Extract from script src
            document.querySelectorAll('script[src]').forEach(script => {
                const src = script.getAttribute('src');
                if (src) {
                    const absoluteUrl = this.resolveUrl(src);
                    if (absoluteUrl && !seenUrls.has(absoluteUrl)) {
                        seenUrls.add(absoluteUrl);
                        links.push({
                            url: absoluteUrl,
                            text: 'Script',
                            title: '',
                            source: 'script'
                        });
                    }
                }
            });

            // Extract from link href (stylesheets, etc.)
            document.querySelectorAll('link[href]').forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const absoluteUrl = this.resolveUrl(href);
                    if (absoluteUrl && !seenUrls.has(absoluteUrl)) {
                        seenUrls.add(absoluteUrl);
                        links.push({
                            url: absoluteUrl,
                            text: `Link (${link.rel || 'unknown'})`,
                            title: '',
                            source: 'link'
                        });
                    }
                }
            });

            // Extract from img src
            document.querySelectorAll('img[src]').forEach(img => {
                const src = img.getAttribute('src');
                if (src) {
                    const absoluteUrl = this.resolveUrl(src);
                    if (absoluteUrl && !seenUrls.has(absoluteUrl)) {
                        seenUrls.add(absoluteUrl);
                        links.push({
                            url: absoluteUrl,
                            text: img.alt || 'Image',
                            title: img.title || '',
                            source: 'image'
                        });
                    }
                }
            });

        } catch (error) {
            console.error('Error extracting links from page:', error);
        }

        return links;
    }

    resolveUrl(url) {
        try {
            // Handle relative URLs
            if (url.startsWith('//')) {
                url = window.location.protocol + url;
            } else if (url.startsWith('/')) {
                url = window.location.origin + url;
            } else if (!url.includes('://')) {
                url = new URL(url, window.location.href).href;
            }

            // Validate URL
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return url;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    highlightUrlsOnPage(waybackUrls) {
        try {
            // Remove existing highlights
            this.removeHighlights();

            const urlSet = new Set(waybackUrls.map(u => u.url));
            
            // Highlight matching anchor tags
            document.querySelectorAll('a[href]').forEach(link => {
                const href = link.getAttribute('href');
                const absoluteUrl = this.resolveUrl(href);
                
                if (absoluteUrl && urlSet.has(absoluteUrl)) {
                    this.addHighlight(link, 'wayback-highlight-link');
                }
            });

            // Add CSS for highlights
            this.addHighlightStyles();
            
        } catch (error) {
            console.error('Error highlighting URLs:', error);
        }
    }

    addHighlight(element, className) {
        element.classList.add(className);
        
        // Add tooltip with Wayback info
        const tooltip = document.createElement('div');
        tooltip.className = 'wayback-tooltip';
        tooltip.textContent = 'Found in Wayback Machine';
        element.appendChild(tooltip);
    }

    removeHighlights() {
        document.querySelectorAll('.wayback-highlight-link').forEach(element => {
            element.classList.remove('wayback-highlight-link');
        });
        
        document.querySelectorAll('.wayback-tooltip').forEach(tooltip => {
            tooltip.remove();
        });
    }

    addHighlightStyles() {
        const existingStyle = document.getElementById('wayback-highlight-styles');
        if (existingStyle) return;

        const style = document.createElement('style');
        style.id = 'wayback-highlight-styles';
        style.textContent = `
            .wayback-highlight-link {
                position: relative;
                border: 2px solid #4CAF50 !important;
                background-color: rgba(76, 175, 80, 0.1) !important;
                border-radius: 2px !important;
            }
            
            .wayback-tooltip {
                position: absolute;
                top: -30px;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                white-space: nowrap;
                z-index: 10000;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s;
            }
            
            .wayback-highlight-link:hover .wayback-tooltip {
                opacity: 1;
            }
            
            .wayback-tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 5px solid transparent;
                border-top-color: #333;
            }
        `;
        
        document.head.appendChild(style);
    }

    getPageMetadata() {
        try {
            const metadata = {
                url: window.location.href,
                domain: this.extractDomainFromPage(),
                title: document.title,
                description: '',
                keywords: '',
                linkCount: document.querySelectorAll('a[href]').length,
                formCount: document.querySelectorAll('form').length,
                imageCount: document.querySelectorAll('img[src]').length,
                scriptCount: document.querySelectorAll('script[src]').length
            };

            // Extract meta description
            const descMeta = document.querySelector('meta[name="description"]');
            if (descMeta) {
                metadata.description = descMeta.getAttribute('content') || '';
            }

            // Extract meta keywords
            const keywordsMeta = document.querySelector('meta[name="keywords"]');
            if (keywordsMeta) {
                metadata.keywords = keywordsMeta.getAttribute('content') || '';
            }

            return metadata;
        } catch (error) {
            console.error('Error getting page metadata:', error);
            return {};
        }
    }

    isValidDomain(domain) {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        return domain && domainRegex.test(domain);
    }

    // Utility method to extract domains from URLs for analysis
    extractDomainsFromLinks() {
        const domains = new Set();
        const links = this.extractLinksFromPage();
        
        links.forEach(link => {
            try {
                const url = new URL(link.url);
                const domain = url.hostname.replace(/^www\./, '');
                if (this.isValidDomain(domain)) {
                    domains.add(domain);
                }
            } catch (error) {
                // Invalid URL, skip
            }
        });
        
        return Array.from(domains);
    }

    // Method to identify potentially interesting URLs on the page
    findInterestingUrls() {
        const links = this.extractLinksFromPage();
        const interesting = [];
        
        const interestingPatterns = [
            /admin/i,
            /login/i,
            /api/i,
            /config/i,
            /backup/i,
            /test/i,
            /debug/i,
            /\.env/i,
            /\.git/i,
            /\.sql/i,
            /\.xml/i,
            /\.json/i
        ];
        
        links.forEach(link => {
            const url = link.url.toLowerCase();
            if (interestingPatterns.some(pattern => pattern.test(url))) {
                interesting.push({
                    ...link,
                    reason: 'Matches security pattern'
                });
            }
        });
        
        return interesting;
    }
}

// Initialize content script
const waybackContent = new WaybackContentScript();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (waybackContent) {
        waybackContent.removeHighlights();
    }
});