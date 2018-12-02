# Creating a GNOME Shell Extension: Part One

GNOME Shell extensions are pretty easy to write, but a lot of the documentation available is outdated, scattered or just down-right unhelpful. It's pretty common for new authors to use an existing extension as a starting point, but that doesn't always work out well either.

As of this writing, the latest Ubuntu LTS is 18.04 shipping with `gnome-shell 3.28` and `gjs 1.52`, so that's what we'll restrict ourselves to. Users of Fedora and other distributions will also often hang back one release and experience has taught me this is a fair line to draw.

This is a groundup, no-frills overview of what you need to know to get started. We're going to use modern JavaScript, a text editor, a terminal and `zip`/`unzip`. No fancy tools, template generators, linters or TypeScript. You can learn about those things later when you have a use for them.

## Table of Contents

1. [Basic Overview](#basic-overview)
   * [`metadata.json`](#metadatajson)
   * [`extension.js`](#extensionjs)
   * [`prefs.js`](#prefsjs)
   * [`stylesheet.css`](#stylesheetcss)
   
## Basic Overview

**What is an extension?**

GNOME Shell's UI is written in GJS, which is JavaScript bindings for the GNOME C APIs. This includes libraries like Gtk, GLib/Gio, GStreamer and many others. Just like how PyGObject is Python bindings.

Extensions are patches that are applied to GNOME Shell when they are enabled, and reverted when they are disabled. The only real difference between a patch accepted in GNOME Shell's repository and an extension is when it is applied.

So to be perfectly clear, extensions don't run *inside* GNOME Shell or "plug-in" to GNOME Shell; they are GNOME Shell.

**Right, but what *is* an extension?**

Whether you're downloading from a Github or GitLab page, or installing from extensions.gnome.org, an extension is a Zip file with only two required files: `metadata.json` and `extension.js`. No compiling, no signing, no Zip-aligning; just a Zip file.

### `metadata.json`

This file contains basic information about the extension including its name, a description, version and a few other things. Below is the file we'll be using:

```js
{
    "extension-id": "demo",
    "uuid": "demo@andyholmes.github.io",
    "name": "Demo",
    "description": "This extension puts an icon in the panel with a simple dropdown menu.",
    "version": 1,
    "shell-version": [ "3.28", "3.30" ],
    "url": "https://github.com/andyholmes/gnome-shell-extension-demo"
}
```

These fields should be pretty self-explanatory. `extension-id` and `uuid` **must** be unique, `version` **must** be a whole number (not a string!) and `shell-version` **must** contain at least one `gnome-shell` version. Once installed, your extensions files will be in a folder with the same name as `uuid`:

    ~/.local/share/gnome-shell/extensions/demo@andyholmes.github.io/

### `extension.js`

This is the core of your extension.

```js
// Always have this as the first line of your file. Google for an explanation.
'use strict';

// This is a handy import we'll use to grab our extension's object...
const ExtensionUtils = imports.misc.extensionUtils;
// ...like this!
const Me = ExtensionUtils.getCurrentExtension();


// This function is called once when your extension is loaded, not enabled. This
// is a good time to setup translations or anything else you only do once, but
// doesn't modify GNOME Shell's code in any way.
init() {
}

// This function could be called after your extension is installed, enabled
// GNOME Tweaks, when you log in or when the screen is unlocked.
//
// This is when you setup any UI for your extension, change existing widgets or
// modify GNOME Shell's behaviour.
enabled() {
}

// This function could be called after your extension is uninstalled, disabled
// in GNOME Tweaks, when you log out or when the screen locks.
//
// Anything you created, modifed or setup in enable() MUST be undone here. Not
// doing so is one of the few ways to have you extension rejected during review!
disable() {
}
```

--------------------------------------------------------------------------------
### `prefs.js`

### `stylesheet.css`
