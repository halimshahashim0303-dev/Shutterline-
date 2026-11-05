# Glow Studio: free AI photo retouching for iPhone and iPad

An AI portrait editor that runs entirely on your device. There's no Mac, no App Store, no $99 developer fee and no subscription. You install it from Safari with **Add to Home Screen**, and it then opens full-screen like a normal app and works offline.

## What it does

| Tab | Tools |
|---|---|
| **Retouch** | Auto retouch, smooth skin (keeps pore texture), remove blemishes, reduce shine, dark circles, brighten eyes, whiten teeth, heal brush (tap a spot) |
| **Reshape** | Slim face, enlarge eyes, narrow nose (up to 3 faces) |
| **Adjust** | Auto tone, exposure, contrast, highlights, shadows, temperature, tint, vibrance, saturation, clarity, sharpen, fade, vignette, grain |
| **Backdrop** | Portrait blur, remove background (transparent PNG), solid-colour background |
| **Looks** | 10 built-in colour looks, save your own, apply settings to every photo in a batch |

You can also hold the compare button (◐) to see the original, undo and redo, export at full size (up to 4096 px), and save to Photos through the share sheet.

## Put it on your iPhone or iPad for free (about 10 minutes)

### Option A: GitHub Pages (free and permanent)
1. Create a free account at **github.com**.
2. Click **+** → **New repository**, name it `glow-studio`, choose **Public**, then **Create repository**.
3. Click **uploading an existing file**. Drag in everything that is *inside* the `glow-studio` folder (`index.html`, `sw.js`, `manifest.webmanifest`, `README.md`, and the `css`, `js` and `icons` folders), then click **Commit changes**.
   `index.html` must end up at the top level of the repository, not inside another folder.
4. Open **Settings** → **Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then **main** and **/ (root)**, and click **Save**. Wait 1–2 minutes.
5. Your app is now at `https://YOUR-USERNAME.github.io/glow-studio/`
6. On your iPhone or iPad, open that link in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.
7. Open it once while online so the AI models (about 20 MB) download. After that it works offline.

### Option B: Netlify Drop (fastest)
Go to **app.netlify.com/drop**, drag the `glow-studio` folder onto the page, and create a free account so the link doesn't expire. Then follow step 6 above.

### Try it on your computer first
From the folder that contains `glow-studio`:

```bash
python -m http.server 8765 --directory glow-studio
```

Then open http://localhost:8765 in Chrome, Edge or Safari.

## How to use it
1. Tap **Choose photos** and pick one or more photos.
2. **Retouch** → **Auto retouch**, then fine-tune the sliders. Tap the number next to a slider to reset it.
3. **Heal brush**: tap each spot you want removed. Pinch to zoom in for precision, and drag to move while zoomed.
4. **Export** → **Export** → **Save to Photos** → choose **Save Image** in the share sheet.
5. For a batch: edit one photo, go to **Looks** → **Apply to all N photos**, then **Export** and tick **Export all**.

## Privacy
Photos never leave your device. All processing happens in Safari on your phone or tablet. The only downloads are the app files and Google's open-source MediaPipe AI models, which come from `cdn.jsdelivr.net` and `storage.googleapis.com`.

## Limits
- Needs iOS or iPadOS 15 or newer (WebGL 2).
- Exports are capped at 4096 px on the long side (about 12 MP). Larger 24 MP and 48 MP photos are scaled down to fit iPhone memory limits.
- The retouching is automatic and rule-based, so very strong settings can look airbrushed. Values around 30–60 look natural.
- There's no body reshaping, glasses-glare removal or wrinkle-specific tool yet.

## Why not a "real" iOS app?
A native iOS app has to be built with Xcode, which only runs on a Mac. An app installed with a free Apple ID stops opening after 7 days, and the App Store requires the $99/year Apple Developer Program. This web app avoids all three.

## Files
- `index.html`, `css/style.css`: the layout (phone layout with bottom tabs, iPad and desktop layout with a side panel)
- `js/main.js`: app logic (photos, undo/redo, tools, export)
- `js/renderer.js`, `js/shaders.js`, `js/gl.js`: the WebGL engine that does the retouching and colour work
- `js/ai.js`, `js/face.js`: face landmarks, skin and person segmentation, and face reshaping
- `js/ui.js`, `js/params.js`: the tool panels, sliders and looks
- `js/viewer.js`: pinch-zoom, pan and taps
- `js/exporter.js`: full-size export and saving
- `sw.js`, `manifest.webmanifest`, `icons/`: offline mode and the home-screen app
