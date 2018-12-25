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

JavaScript is a prototype-based language, which for us means that we can "monkey-patch" existing code *while* it is running. For example, you could override the [`addMenuItem()`](https://gitlab.gnome.org/GNOME/gnome-shell/blob/3.28.3/js/ui/popupMenu.js#L639) function of the `PopupMenu` class and *all* existing or newly created `PopupMenu` classes will then use your override.

Extensions are patches that are applied to GNOME Shell when they are enabled, and reverted when they are disabled. The only real difference between code changes accepted into GNOME Shell and an extension is when the patch is applied.

**What does an extension look like?**

Whether you're downloading from Github, GitLab page or installing from extensions.gnome.org, an extension is a Zip file with only two required files: `metadata.json` and `extension.js`. A complete, zipped extension usually looks like this:

```
demo@andyholmes.github.io.zip
    locale/
        de/
          LC_MESSAGES/
              demo.mo
    schemas/
        gschemas.compiled
        org.gnome.shell.extensions.demo.gschema.xml
    extension.js
    metadata.json
    prefs.js
    stylesheet.css
```

We'll cover the topics of `locale/` (translations) and `schemas/` (GSettings) later on.

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

// This is a handy import we'll use to grab our extension's object
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


// This function is called once when your extension is loaded, not enabled. This
// is a good time to setup translations or anything else you only do once.
init() {
    log(`initializing ${Me.metadata.name} version ${Me.metadata.version}`);
}

// This function could be called after your extension is enabled, which could
// be done from GNOME Tweaks, when you log in or when the screen is unlocked.
//
// This is when you setup any UI for your extension, change existing widgets or
// modify GNOME Shell's behaviour.
enabled() {
    log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);
}

// This function could be called after your extension is uninstalled, disabled
// in GNOME Tweaks, when you log out or when the screen locks.
//
// Anything you created, modifed or setup in enable() MUST be undone here. Not
// doing so is one of the few ways to have you extension rejected during review!
disable() {
    log(`disabling ${Me.metadata.name} version ${Me.metadata.version}`);
}
```

### `prefs.js`

This file builds a Gtk widget that will be inserted into a window and be used as the preferences dialog for your extension. If this file is not present, there will simply be no preferences button in GNOME Tweaks or on extensions.gnome.org.

```js
'use strict';

const Gtk = imports.gi.Gtk;

// It's common practice to keep GNOME API and JS imports in separate blocks
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


// Like `extension.js` this is used for any one-time setup like translations.
init() {
    log(`initializing ${Me.metadata.name} Preferences`);
}


// This function is called when the preferences window is first created to build
// and return a Gtk widget. As an example we'll create and return a GtkLabel.
buildPrefsWidget() {
    let widget = new Gtk.Label({
        label: `${Me.metadata.name} version ${Me.metadata.version}`,
        visible: true
    });
    
    return widget;
}
```

It's important to understand that while the code in `extension.js` is executed in the same process as `gnome-shell`, `prefs.js` will be executed in a separate process. In `extension.js` you will be using the Clutter or St toolkit, while in `prefs.js` you will be using the Gtk toolkit.

### `stylesheet.css`

--------------------------------------------------------------------------------
This is CSS stylesheet which can apply custom styles to your St widgets in `extension.js` or GNOME Shell as a whole. If you had a widget like this:

```js
let widget = new St.Label({
    text: 'A Label',
    style_class: 'demo-label'
});
```
You could have this in your `stylesheet.css`:

```css
/* This will change the color of all StLabel elements */
StLabel {
    color: red;
}

/* This will change the color of all elements with the "demo-label" class */
.demo-label {
    color: red;
}

/* This will change the color of StLabel elements with the "demo-label" class */
StLabel.demo-label {
    color: red;
}
```

## Getting Started

At this point you can pick an `extension-id` (eg. `demo`) and a `uuid` (eg. `demo@andyholmes.github.io`). The first part of the `uuid` should be the same as your `extension-id` and the second part of should be something under your control such as `username.github.io` or `account_name.gmail.com`.

Let's start by creating an extension directory and create the two files every extension must have; `extension.js` and `metadata.json`. 

```sh
$ mkdir -p ~/.local/share/gnome-shell/extensions/demo@andyholmes.github.io
$ cd ~/.local/share/gnome-shell/extensions/demo@andyholmes.github.io
$ touch extension.js metadata.json
```

### `metadata.json` and `extension.js`

Open these two files in any old text editor, preferrably one with some syntax highlighting and programming support:

```sh
$ gedit extension.js metadata.json &
```

We'll now populate `metadata.json` with the basics, like above:

![metadata.json][image1]

Now we'll do the same for `extension.js`:

![extension.js][image2]

[image1]: https://raw.githubusercontent.com/andyholmes/andyholmes.github.io/master/images/gnome-shell-extension-1-image1.png
[image2]: https://raw.githubusercontent.com/andyholmes/andyholmes.github.io/master/images/gnome-shell-extension-1-image2.png
