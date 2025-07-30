// Service Worker for Wayback URLs Extractor
// All event listeners MUST be registered at top level

console.log('Wayback Extension Service Worker loaded');

// Register message listener at top level (CRITICAL for Manifest V3)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
  if (request.action === 'fetchWayback') {
    handleWaybackRequest(request.url)
      .then(data => {
        console.log('Wayback data fetched:', data.length, 'entries');
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error('Wayback fetch error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
  
  return false; // Close message channel immediately
});

// Register installation listener at top level
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Wayback Extension installed:', details.reason);
});

// Main function to fetch Wayback Machine data
async function handleWaybackRequest(targetUrl) {
  try {
    console.log('Fetching from Wayback CDX API:', targetUrl);
    
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Wayback-Extension/1.0'
      }
    });
    
    if (!response.ok) {
      console.error(`CDX API error: HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    console.log('CDX API response length:', text.length, 'characters');
    
    // Log first part of response for debugging (but not too much to avoid spam)
    if (text.length > 0) {
      console.log('First 200 chars of response:', text.substring(0, 200));
    }
    
    // Handle both JSON and text responses from CDX API
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // CDX API sometimes returns newline-separated data
      const lines = text.trim().split('\n');
      data = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          // Handle space-separated format
          const parts = line.split(' ');
          return parts.length >= 3 ? parts : null;
        }
      }).filter(item => item !== null);
    }
    
    // Wayback CDX API returns array of arrays
    if (!Array.isArray(data) || data.length === 0) {
      console.log('No data returned from CDX API');
      return [];
    }
    
    console.log('Raw CDX response:', data.length, 'entries');
    return data;
    
  } catch (error) {
    console.error('Wayback API error:', error);
    throw new Error(`Failed to fetch Wayback data: ${error.message}`);
  }
}