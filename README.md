# Gmail Image Saver

<img src="icons/icon128.png" width="80" height="80" alt="Gmail Image Saver icon">

A small Manifest V3 Chrome extension that saves images from Gmail drafts and messages using the browser's context menu. It recognizes images underneath Gmail's image editing overlays, even when Chrome displays the page context menu instead of the image context menu.

[简体中文说明](README.zh-CN.md)

## Install

1. Download this repository using **Code → Download ZIP**, then extract it.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Wait for any draft changes to save, then refresh Gmail.
5. Right-click an image and choose **Save Gmail image…**, then select a save location.

After updating files, reload the extension on `chrome://extensions` and refresh Gmail again.

## Features

- Saves the original bytes returned by the image URL without screenshots, canvas conversion, or recompression.
- Handles Gmail's transparent image editing overlays.
- Opens Chrome's Save As dialog and avoids overwriting existing files.
- Uses browser UI language for the extension name, context menu, popup, and messages: English, Simplified Chinese, and Traditional Chinese. Other languages fall back to English.
- Includes transparent PNG icons at 16, 32, 48, and 128 pixels.
- Supports JPEG, PNG, GIF, WebP, BMP, AVIF, SVG, ICO, and TIFF, up to 24 MB.

If Gmail provides a thumbnail at the image URL, that thumbnail is what gets saved. This extension does not reconstruct higher-resolution files that the server does not provide.

## Privacy and permissions

- Content scripts run only on `https://mail.google.com/*`.
- The image is read only when the save menu is selected, using the existing Gmail session.
- No Gmail API keys, OAuth setup, passwords, telemetry, or third-party servers are used.
- Image URLs and image data are not persisted by the extension. Local filenames and download entries are managed by Chrome.
- No mailbox scanning, draft editing, or email sending.
- `contextMenus` adds the menu item; `downloads` starts the local file download.
- Repository fixtures are synthetic. No mailbox content, screenshots, signed attachment URLs, or user-specific configuration is included.

## Limitations and troubleshooting

- Chrome 109 or newer is required.
- Attachment cards and CSS background images are not supported.
- External images may fail when their server prevents cross-origin reads.
- If the menu is missing, enable the extension and refresh Gmail after installation.
- If the extension displays `!`, open its popup for an error message.
- Right-clicking an empty area shows a “no image found” message instead of saving the previously selected image.
- Use Chrome's Downloads list to check actual completion. Canceling Save As does not save a file.

## Development

No build step or runtime dependencies are required. With Node.js 22 or newer:

```sh
npm test
```

The 29 automated tests cover byte preservation, Gmail overlay selection, safe file names, response validation, locale catalogs, fallback behavior, popup text, and icon dimensions. Chrome API behavior is simulated; these tests do not replace installation and download testing in a real browser.

To regenerate the icons on Windows, run `scripts/generate-icons.ps1` in PowerShell. The script uses the built-in System.Drawing library.

Chrome documentation: [contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus), [downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads), [i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n), [icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons), and [content script network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).
