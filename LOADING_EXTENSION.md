# Loading Jobzippy in Chrome

## Quick Start

1. **Build the extension**:
   ```bash
   npm run build
   ```

2. **Open Chrome Extensions page**:
   - Navigate to `chrome://extensions/`
   - Or click the three dots menu → More Tools → Extensions

3. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the extension**:
   - Click "Load unpacked" button
   - Navigate to the `dist` folder in your Jobzippy project
   - Select the `dist` folder and click "Select"

5. **Verify installation**:
   - You should see "Jobzippy" in your extensions list
   - The status should show as "On"

6. **Open the side panel**:
   - Click the Jobzippy icon in your Chrome toolbar
   - Or right-click the icon and select "Open side panel"
   - The beautiful gradient UI should appear! 🎉

## Testing Content Scripts

1. **LinkedIn**: Navigate to https://www.linkedin.com/jobs
   - You should see a "Jobzippy Active" indicator briefly appear
   - Check the browser console (F12) for "[Jobzippy] LinkedIn content script loaded"

2. **Indeed**: Navigate to https://www.indeed.com
   - You should see a "Jobzippy Active" indicator briefly appear
   - Check the browser console for "[Jobzippy] Indeed content script loaded"

## Development Mode

For development with hot reload:

```bash
npm run dev
```

After each change:
1. The extension will rebuild automatically
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Jobzippy card
4. Reload any pages where content scripts are injected

## Troubleshooting

### Extension doesn't appear
- Make sure you selected the `dist` folder, not the project root
- Check for build errors with `npm run build`

### Side panel is blank
- Open DevTools on the side panel (right-click → Inspect)
- Check for console errors
- Verify the HTML file path in manifest.json

### Content scripts not working
- Check the host permissions in manifest.json
- Reload the webpage after installing/updating the extension
- Check browser console for errors

### Background service worker errors
- Go to `chrome://extensions/`
- Find Jobzippy and click "service worker" (next to "Inspect views")
- Check for errors in the console

## Next Steps

Once loaded successfully:
- The extension is ready for development!
- Continue to JZ-002 for the design system and UI components
- Check BACKLOG.md for the next story to implement

---

**Note**: Remember to rebuild (`npm run build`) and refresh the extension after making changes!

