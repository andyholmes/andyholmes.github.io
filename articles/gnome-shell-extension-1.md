# Creating a GNOME Shell Extension: Part One

GNOME Shell extensions are pretty easy to write, but a lot of the documentation available is outdated, scattered or just down-right unhelpful. It's pretty common for new authors to use an existing extension as a starting point, but that doesn't always work out well either.

This is a groundup, no-frills overview of what you need to know to get started. We're going to use modern JavaScript, a text editor, a terminal and `zip`/`unzip`.

As of this writing, the latest Ubuntu LTS is 18.04 shipping with `gnome-shell 3.28` and `gjs 1.52`, so that's what we'll restrict ourselves to. Users of other distributions will also often hang back one release and this is a fair line to draw.

## Table of Contents

1. [Basic Overview](#basic-overview)
   * [`metadata.json`](#metadatajson)
   * [`extension.js`](#extensionjs)
   * [`prefs.js`](#prefsjs)
   * [`stylesheet.css`](#stylesheetcss)
2. [Getting Started](#getting-started)
   * [`metadata.json` and `extension.js`](#metadatajson-and-extensionjs)
   * [Basic Debugging](#basic-debugging)
   * [Enabling the Extension](#enabling-the-extension)
3. [Making Changes](#making-changes)
   * [Adding UI Elements](#adding-ui-elements)
   * [Changing UI Elements](#changing-ui-elements)
   * [Modifying Behaviour](#modifying-behaviour)
4. [Creating a Preferences Dialog](#creating-a-preferences-dialog)
   * [GSettings](#gsettings)
   * [Building the Widget](#building-the-widget)
   
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
function init() {
    log(`initializing ${Me.metadata.name} version ${Me.metadata.version}`);
}

// This function could be called after your extension is enabled, which could
// be done from GNOME Tweaks, when you log in or when the screen is unlocked.
//
// This is when you setup any UI for your extension, change existing widgets or
// modify GNOME Shell's behaviour.
function enable() {
    log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);
}

// This function could be called after your extension is uninstalled, disabled
// in GNOME Tweaks, when you log out or when the screen locks.
//
// Anything you created, modifed or setup in enable() MUST be undone here. Not
// doing so is one of the few ways to have you extension rejected during review!
function disable() {
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

### Basic Debugging

Now is a good time to cover basic debugging and logging, which is an important part of developing any software. GJS has a number of built in global functions, although not all of them are useful for extensions.

* `log('string')` - Print a string to the log, usually `journald` (log level MESSAGE)
* `logError(Error, 'optional prefix')` - Print a stack trace for an `Error()` object, with an optional prefix
* `print('string')` - Print a string to `stdout`
* `printerr('string')` - Print a string to `stderr`

Similar to Python, GJS has a console you can use to test things out:

```sh
$ gjs-console
gjs> log('test');
Gjs-Message: 06:46:03.487: JS LOG: test

gjs> try {
....     throw new Error('an error');
.... } catch (e) {
....     logError(e, 'optional prefix');
.... }

(gjs-console:9133): Gjs-WARNING **: 06:47:06.311: JS ERROR: optional prefix: Error: an error
@typein:2:16
@<stdin>:1:34
```

When writing extensions, `print()` and `printerr()` are not particularly useful since we won't have easy access to `gnome-shell`'s `stdin` and `stderr` pipes. We'll be using `log()` and `logError()` and watch the log in a new terminal with `journalctl`:

```sh
$ journalctl -f -o cat /usr/bin/gnome-shell
```

### Enabling the Extension

Since your extension is usually loaded when GNOME Shell starts, it is recommended you develop in a Xorg session so that you can easily restart it. You can restart it now to load your extension by pressing <kbd>Alt</kbd>+<kbd>F2</kbd> to open the *Run Dialog* and enter `restart`. Once GNOME Shell has restarted, you can enable your extension with this command:

```sh
$ gnome-shell-extension-tool -e demo@andyholmes.github.io
'demo@andyholmes.github.io' is now enabled.
```

In your log you should see something like the following:

```sh
GNOME Shell started at Sun Dec 23 2018 07:14:35 GMT-0800 (PST)
initializing Demo version 1
enabling Demo version 1
```

## Making Changes

Extensions can change the existing UI, add new elements or even modify the behaviour of GNOME Shell.

### Adding UI Elements

Many of the elements in GNOME Shell lile panel buttons, popup menus and notifications are built from reusable classes. Here are a few links to some commonly used elements.

* https://gitlab.gnome.org/GNOME/gnome-shell/blob/3.28.3/js/ui/modalDialog.js
* https://gitlab.gnome.org/GNOME/gnome-shell/blob/3.28.3/js/ui/panelMenu.js
* https://gitlab.gnome.org/GNOME/gnome-shell/blob/3.28.3/js/ui/popupMenu.js

You can browse around in the `ui/` folder or any other JavaScript file under `js/` for more code to be reused. Notice the path structure in the links above and how they compare to the imports below:

```js
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
```

Let's add a button to the panel with a menu to start:

```js
'use strict';

// GNOME APIs are under the `gi` namespace
// See: http://devdocs.baznga.org for documentation for the bindings
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;


// We'll extend the Button class from Panel Menu so we can do some setup in
// the init() function.
class PanelButton extends PanelMenu.Button {

    _init() {
        super._init(null, `${Me.metadata.name} Button`, false);
        
        // Pick an icon
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);
        
        // Add a menu item
        this.menu.addAction('Menu Item', this.menuAction, null);
    }
    
    menuAction() {
        log('Menu item activated');
    }
}

// We're going to declare this in the scope of the whole script so it can be
// accessed in both `enable()` and `disable()`
var button = null;


function init() {
    log(`initializing ${Me.metadata.name} version ${Me.metadata.version}`);
}


function enable() {
    log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);
    
    button = new PanelButton();
    
    // The `main` import is an example of file that is mostly live instances of
    // objects, rather than reusable code. `Main.panel` is the actual panel you
    // see at the top of the screen.
    Main.panel.addToStatusArea(`${Me.metadata.name} Button`, button);
}


function disable() {
    log(`disabling ${Me.metadata.name} version ${Me.metadata.version}`);
    
    // It's important for extensions to clean up after themselves when they are
    // disabled. Extensions are disabled in a several situations, such as when
    // the screen locks to prevent privacy and security breaches.
    if (button !== null) {
        button.destroy();
        button = null;
    }
}
```

Now save `extension.js` and restart GNOME Shell to see the button with it's menu in the panel:

![Panel Button](https://raw.githubusercontent.com/andyholmes/andyholmes.github.io/master/images/gnome-shell-extension-1-image3.png)


### Changing UI Elements

Since we are working within an active process, we can also modify the properties of existing elements in the UI. Let's expand the button's menu to include some other elements from the panel:

```js
class PanelButton extends PanelMenu.Button {

    _init() {
        super._init(null, `${Me.metadata.name} Button`, false);
        
        // Pick an icon
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);
        
        // Keep record of the original state of each item
        this.states = {};
        
        // Add a menu item for each item in the panel
        for (let name in Main.panel.statusArea) {
            // Track this item's original visibility
            this.states[name] = Main.panel.statusArea[name].actor.visible;
        
            this.menu.addAction(
                `Toggle "${name}"`,
                this.menuAction.bind(null, name),
                null
            );
        }
    }
    
    menuAction(name) {
        log(`${name} menu item activated`);
        
        let statusItem = Main.panel.statusArea[name];

        // Most classes in GNOME Shell are container classes with a ClutterActor
        // as the property `actor`. St is an extension of Clutter so these may
        // also be StWidgets, but they all carry ClutterActor properties
        statusItem.actor.visible = !statusItem.actor.visible;
    }
    
    // We'll override the destroy() function to revert any changes we make
    destroy() {
        // Restore the visibility of the panel items
        for (let [name, visibility] of Object.entries(this.states)) {
            Main.panel.statusArea[name].actor.visible = visibility;
        }
        
        super.destroy();
    }
}
```

Now save `extension.js` and restart GNOME Shell again to see the menu allowing you toggle the visibility of panel items:

![Panel Button Menu](https://raw.githubusercontent.com/andyholmes/andyholmes.github.io/master/images/gnome-shell-extension-1-image4.png)

### Modifying Behaviour

Other than changing the properties and appearance of elements in GNOME Shell, it's also possible to modify the behaviour of elements like notifications or interactive events. As a simple example, we'll steal the scroll event from the volume indicator for our panel button:

```js
// Grab the User Menu and Volume Indicator
const VolumeIndicator = Main.panel.statusArea.aggregateMenu._volume;


class PanelButton extends PanelMenu.Button {

    _init() {
        super._init(null, `${Me.metadata.name} Button`, false);
        
        // Pick an icon
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);
        
        // Keep record of the original state of each item
        this.states = {};
        
        // Add a menu item for each item in the panel
        for (let name in Main.panel.statusArea) {
            // Track this item's original visibility
            this.states[name] = Main.panel.statusArea[name].actor.visible;
        
            this.menu.addAction(
                `Toggle "${name}"`,
                this.menuAction.bind(null, name),
                null
            );
        }
        
        // Prevent the volume indicator from emitting the signal
        VolumeIndicator.reactive = false;
        
        // Connect the callback to our button's signal
        this._onScrollEventId = this.actor.connect(
          'scroll-event',
          VolumeIndicator._onScrollEvent.bind(VolumeIndicator)
        );
    }
    
    menuAction(name) {
        log(`${name} menu item activated`);
        
        let statusItem = Main.panel.statusArea[name];

        // Most classes in GNOME Shell are container classes with a ClutterActor
        // as the property `actor`. St is an extension of Clutter so these may
        // also be StWidgets, but they all carry ClutterActor properties
        statusItem.actor.visible = !statusItem.actor.visible;
    }
    
    // We'll override the destroy() function to revert any changes we make
    destroy() {
        // Restore the visibility of the panel items
        for (let [name, visibility] of Object.entries(this.states)) {
            Main.panel.statusArea[name].actor.visible = visibility;
        }
        
        // Disconnect from the scroll-event signal
        this.actor.disconnect(this._onScrollEventId);
        
        // Reset the volume indicator reactivity
        VolumeIndicator.reactive = true;
        
        super.destroy();
    }
}
```

## Creating a Preferences Dialog

Our preferences dialog will be written in Gtk, which gives us a lot of options for how we present settings to the user. You may consider looking through the GNOME Human Interface Guidelines for ideas or guidance. Keep in mind these are only guidelines and you *should* depart from them when necessary to make the most intuitive interface you can.

### GSettings

> ***WARNING***
>
> **Programmer errors with GSettings are fatal in *all* languages and will cause the application to crash!** Normally this means your application will quit and fail to start until you correct the problem. Since your extension is part of the `gnome-shell` process, this can prevent you from logging in. See [Recovering from Fatal Errors](#recovering-from-fatal-errors) below.

The first thing to do is create a directory for your settings schema and an empty schema file:

```sh
$ mkdir schemas/
$ touch demo.gschema.xml
```

Then open the file in your text editor and create a schema describing the settings for your extension:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.gnome.Shell.Extensions.Demo" path="/org/gnome/shell/extensions/demo/">
    <key name="panel-states" type="a{sb}">
      <default>{}</default>
    </key>
  </schema>
</schemalist>
```

Generally, you are advised not to use "GNOME" in any of your application's names or ids to avoid giving the impression that your application is officially endorsed by the GNOME Foundation. In this case however, it is convention to use the above `id` and `path` form so that all GSettings for extensions can be found in a common place.

Once you are done defining you schema, save the file and compile it into it's binary form:

```sh
$ glib-compile-schemas schemas/
$ ls schemas
demo.gschema.xml  gschemas.compiled
```

Now that our GSettings schema is compiled and ready to be used, we'll integrate it into our extension:

```js
class PanelButton extends PanelMenu.Button {

    _init() {
        super._init(null, `${Me.metadata.name} Button`, false);
        
        // Get the GSchema for our settings
        let gschema = Gio.SettingsSchemaSource.new_from_directory(
            Me.dir.get_child('schemas').get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false
        );

        // Create a new settings object
        this.settings = new Gio.Settings({
            settings_schema: gschema.lookup('org.gnome.Shell.Extensions.Demo', true)
        });
        
        // Pick an icon
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);
        
        // Keep record of the original state of each item
        this.states = {};
        
        // Read the saved states
        this.saved = this.settings.get_value('panel-states').deep_unpack();
        
        // Add a menu item for each item in the panel
        for (let name in Main.panel.statusArea) {
            // Track this item's original visibility
            this.states[name] = Main.panel.statusArea[name].actor.visible;
            
            // Restore our settings
            if (name in this.saved) {
                log(`Restoring state of ${name}`);
                Main.panel.statusArea[name].actor.visible = this.saved[name];
            }
        
            this.menu.addAction(
                `Toggle "${name}"`,
                this.menuAction.bind(this, name),
                null
            );
        }
        
        // Prevent the volume indicator from emitting the signal
        VolumeIndicator.reactive = false;
        
        // Connect the callback to our button's signal
        this._onScrollEventId = this.actor.connect(
          'scroll-event',
          VolumeIndicator._onScrollEvent.bind(VolumeIndicator)
        );
    }
    
    menuAction(name) {
        log(`${name} menu item activated`);
        
        let statusItem = Main.panel.statusArea[name];

        // Most classes in GNOME Shell are container classes with a ClutterActor
        // as the property `actor`. St is an extension of Clutter so these may
        // also be StWidgets, but they all carry ClutterActor properties
        statusItem.actor.visible = !statusItem.actor.visible;
        
        // Store our saved state
        this.saved[name] = statusItem.actor.visible;
    }
    
    // We'll override the destroy() function to revert any changes we make
    destroy() {
        // Store the panel settings in GSettings
        this.settings.set_value(
            'panel-states',
            new GLib.Variant('a{sb}', this.saved)
        );
        
        // Restore the visibility of the panel items
        for (let [name, visibility] of Object.entries(this.states)) {
            Main.panel.statusArea[name].actor.visible = visibility;
        }
        
        // Disconnect from the scroll-event signal
        this.actor.disconnect(this._onScrollEventId);
        
        // Reset the volume indicator reactivity
        VolumeIndicator.reactive = true;
        
        super.destroy();
    }
}
```

Now save `extension.js` and restart GNOME Shell again. Change the visibility of one of the panel items and then disable the extension:

```sh
$ gnome-shell-extension-tool -d demo@andyholmes.github.io
'demo@andyholmes.github.io' is now disabled.
```

The panel button from the extension should disappear, and the hidden panel item should reappear. Renable the extension and your settings should be restored:

```sh
$ gnome-shell-extension-tool -e demo@andyholmes.github.io
'demo@andyholmes.github.io' is now enabled.
```

### Building the Widget

Now that we have GSettings for our extension, we will give the use some control by creating a simple preference dialog. Start by creating the `prefs.js` file and opening it in your text editor:

```sh
$ touch prefs.js
$ gedit prefs.js
```

Then we'll create a simple grid with a title, label and button for resetting our saved settings:

```js
'use strict';

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


function init() {
}

function buildPrefsWidget() {
        
    // Copy the same GSettings code from `extension.js`
    let gschema = Gio.SettingsSchemaSource.new_from_directory(
        Me.dir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    this.settings = new Gio.Settings({
        settings_schema: gschema.lookup('org.gnome.Shell.Extensions.Demo', true)
    });

    // Create a parent widget that we'll return from this function
    let layout = new Gtk.Grid({
        margin: 18,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });
    
    // Add a simple title and add it to the layout
    let title = new Gtk.Label({
        label: `<b>${Me.metadata.name} Extension Preferences</b>`,
        halign: Gtk.Align.START,
        use_markup: true,
        visible: true
    });
    layout.attach(title, 0, 0, 2, 1);
    
    // Create a label to describe our button and add it to the layout
    let label = new Gtk.Label({
        label: 'Reset Panel Items:',
        visible: true
    });
    layout.attach(label, 0, 1, 1, 1);
    
    // Create a 'Reset' button and add it to the layout
    let button = new Gtk.Button({
        label: 'Reset',
        visible: true
    });
    layout.attach(button, 1, 1, 1, 1);
    
    // Connect the ::clicked signal to reset the stored settings
    button.connect('clicked', (button) => settings.reset('panel-states'));

    // Return our widget which will be added to the window
    return layout;
}
```

To test the new preferences dialog, you can launch it directly from the command line:

```sh
$ gnome-shell-extension-prefs demo@andyholmes.github.io
```

![Preferences Dialog](https://raw.githubusercontent.com/andyholmes/andyholmes.github.io/master/images/gnome-shell-extension-1-image5.png)

We also want to keep our extension up to date with any changes that happen, so add a signal handler below where we create the GSettings object in `extension.js`:

```js
// Create a new settings object
this.settings = new Gio.Settings({
    settings_schema: gschema.lookup('org.gnome.Shell.Extensions.Demo', true)
});
        
// Watch the settings for changes
this._onSettingsChangedId = this.settings.connect(
    'changed::panel-states',
    this._onSettingsChanged.bind(this)
);
        
// Pick an icon
let icon = new St.Icon({
```

And add a callback function to the `PanelButton` class:

```js
_onSettingsChanged() {
    // Load the new settings
    this.saved = this.settings.get_value('panel-states').deep_unpack();
    
    // Restore or reset the panel items
    for (let name in this.states) {
        // If we have a saved state, set that
        if (name in this.saved) {
            Main.panel.statusArea[name].actor.visible = this.saved[name];
            
        // Otherwise restore the original state
        } else {
            Main.panel.statusArea[name].actor.visible = this.states[name];
        }
    }
}
```

--------------------------------------------------------------------------------

