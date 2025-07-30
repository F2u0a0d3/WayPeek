# WayPeek

A powerful browser extension for extracting historical URLs from the Wayback Machine, designed for security researchers, bug bounty hunters, and penetration testers.

## Features

- **Domain URL Extraction**: Fetch all archived URLs for any domain from the Wayback Machine
- **Local Storage**: Store retrieved URLs locally for offline access
- **Advanced Filtering**: Filter by file extensions, status codes, URL patterns, and date ranges
- **Security Presets**: Quick filters for admin panels, API endpoints, config files, and more
- **Storage Management**: View extraction history, manage stored domains, and track usage
- **Export Options**: Export to TXT, JSON, or CSV formats
- **Real-time Search**: Search through extracted URLs instantly
- **Progress Tracking**: Visual progress indicators during extraction
- **Cross-browser Support**: Works on Chrome and Firefox

## Installation

### Chrome (Manifest V3)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `wayback-extension` folder
5. The extension icon should appear in your toolbar

### Firefox (Manifest V2)
1. Download or clone this repository
2. Rename `manifest-firefox.json` to `manifest.json` (backup the original first)
3. Open Firefox and go to `about:debugging`
4. Click "This Firefox" in the sidebar
5. Click "Load Temporary Add-on" and select the `manifest.json` file

## Usage

### Basic URL Extraction
1. Click the extension icon in your browser toolbar
2. Enter a domain name (e.g., `example.com`)
3. Configure extraction options:
   - **Remove WWW**: Strip www prefixes automatically
   - **Include Subdomains**: Extract URLs from all subdomains
   - **Fast Mode**: Limit to 10,000 URLs for faster processing
4. Click "Extract URLs" to fetch historical data
5. View results in the Results tab

### Interface Tabs
- **Results**: View extracted URLs with search and filtering
- **Filters**: Advanced filtering options and security presets
- **Export**: Export data in various formats and manage current data
- **Storage**: View extraction history and manage stored domains

### Filtering Options
- **Extensions**: Filter by file types (.php, .js, .pdf, etc.)
- **Status Codes**: Show only specific HTTP response codes
- **URL Patterns**: Use regex patterns to find specific URLs (e.g., `\.php$`, `admin|api|config`)
- **Date Range**: Filter by date range using YYYYMMDD format (e.g., 20200101 to 20231231)
- **Real-time Search**: Type in the search box to filter results
- **Security Presets**: Quick filters for common security targets:
  - Admin Panels: `/admin`, `/administrator`, `/wp-admin`
  - API Endpoints: `/api/`, `/v1/`, `.json`
  - Config Files: `.config`, `.ini`, `.env`, `.yml`
  - Backup Files: `.bak`, `.backup`, `.old`, `.tmp`
  - PHP Files: `.php`, `.php3`, `.phtml`
  - Error Pages: 404, 500, 403, 401 status codes

### Export Features
- **Plain Text**: Simple list of URLs
- **JSON**: Complete data with timestamps and status codes
- **CSV**: Spreadsheet-compatible format
- **Copy to Clipboard**: Quick copying for immediate use

### Storage Management
- **Search History**: View all previously extracted domains
- **Domain Management**: Load, export, or delete individual domain data
- **Storage Statistics**: Monitor storage usage and domain count
- **Data Import/Export**: Backup and restore all extension data
- **Automatic Cleanup**: Remove old data (30+ days) to save space

### Advanced Features
- **Current Tab Detection**: Auto-populate domain from active tab
- **Persistent Storage**: Data survives browser restarts
- **Duplicate Removal**: Automatic deduplication of URLs
- **Timestamp Tracking**: Track when URLs were last archived

## Security & Privacy

- **Local Storage Only**: All data is stored locally in your browser
- **No Data Transmission**: Extension doesn't send your data anywhere
- **Open Source**: Full source code available for review
- **Minimal Permissions**: Only requests necessary browser permissions

## Technical Details

### File Structure
```
wayback-extension/
├── manifest.json (Chrome v3)
├── manifest-firefox.json (Firefox v2)
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/
│   └── background.js
├── content/
│   └── content.js
├── utils/
│   └── storage.js
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Storage Format
URLs are stored in the browser's local storage with the following structure:
```json
{
  "domain": "example.com",
  "urls": [
    {
      "url": "https://example.com/page",
      "statuscode": 200,
      "timestamp": "2023-01-01T00:00:00Z"
    }
  ],
  "timestamp": 1672531200000,
  "count": 1
}
```

### API Integration
The extension uses the Wayback Machine's CDX API:
- Endpoint: `http://web.archive.org/cdx/search/cdx`
- Rate limiting: 1 request per second
- Retry logic: 3 attempts with exponential backoff
- Data processing: Deduplication and validation

## Configuration

### Extraction Options
- **Remove WWW**: Automatically strip www prefixes from domains
- **Include Subdomains**: Extract URLs from all subdomains (*.domain.com)
- **Fast Mode**: Limit extraction to 10,000 URLs for faster processing

### Filter Options
- **Client-side Filtering**: All filtering happens on locally stored data
- **Real-time Updates**: Filters apply as you type
- **Multiple Criteria**: Combine extensions, status codes, patterns, and date ranges
- **Regex Support**: Advanced pattern matching with regex expressions

### Storage Management
- **Storage Tab**: View usage statistics and extraction history
- **Individual Management**: Load, export, or delete specific domain data
- **Bulk Operations**: Export all data or clear all storage
- **Automatic Cleanup**: Remove data older than 30 days
- **Import/Export**: Backup and restore extension data as JSON

## Troubleshooting

### Common Issues

**No URLs Found**
- Verify domain spelling and format
- Check if domain has archived content on web.archive.org
- Try variations (with/without www, subdomains)

**Extension Not Loading**
- Ensure manifest.json permissions are correct
- Check browser console for error messages
- Verify all files are present and properly named

**API Rate Limiting**
- Extension automatically handles rate limits
- Large domains may take several minutes to process
- Progress bar shows current status

**Storage Full**
- Use export feature to backup data
- Clear old domain data from Storage tab
- Use "Clear Old Data (30+ days)" feature
- Browser storage quota is typically 5MB

**Filtering Not Working**
- Ensure URLs are extracted first before applying filters
- Check regex patterns for syntax errors
- Try simpler patterns if complex regex fails
- Use "Clear All" to reset filters

### Support
- Check browser console for error messages
- Ensure you're using the correct manifest version for your browser
- Verify domain format (no http://, no paths, just domain.com)

## Development

### Building from Source
1. Clone the repository
2. Ensure all dependencies are included
3. For Chrome: Use `manifest.json`
4. For Firefox: Rename `manifest-firefox.json` to `manifest.json`
5. Load as unpacked extension

### Contributing
- Follow existing code style and structure
- Test on both Chrome and Firefox
- Ensure security best practices
- Update documentation for new features

## License

This extension is provided for educational and security research purposes. Use responsibly and in accordance with applicable laws and website terms of service.

## Version History

- **v1.0.0**: Initial release with core functionality
  - Domain URL extraction
  - Local storage and management
  - Filtering and export features
  - Cross-browser compatibility
