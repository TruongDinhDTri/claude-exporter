# 🔥 Claude Exporter v2

Export Claude.ai conversations to Markdown, Text, or JSON.

## Installation

1. **Download** and unzip this folder
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select this folder
6. Done! 🎉

## Usage

1. Open a conversation on [claude.ai](https://claude.ai)
2. Click the extension icon (pink circle in toolbar)
3. Choose format: **Markdown**, **Text**, or **JSON**
4. Click **Export & Download** or **Copy to Clipboard**
5. **Keep the popup open** while it works — clicking away closes the popup and cancels the export

## Full-history export

Claude.ai virtualizes long threads: messages are unmounted from the DOM once
they scroll out of view, and older turns are only fetched from the network as
you approach the top. Reading the page once can therefore only ever capture one
screenful.

With **Scroll to load full history** enabled (the default), the exporter climbs
to the very first message — waiting until height, message count and scroll
position all stop changing — then sweeps back down, harvesting and de-duplicating
each screen. A long conversation can take a few tens of seconds.

Uncheck it for an instant snapshot of whatever is currently rendered.

## Formats

### Markdown (.md)
Best for feeding into AI agents like Neriah or Ruach-El.

### Text (.txt)
Simple plain text format.

### JSON (.json)
Structured data with metadata.

## Troubleshooting

**"No messages found"**
- Make sure you're on a Claude.ai conversation page
- Try refreshing the page first

**Export is missing older messages**
- Make sure **Scroll to load full history** is checked
- Don't click outside the popup while it is scrolling
- Open DevTools on the Claude tab and look for `Claude Exporter — scroll stats:`
  in the console. `passes: 1` means the sweep never ran; a `scrollHeight` barely
  larger than `clientHeight` means the wrong element was picked as the scroller

**Extension not showing**
- Check that it's enabled in `chrome://extensions/`
- Click the puzzle icon in Chrome and pin the extension

## Running the tests

```
npm install
npm test
```

The suite drives the real `extractionScript` from `popup.js` against a
JSDOM thread that virtualizes like the live app: it mounts only the visible
turns and discovers the rest a few at a time, with the fetch landing a beat
after the scroll that asked for it. That lag is what made earlier builds
truncate the ending or drop a stretch out of the middle, so the tests assert
the full conversation comes back in order — not merely that some messages did.

---

Made with 💛 for Wiganz
