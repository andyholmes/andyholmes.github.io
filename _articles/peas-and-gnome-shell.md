---
layout: article
title: Peas and GNOME Shell
date: 2022-09-26
---

[libpeas] is GObject-based plugin engine, allowing applications to adopt a
modular architecture and support third-party plugins. This article is about how
libpeas could be used in GNOME Shell and why that's a bad idea.

[libpeas]: https://gitlab.gnome.org/GNOME/libpeas


## Table of Contents

1. [GNOME Shell Extensions](#gnome-shell-extensions)
  * [Example Extension](#example-extension)
2. [Peas](#peas)
  * [PeasPluginInfo](#peasplugininfo)
  * [PeasExtension](#peasextension)
  * [PeasEngine](#peasengine)
4. [Conclusion](#conclusion)
  * [Disadvantages](#disadvantages)
  * [Working Example](#working-example)


## GNOME Shell Extensions

Although it's a piece of history forgotten to most, extensions were originally
envisioned as a way for developers to quickly prototype interface changes and
get feedback without requiring a complete rebuild of GNOME Shell. A recent
example of this is Florian Müllner's [Quick Settings Extension][quicksettings],
which was made available to GNOME 42 users, before being merged for GNOME 43.

The simplest way to understand the scope of an extension is to think of it as a
patch that is applied when it is enabled, and reverted when it is disabled. Like
any other patch an extension may add, remove or modify code. Likewise, just how
patches need to be rebased on the target branch, extensions sometimes need to be
updated to work with a newer version of GNOME Shell.

[quicksettings]: https://gitlab.gnome.org/fmuellner/quick-settings-extension

### Example Extension

Extensions have two required files: `extension.js` serving as an entry point for
its functionality and `metadata.json` which describes it:

```json
{
    "uuid": "panel-hider@andyholmes.ca",
    "name": "Panel Hider",
    "description": "An extension that hides the panel.",
    "shell-version": ["42"]
}
```

Below is an example `extension.js` that simply hides the top panel:

```js
const Main = imports.ui.main

function enable() {
    Main.panel.visible = false;
}

function disable() {
    Main.panel.visible = true;
}

function init() {
}
```

When GNOME Shell loads an extension, it first imports `extension.js` and
invokes the `init()` function. This is used for one-time initialization of
things like translations.

When an extension is enabled the `enable()` function is invoked, which is when
extensions start adding, removing or even modifying existing code. When it is
disabled the `disable()` function is invoked and the extension is expected to
revert anything it did in `enable()`.


## Peas

Every plugin system has its own nomenclature and definitions of terms like
"plugin" and "extension". In Peas a plugin is more like a module as it can
define multiple classes. Each class is either derived from an abstract type or
implements an interface, and that base type is the extension type.

For example, a module called `files` could have one class implementing
`Gio.ListModel` and another derived from `Gio.IOStream`. Once registered, each
of these classes can be instantiated as an extension with the `Peas.Engine` by
passing the the plugin info and the type (`Gio.ListModel` or `Gio.IOStream`).

### PeasPluginInfo

Each plugin is described by a `.plugin` file, which is available in-process as a
[`Peas.PluginInfo`][peas-plugininfo]. The file itself is a standard keyfile
containing information comparable to `metadata.json`:

```ini
[Plugin]
Module=example
Name=Example
Description=An example plugin
```

In a typical use case, an application will add a search path which is scanned by
libpeas. The application may then load any or all of the discovered plugins and
once loaded may create instances of a plugin's extensions.

[peas-plugininfo]: https://gjs-docs.gnome.org/peas10/peas.plugininfo

### PeasExtension

A [`Peas.Extension`][peas-extension] object is actually just a proxy for an
underlying class instance. Each type that a plugin implements is an extension it
provides. These types are often defined by the application, but a plugin may
register any type that is either a subclass of an abstract type or an
implementation of an interface.

Below is a basic implementation of the [`Peas.Activatable`][peas-activatable]
interface, derived from the [`Peas.ExtensionBase`][peas-extensionbase] class. It
is defined as dynamic type, so that the type may be registered and unregistered
without conflicts (i.e. updating the plugin without restarting the application).


`bean-activatable.h`
```c
#pragma once

#include <libpeas/peas.h>

G_BEGIN_DECLS

#define BEANS_TYPE_ACTIVATABLE (beans_activatable_get_type ())

G_DECLARE_FINAL_TYPE (BeansActivatable, beans_activatable, BEANS, ACTIVATABLE, PeasExtensionBase)

G_END_DECLS
```

`bean-activatable.c`
```c
#include <gio/gio.h>
#include <libpeas/peas.h>

#include "beans-activatable.h"


struct _BeansActivatable
{
  PeasExtensionBase  parent_instance;

  GObject           *object;
};

static void   peas_activatable_iface_init (PeasActivatableInterface *iface);

G_DEFINE_DYNAMIC_TYPE_EXTENDED (BeansActivatable, beans_activatable, PEAS_TYPE_EXTENSION_BASE,
                                0,
                                G_IMPLEMENT_INTERFACE_DYNAMIC (PEAS_TYPE_ACTIVATABLE, peas_activatable_iface_init))

enum {
  PROP_0,
  PROP_OBJECT
};


static void
beans_activatable_activate (PeasActivatable *activatable)
{
  g_message ("%s()", G_STRFUNC);
}

static void
beans_activatable_deactivate (PeasActivatable *activatable)
{
  g_message ("%s()", G_STRFUNC);
}

static void
beans_activatable_update_state (PeasActivatable *activatable)
{
  g_message ("%s()", G_STRFUNC);
}

static void
peas_activatable_iface_init (PeasActivatableInterface *iface)
{
  iface->activate = beans_activatable_activate;
  iface->deactivate = beans_activatable_deactivate;
  iface->update_state = beans_activatable_update_state;
}


static void
beans_activatable_get_property (GObject    *object,
                                guint       prop_id,
                                GValue     *value,
                                GParamSpec *pspec)
{
  BeansActivatable *self = BEANS_ACTIVATABLE (object);

  switch (prop_id)
    {
    case PROP_OBJECT:
      g_value_set_object (value, self->object);
      break;

    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
beans_activatable_set_property (GObject      *object,
                                guint         prop_id,
                                const GValue *value,
                                GParamSpec   *pspec)
{
  BeansActivatable *self = BEANS_ACTIVATABLE (object);

  switch (prop_id)
    {
    case PROP_OBJECT:
      self->object = g_value_get_object (value);
      break;

    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
beans_activatable_class_finalize (BeansActivatableClass *klass)
{
}

static void
beans_activatable_class_init (BeansActivatableClass *klass)
{
  GObjectClass *object_class = G_OBJECT_CLASS (klass);

  object_class->get_property = beans_activatable_get_property;
  object_class->set_property = beans_activatable_set_property;

  g_object_class_override_property (object_class, PROP_OBJECT, "object");
}

static void
beans_activatable_init (BeansActivatable *self)
{
}


/*
 * Registering the extension
 */
G_MODULE_EXPORT void
peas_register_types (PeasObjectModule *module)
{
  beans_activatable_register_type (G_TYPE_MODULE (module));

  peas_object_module_register_extension_type (module,
                                              PEAS_TYPE_ACTIVATABLE,
                                              BEANS_TYPE_ACTIVATABLE);
}
```

[peas-activatable]: https://gjs-docs.gnome.org/peas10/peas.activatable
[peas-extension]: https://gjs-docs.gnome.org/peas10/peas.extension
[peas-extensionbase]: https://gjs-docs.gnome.org/peas10/peas.extensionbase

### PeasEngine

The [`Peas.Engine`][peas-engine] is essentially a factory for extensions and is
used to scan for plugins, load and unload plugins, and create instances of
extensions. It is usually used as a singleton and sometimes only indirectly via
[`Peas.ExtensionSet`][peas-extensionset].

In the example below, we're assuming the example plugin has been compiled into
`libexample.so` and placed in `~/.local/share/beans/plugins` along with the
`example.plugin` file describing it.

```js
const { GLib, Peas } = imports.gi;


let engine = null;
let extension = null;


function enable() {
    // Loading each plugin in the search path
    for (const pluginInfo of engine.get_plugin_list()) {
        engine.load_plugin(pluginInfo);

    // Creating an instance of Beans.Activatable
    const pluginInfo = engine.get_plugin_info('example');

    extension = engine.create_extension(pluginInfo, Peas.Activatable,
        ['object'], [this]);

    // Calling a method on the extension
    extension.activate();
}

function disable() {
    extension.deactivate();
    extension = null;

    // Unloading each plugin in the engine
    for (let pluginInfo of engine.get_plugin_list())
        engine.unload_plugin(pluginInfo);
}

function init() {
    // Adding a search path to the engine
    const pluginsDir = GLib.build_filenamev([GLib.get_user_data_dir(),
        'beans', 'plugins']);

    engine = Peas.Engine.get_default();
    engine.prepend_search_path(pluginsDir, null);
}
```

[peas-engine]: https://gjs-docs.gnome.org/peas10/peas.engine
[peas-extensionset]: https://gjs-docs.gnome.org/peas10/peas.extensionset


## Conclusion

Using libpeas to provide a more traditional plugin system for GNOME Shell is
entirely possible, but it has hopefully been demonstrated that there isn't much
to gain by doing it. The fact that a GNOME Shell extension can be used to
implement a plugin system should speak to the power and flexibility of the
existing extension system.

### Disadvantages

In order to call methods on an extension or even create one, you must have
introspection data for that type (i.e. a GIR file to import in GJS). Unlike
JavaScript classes, or even GObject classes defined in GJS, you can't simply
create classes and call methods on them.

Although you could distribute an extension like the example above on the
[GNOME Extensions][ego] website, you can't distribute C plugins along with it.
Unlike GNOME Shell extensions, compiled plugins are architecture dependent,
depend on the linked ABI and extension review prohibits distributing binaries
regardless.

At the same time, it's not possible to use libpeas to import Python plugins in
GJS, because you can't use two garbage collected languages in the same GObject
program. Unfortunately writing plugins in GJS is not currently supported by
libpeas, but if it were you would gain nothing by doing so.

[ego]: https://extensions.gnome.org

### Working Example

[Beans][beans] is a working example of using libpeas in a GNOME Shell extension
to load plugins written in C. It supports a few extension types, with examples
of how they can be instantiated and used.

It also includes a `Clutter.Actor` extension by linking to a specific version of
[Mutter][mutter] and using one of the interfaces already implemented by
`Clutter.Actor` as the extension type.

[beans]: https://github.com/andyholmes/gnome-shell-extension-beans
[mutter]: https://gitlab.gnome.org/GNOME/mutter

