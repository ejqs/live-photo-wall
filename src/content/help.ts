/** Help pages for the admin. Markdown, rendered with `marked`. Kept generic: no event-specific text. */
export type HelpPage = { slug: string; title: string; summary: string; body: string };

export const HELP: HelpPage[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "From an empty app to a wall playing photos.",
    body: `
1. **Name your event** on [Event settings](/admin/settings) and set when it ends. The end time starts the photo retention countdown.
2. **Upload the roster** on [Photos](/admin/photos). These are the photos you prepared. They go on the wall right away, no review.
3. **Make the design** on [Design](/admin/design): your title, any PNG overlays, your fonts and the guest QR. Publish when it looks right.
4. **Pick the motion** on [Motion & timing](/admin/motion). Start from a preset, then adjust.
5. **Add a wall** on [Walls](/admin/walls). Open the wall's link on the computer that drives the display, or type its key at \`/wall\`.
6. **Check the guest page** on [Guest page](/admin/guest), scan the QR with your phone, and send yourself a test photo.
7. **Add helpers** on [Team](/admin/team) as moderators so they can approve photos from their phones.

The day before, let every wall run for a while with the internet on. Each wall downloads all photos so it keeps playing if the venue Wi-Fi drops.
`,
  },
  {
    slug: "walls",
    title: "Setting up a wall",
    summary: "LED walls, screens, keys, full screen, offline play.",
    body: `
A wall is any browser in full screen. For an LED wall, that's the computer connected to the LED processor (usually over HDMI).

**Pairing.** On the wall computer, open \`/wall\` and type the wall's six-letter key, or open the link from the [Walls](/admin/walls) page directly. The key is remembered, so after a restart the wall opens itself again.

**Full screen.** Press **F**. In Chrome you can also install the wall as an app (the install icon in the address bar) so it opens without browser bars. Press **S** to show or hide the status badge.

**Any resolution.** The wall fills whatever size the browser window is. Set the grid (columns and rows) on Motion & timing, or override it for one wall on the Walls page. Positions in the design are relative, so the same design fits a 16:9 screen and a long LED strip.

**Offline.** Each wall keeps a copy of every photo, the design and fonts on its disk. If the internet drops, the wall keeps playing what it has; new guest photos arrive when it reconnects. The Walls page shows how many photos each wall has cached. Wait until it reaches the total before doors open.

**Primary wall.** One wall is the primary. New guest photos land there first, at a time the guest's phone counts down to.

**Stats window.** Open \`/wall/stats\` in a second window on the same computer to see what's coming up next, and to take a photo off the wall in a hurry.

**If something looks stuck**, use "Reload" on the Walls page. The wall also reloads itself if nothing has changed for three minutes.
`,
  },
  {
    slug: "photos",
    title: "Photos and approval",
    summary: "Roster, guest photos, approving, taking things down.",
    body: `
**Roster** photos are uploaded by the team and go on the wall immediately. Upload the same file twice and it is only stored once.

**Guest** photos arrive through the QR. They wait in the queue on [Photos](/admin/photos) (and on the Overview) until someone approves them. Moderators can approve from a phone.

- **Approve** puts the photo in rotation. On the primary wall it jumps the queue and the guest gets a countdown.
- **Reject** hides it. The guest isn't told it was rejected; their page just shows it as not on the wall.
- **Take off the wall** removes an approved photo without deleting it. You can put it back later.
- **Approve automatically** (on the Guest page settings) skips review. Only use it with a crowd you trust.

All photos are re-saved on the server without their metadata, so location data from phones is never kept.
`,
  },
  {
    slug: "design",
    title: "Design",
    summary: "Text, fonts, overlays and the QR on top of the photos.",
    body: `
The design editor shows a frozen grid of your photos with the layers on top. Drag a layer to move it; use the arrow keys to nudge it.

- **Text** layers can use the built-in fonts or a font you upload (.ttf, .otf, .woff, .woff2). Only upload fonts you're licensed to use.
- **Image** layers are PNG, SVG or WebP overlays: logos, frames, ribbons. A transparent PNG at the wall's size makes a full frame.
- **QR card** is the code guests scan. Make it big: about a fifth of the wall's height is readable from across a room.
- **Dim** darkens the photos so the text stays readable.

Sizes are a percent of the wall's height and positions a percent of its width and height, so one design fits any wall.

Your edits save as a draft. The walls only change when you press **Publish to walls**.
`,
  },
  {
    slug: "motion",
    title: "Motion and custom effects",
    summary: "Presets, sliders, and writing your own effect.",
    body: `
The built-in effect is **whiten and drop**: a photo fades to white, the cell empties for a moment, then the new photo drops in with a slight tilt and settles.

**Timing** decides how often a swap starts, how many cells can change at once, and the least time a photo stays up. **The swap** sliders shape the effect itself. Presets are starting points.

**Custom effects** are small JSON files in the \`wallmotion/1\` format. They describe what happens inside one cell during a swap. They can't run code, so a bad file can't break a wall: the editor checks it as you type, and a wall that gets a broken effect falls back to the built-in one.

To write one with an AI assistant, press **Copy AI instructions** on the Effect code tab, paste it into the assistant, and describe the feel you want. Paste the result back as a new effect. If the editor shows an error, send the error message to the assistant.

The full instructions are below for reference.
`,
  },
  {
    slug: "after-the-event",
    title: "After the event",
    summary: "Download everything, the video, retention.",
    body: `
On the [Overview](/admin):

- **Download all photos** makes a zip of full-size photos in folders, with a captions.csv. The link lasts 7 days.
- **Download the wall as a video** renders an MP4 of the wall playing your photos, frame by frame on the server. It needs the worker service (see the README). Rendering takes a while; you can leave the page.

Close uploads on the [Guest page](/admin/guest) settings when you're done. The landing page switches to its after-the-event text at the end time.

**Retention.** Guest photo files are deleted the number of days after the event set on [Event settings](/admin/settings). Download the zip before then.
`,
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary: "Common problems at the venue.",
    body: `
**The wall shows "Waiting for a connection".** It has never been online with this key. Connect it once; after that it can play offline.

**Photos stutter on the wall.** Lower the number of columns and rows, or the most photos changing at once. Close other programs on the wall computer. Make sure hardware acceleration is on in the browser.

**The QR doesn't scan.** Make it bigger in the design, keep the dark-on-light style, and check there's no glare. Print table cards from the Overview as a backup.

**A guest says their photo isn't showing.** Check the queue on Photos. If it's approved, it's in rotation; with many photos it can take a while to come around. The primary wall shows new photos first.

**The screen goes to sleep.** The wall asks the browser to keep the screen on (the status badge shows "awake"). Also turn off sleep in the computer's power settings.

**Something needs to come down right now.** Open \`/wall/stats\` on the wall computer, find the photo and remove it. Or take it off the wall from Photos on any phone.
`,
  },
];
