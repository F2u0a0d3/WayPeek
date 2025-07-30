// Content script for Wayback URLs Extractor
// This script runs on all web pages to get current domain

console.log('Wayback Extension content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentDomain') {
    try {
      const domain = window.location.hostname;
      sendResponse({ domain: domain });
    } catch (error) {
      console.error('Error getting current domain:', error);
      sendResponse({ error: error.message });
    }
  }
  
  return true; // Keep message channel open
});

// Optional: Send domain automatically when page loads
// (This can be used for auto-population)
document.addEventListener('DOMContentLoaded', () => {
  try {
    const domain = window.location.hostname;
    chrome.runtime.sendMessage({
      action: 'domainDetected',
      domain: domain
    }).catch(() => {
      // Extension might not be listening, ignore error
    });
  } catch (error) {
    console.log('Could not send domain to extension:', error);
  }
});