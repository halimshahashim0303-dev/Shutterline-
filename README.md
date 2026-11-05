# Shutterline: free AI photo retouching for iPhone and iPad

**Open the app: https://halimshahashim0303-dev.github.io/Shutterline-/**

An AI portrait editor that runs entirely on your device. There's no App Store, no subscription, and your photos are never uploaded. You install it from Safari, and it then opens full-screen like a normal app and works offline.

## Install it on your iPhone or iPad
1. Open **https://halimshahashim0303-dev.github.io/Shutterline-/** in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open Shutterline from your home screen once while you're online, so the AI models (about 20 MB) can download. After that it works offline too.

## What it does

| Tab | Tools |
|---|---|
| **Retouch** | Auto retouch, smooth skin (keeps pore texture), remove blemishes, reduce shine, dark circles, brighten eyes, whiten teeth, heal brush (tap a spot) |
| **Reshape** | Slim face, enlarge eyes, narrow nose (up to 3 faces) |
| **Adjust** | Auto tone, exposure, contrast, highlights, shadows, temperature, tint, vibrance, saturation, clarity, sharpen, fade, vignette, grain |
| **Backdrop** | Portrait blur, remove background (transparent PNG), solid-colour background |
| **Looks** | 10 built-in colour looks, save your own, apply settings to every photo in a batch |

You can also hold the compare button (◐) to see the original, undo and redo, export at full size (up to 4096 px), and save to Photos through the share sheet.

## How to use it
1. Tap **Choose photos** and pick one or more photos.
2. **Retouch** → **Auto retouch**, then fine-tune the sliders. Tap the number next to a slider to reset it.
3. **Heal brush**: tap each spot you want removed. Pinch to zoom in for precision, and drag to move while zoomed.
4. **Export** → **Export** → **Save to Photos** → choose **Save Image** in the share sheet.
5. For a batch: edit one photo, go to **Looks** → **Apply to all N photos**, then **Export** and tick **Export all**.

## Updating the app
Anything pushed to the `main` branch of this repository goes live within a minute or two. The installed app picks up the new version the next time it's opened while online.

## Run it on a computer
From this repository's folder:

```bash
python -m http.server 8765
```

Then open http://localhost:8765 in Chrome, Edge or Safari.

## Privacy
Photos never leave your device. All processing happens in Safari on your phone or tablet. The only downloads are the app files and Google's open-source MediaPipe AI models, which come from `cdn.jsdelivr.net` and `storage.googleapis.com`.

## Limits
- Needs iOS or iPadOS 15 or newer (WebGL 2).
- Exports are capped at 4096 px on the long side (about 12 MP). Larger 24 MP and 48 MP photos are scaled down to fit iPhone memory limits.
- The retouching is automatic and rule-based, so very strong settings can look airbrushed. Values around 30–60 look natural.
- There's no body reshaping, glasses-glare removal or wrinkle-specific tool yet.

## Files
- `index.html`, `css/style.css`: the layout (phone layout with bottom tabs, iPad and desktop layout with a side panel)
- `js/main.js`: app logic (photos, undo/redo, tools, export)
- `js/renderer.js`, `js/shaders.js`, `js/gl.js`: the WebGL engine that does the retouching and colour work
- `js/ai.js`, `js/face.js`: face landmarks, skin and person segmentation, and face reshaping
- `js/ui.js`, `js/params.js`: the tool panels, sliders and looks
- `js/viewer.js`: pinch-zoom, pan and taps
- `js/exporter.js`: full-size export and saving
- `sw.js`, `manifest.webmanifest`, `icons/`: offline mode and the home-screen app
