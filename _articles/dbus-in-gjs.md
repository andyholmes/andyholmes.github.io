---
layout: article
title: DBus in GJS
date: 2020-02-16
tags: [gjs, dbus]
---

This article is an extended treatment of DBus, specifically covering its usage
in GJS. While you're strongly encouraged to use the higher-level APIs, this
article will cover DBus from top to bottom including `GVariant`, low and
high-level Gio APIs and the convenience APIs provided by GJS.

If you're already familiar with these topics or you just want to get started the
quickest way possible, you can jump to the high-level code examples for
[Clients](#high-level-proxies) and [Services](#high-level-interfaces). While
working with DBus, you can use [D-Feet][dfeet] or the built-in inspector in
[GNOME Builder][gnome-builder] to introspect DBus on your desktop.

You can find the API documentation for GJS at <https://gjs-docs.gnome.org/>.

[dbus]: https://dbus.freedesktop.org/
[gvariant]: https://gjs-docs.gnome.org/#q=glib.variant
[dfeet]: https://flathub.org/apps/details/org.gnome.dfeet
[gnome-builder]: https://flathub.org/apps/details/org.gnome.Builder


## Table of Contents

1. [Introduction to DBus](#introduction-to-dbus)
   * [Bus Structure](#service-structure)
   * [Bus Types](#bus-types)
   * [Bus Connections](#bus-connections)
   * [Arguments and Values](#arguments-and-values)
   * [Interface Definitions](#interface-definitions)
2. [Clients](#clients)
   * [Watching a Name](#watching-a-name)
   * [Direct Calls](#direct-calls)
   * [Low-Level Proxies](#low-level-proxies)
   * [High-Level Proxies](#high-level-proxies)
3. [Services](#services)
   * [Owning a Name](#owning-a-name)
   * [Low-Level Interfaces](#low-level-interfaces)
   * [High-Level Interfaces](#high-level-interfaces)
4. [GNOME APIs](#gnome-apis)
   * [GAction](#gaction)
   * [GMenu](#gmenu)


## Introduction to DBus

[DBus][dbus] is a messaging system that can be used to communicate between
processes, enforce single-instance applications, start those services on demand
and more. This section is an overview of DBus including the structure of
services, bus types, connections and working with `GVariant`.


### Bus Structure

To get our bearings, let's first take a look at the hierarchy of a common DBus
service that most users will have on their desktop. [UPower][upower] is a good
example because it exports an object for the application itself and additional
objects for each power device (eg. laptop battery):

```
org.freedesktop.UPower
    /org/freedesktop/UPower
        org.freedesktop.DBus.Introspectable
        org.freedesktop.DBus.Peer
        org.freedesktop.DBus.Properties
        org.freedesktop.UPower
    /org/freedesktop/UPower/devices/battery_BAT0
        org.freedesktop.DBus.Introspectable
        org.freedesktop.DBus.Peer
        org.freedesktop.DBus.Properties
        org.freedesktop.UPower.Device
```

[upower]: https://upower.freedesktop.org/


#### Names

At the top-level we have the **well-known name**, `org.freedesktop.UPower`. This
is a "reverse-DNS" style name that should also be the [Application ID][app-id].
The DBus server will resolve this to a unique name like `:1.67`, sometimes
referred to as the **name owner**. Think of this like a DNS server resolving a
a web site address (`www.gnome.org`) to an IP address (`8.43.85.13`).

This facilitates what is known as [DBus Activation][dbus-activation] which, if
supported by the service, allows the DBus server to automatically start the
service process when it is accessed in a number of ways. Once the process
starts it will "own the name", and thus become the **name owner**.

[app-id]: https://developer.gnome.org/ChooseApplicationID/
[dbus-activation]:https://developer.gnome.org/DBusApplicationLaunching/


#### Object Paths

At the second level we have two **object paths**: `/org/freedesktop/UPower`
representing the application and `/org/freedesktop/UPower/devices/battery_BAT0`
representing a laptop battery. These objects aren't really used for anything
themselves, but rather are containers for various **interfaces**.

Notice the convention of using the **well-known name** (in the form of a path)
as the base path for objects belonging to the service. Using `/` as an
**object path** for any reason is discouraged.


#### Interfaces

At the third level we have **interfaces** and that's what we're really
interested in. Just like a GObject, these can have **methods**, **properties**
and **signals**. In fact, as we will see later, these interfaces are often
linked to class instances in the application through DBus.

Like **object paths**, the convention is to use the **well-known name** as the
base for the **interface** name. Each path will also have a set of common
**interfaces**, those beginning with `org.freedesktop.DBus`, for introspecting
the service and property management.

In DBus the **method** arguments and return values, **property** values and
**signal** values are all DBus Variants. When using the GNOME API these are
[`GLib.Variant`][gvariant] objects, which we'll cover below in the section
[Arguments and Values](#arguments-and-values).


### Bus Types

An average desktop typically has two **bus types**; the **system bus** and the
**session bus**.

The **system bus** is used for services that are independent of a user session
and often represent real devices like the battery (UPower) or Bluetooth devices
(bluez). You probably won't be exporting any services on this bus, although you
might be a client to a service.

The **session bus** is far more common to use and many user applications and
desktop services are exported here. Some examples include notification servers
(libnotify), search providers for GNOME Shell, or or even regular applications
such a Nautilus that want to expose actions like `EmptyTrash()`.


### Bus Connections

A **bus connection** is necessary to connect a client **proxy** or export a
service **interface**. GJS includes two convenience properties that make a
synchronous call to get connections for the **session bus** and **system bus**.

Note that the [`Gio.DBusConnection`][gdbusconnection] objects returned by these
calls are singletons, meaning that both the functions and properties will always
return the same object.

```js
let sessionConnection = Gio.DBus.session;
let sessionConnection = Gio.bus_get_sync(Gio.BusType.SESSION, null);

let systemConnection = Gio.DBus.system;
let systemConnection = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);

if (Gio.DBus.session === Gio.bus_get_sync(Gio.BusType.SESSION, null))
    print('Same object instance');
```

Earlier it was explained that a **well-known name** is resolved to a unique name
(like `:1.67`) and since the standard method for getting a **bus connection**
will return singletons, the result is that most applications use a single
connection for each **bus type**.


#### Using Multiple Connections

Below are a few of some of the **well-known names** that GNOME Shell owns and as
you can see this is a process that wears many hats. This is fine because all of
the names it owns are used for distinct, single-instance services:

```
org.gnome.Shell
org.gnome.Mutter.RemoteDesktop
org.gnome.ScreenSaver
org.freedesktop.Notifications
```

As a example of the contrary, in [GSConnect][gsconnect] we export MPRIS services
for any number of media players running on remote devices. Although the
**well-known name** for each player may be unique, if they are exported on the
same **bus connection** they will resolve to the same unique name.

In the example below you can see the same exported objects appearing under both
**well-known names**. If we tried to export another MPRIS service on that same
**bus connection**, that operation would fail.

```
org.mpris.MediaPlayer2.Pixel2.Spotify
    /org/gnome/Shell/Extensions/GSConnect
        [...]
    /org/mpris/MediaPlayer2
        org.freedesktop.DBus.Introspectable
        org.freedesktop.DBus.Peer
        org.freedesktop.DBus.Properties
        org.mpris.MediaPlayer2
        org.mpris.MediaPlayer2.Player
        
org.gnome.Shell.Extensions.GSConnect
    /org/gnome/Shell/Extensions/GSConnect
        [...]
    /org/mpris/MediaPlayer2
        org.freedesktop.DBus.Introspectable
        org.freedesktop.DBus.Peer
        org.freedesktop.DBus.Properties
        org.mpris.MediaPlayer2
        org.mpris.MediaPlayer2.Player
```

Since the standard functions used to get a bus connection always return the same
object, you will need to get a new, dedicated connection to avoid this problem.
Below is a simple function you can use, demonstrating how to get a dedicated
**bus connection** for a particular **bus type**:

```js
const Gio = imports.gi.Gio;


/**
 * Get a new dedicated DBus connection on @busType. If @cancellable is
 * given it can be used to cancel the operation before it completes.
 *
 * @param {Gio.BusType} [busType] - a Gio.BusType constant
 * @param (Gio.Cancellable} [cancellable] - an optional Gio.Cancellable
 */
function getNewConnection(busType = Gio.BusType.SESSION, cancellable = null) {
    return new Promise((resolve, reject) => {
        Gio.DBusConnection.new_for_address(
            Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, cancellable),
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
            Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            null,
            cancellable,
            (connection, res) => {
                try {
                    resolve(Gio.DBusConnection.new_for_address_finish(res));
                } catch (e) {
                    reject(e);
                }
            }
        );

    });
}
```

[gdbusconnection]: https://gjs-docs.gnome.org/#q=gio.dbusconnection
[gsconnect]: https://github.com/andyholmes/gnome-shell-extension-gsconnect


### Arguments and Values

When using DBus with the GNOME API, all **method**, **property** and **signal**
values are [`GLib.Variant`][gvariant] objects.

`GVariant` is a value container whose types are determined at construction,
often with type strings. The C documentation has a page detailing the various
[GVariant Format Strings][gvariant-format]. Below are some examples of some the
standard functions in GLib for working with `GLib.Variant` objects:

```js
const GLib = imports.gi.GLib;

// Simple types work pretty much like you expect
let variantBool = GLib.Variant.new_boolean(true);

if (variantBool.get_boolean() === true)
    print('Success!');

// NOTE: GLib.Variant.prototype.get_string() returns the value and the length
let variantString = GLib.Variant.new_string('a string');
let [strValue, strLength] = variantString.get_string();

if (variantString.get_string()[0] === 'a string')
    print('Success!');

// List of strings are also straight forward
let stringList = ['one', 'two'];
let variantStrv = GLib.Variant.new_strv(stringList);

if (variantStrv.get_strv().every(value => stringList.includes(value)))
    print('Success!');


// Aside from the functions in GLib for common types, you can pass a type string
// to the constructor followed by the values (which must match the type string).
let variantStrv2 = new GLib.Variant('as', stringList);

if (variantStrv2.get_strv().every(value => stringList.includes(value)))
    print('Success!');
    
// If you want a variant with multiple value types, you can use one of the
// container types like a dictionary (`a{sv}`) or a tuple (`()`). In GJS there
// is no tuple type, so they get packed and unpacked as Arrays.
let variantTuple = new GLib.Variant('(siaua{sv})', [
    'string',                               // a string
    -1,                                     // a signed integer
    [1, 2, 3],                              // an array of unsigned integers
    {                                       // a dictionary of string => variant
      'code-name': GLib.Variant.new_string('007'),
      'licensed-to-kill': GLib.Variant.new_boolean(true)
    }
]);

// Packing a dictionary where the keys and values are all the same can be done
// in a single step
let shallowDict = new GLib.Variant('a{ss}', {
    'key1': 'value1',
    'key2': 'value2'
});

// If you need a dictionary with a variety of value types you can use `v`
let deepDict = new GLib.Variant('a{sv}', {
    'key1': GLib.Variant.new_string('string'),
    'key2': GLib.Variant.new_boolean(true)
});
```

Now let's look at some of the conveniences GJS has available, including
`unpack()`, `deepUnpack()` and `recursiveUnpack()`:

```js
// GVariant.prototype.unpack() is a useful function for unpacking a single
// level of a variant

// Expected output here is: true
print(variantBool.unpack());

// Note that unpack() is stripping the string length for us so all we get is
// the value. Expected output here is: "a string"
print(variantString.unpack());

// In this case, unpack() is only unpacking the array, not the strings in it.
// Expected output here is:
//   [object variant of type "s"],[object variant of type "s"]
print(variantStrv.unpack());


// GVariant.prototype.deepUnpack() will unpack the variant and it's children,
// but only up to one level.

// Expected output here is:
//   "one","two"
print(variantStrv.deepUnpack());

// Expected result here is:
//   {
//     "key1": "value1",
//     "key2": "value2"
//   }
let shallowDictUnpacked = shallowDict.deepUnpack();

// Expected result here is:
//   {
//     "key1": [object variant of type "s"],
//     "key2": [object variant of type "b"]
//   }
let deepDictUnpacked = deepDict.deepUnpack();


// Coming up in GJS 1.64 (released with GNOME 3.36) is a new function,
// GVariant.prototype.recursiveUnpack(). Expected result here is:
//   {
//     "key1": "string",
//     "key2": true
//   }
let deepDictFull = deepDict.recursiveUnpack();
```

If you ever get stuck trying to figure out how exactly a variant is packed,
there are some helpful functions you can use to debug. Check the documentation
for more.

```js
// Expected output here is: "{'key1': <'string'>, 'key2': <true>}"
print(deepDict.print(true));

// Expected output here is: "a{sv}"
print(deepDict.get_type_string());
```

Since we're really covering `GVariant` for the purposes of using DBus, there are
two things you should take note of:

1. Whether it's a **method**, **property** or **signal** the `GVariant` will
   always be a tuple.
2. [There is no `null` type supported in DBus][dbus-null], so you have to use
   either empty types or another alternative.

```js
// DBus method calls always take tuples of some kind
let methodArgs1 = new GLib.Variant('(s)', ['string']);
let methodArgs2 = new GLib.Variant('(sv)', ['key', example1]);

// Calling the method will return a tuple, although it may be empty
let methodReply = proxy.call_sync(...);

// If not empty, the reply will always be a container of type `(v)`, although
// the `v` itself might be a container type like `av` or `a{sv}`.
let variantValue = methodReply.get_child_index(0);
let nativeValue1 = variantValue.unpack();

// This is probably safer if you're not sure if the return is empty
let nativeValue2 = methodReply.deepUnpack()[0];


// Here we're just using an empty string, which is falsey in JavaScript, instead
// of an actual `null` value
let nullString = new GLib.Variant('s', '');

// Here we're describing a list of values that's empty, but not falsey in JS.
// This is similar to how method calls always return a tuple which may be empty.
let nullArray = new GLib.Variant(`av`, []);

// Here we're using the first child (a boolean) to indicate whether we should
// expect a meaningful value in the second child
let nullVariable('(bv)', [false, GLib.Variant.new_string('')]);
```


[gvariant]: https://gjs-docs.gnome.org/#q=glib.variant
[gvariant-format]: https://developer.gnome.org/glib/stable/gvariant-format-strings.html
[gvariant-type]: https://developer.gnome.org/glib/stable/glib-GVariantType.html
[dbus-null]: https://gitlab.freedesktop.org/dbus/dbus/issues/25


### Interface Definitions

Most projects declare **interface definitions** in XML, either as files or
inlined in the code . In GJS describing **interfaces** that you export in XML is
mandatory (see the [Low-Level Interfaces](#low-level-interfaces)).

GJS includes convenience functions for creating client **proxies** directly from
an XML string, which is covered in the [High-Level Proxies](#high-level-proxies)
section.

The official DBus documentation has [API Design Guidelines][dbus-api-design], so
we'll just show a simple example of what an XML definition typically looks like:

```xml
<node>
  <!-- Notice that neither the well-known name or object path are defined -->
  <interface name="io.github.andyholmes.Test">
  
    <!-- A method with no arguments and no return value -->
    <method name="SimpleMethod"/>
    
    <!-- A method with both arguments and a return value -->
    <method name="ComplexMethod">
      <arg type="s" direction="in" name="input"/>
      <arg type="u" direction="out" name="length"/>
    </method>
    
    <!-- A read-only property -->
    <property name="ReadOnlyProperty" type="s" access="read"/>
    
    <!-- A read-write property -->
    <property name="ReadWriteProperty" type="b" access="readwrite"/>
    
    <!-- A signal with two arguments -->
    <signal name="TestSignal">
      <arg name="type" type="s"/>
      <arg name="value" type="b"/>
    </signal>
  </interface>
</node>
```

There are a couple way you can include you XML definition in your application or
extension, but the most common way is just to use backticks and inline them.

Once you've decided on a way to ship your XML, you'll need to compile your
interfaces into [`Gio.DBusInterfaceInfo`][gdbusinterfaceinfo] object and maybe
[`Gio.DBusNodeInfo`][gdbusnodeinfo] objects:

```js
const ifaceXml = `
<node>
  <!-- Interface Definition(s) -->
</node>
`;

// There is a helper function in GJS `Gio.DBusInterfaceInfo.new_for_xml()` that
// will create the GDBusNodeInfo object and return the first GDBusInterfaceInfo,
// which is the most common use case.
const singleIfaceInfo = Gio.DBusInterfaceInfo.new_for_xml(ifaceXml);


// It is possible to have multiple <interface> elements under <node> though, in
// which case you may want to keep the node info around so you can lookup
// interfaces.
const nodeInfo = Gio.DBusNodeInfo.new_for_xml(value);
const dbusInfo = dbusNodeInfo.lookup_interface('io.github.andyholmes.Test');

// It may be a good idea to do this to improve lookup speed, if you plan on
// introspecting the interface as we will do in a later example (this is also
// something the above helper will do for you).
dbusInfo.cache_build();
```

[dbus-api-design]: https://dbus.freedesktop.org/doc/dbus-api-design.html
[gdbusinterfaceinfo]: https://gjs-docs.gnome.org/#q=gio.dbusinterfaceinfo
[gdbusnodeinfo]: https://gjs-docs.gnome.org/#q=gio.dbusnodeinfo

## Clients

Clients for DBus services are often referred to as **proxies**, and libraries for
for many services like Evolution Data Server are either wrappers or subclasses
of [Gio.DBusProxy][gdbusproxy]. It's also possible to call methods and connect
signals directly on a **bus connection**.

Previously, we mentioned that some services support DBus Activation which allows
the DBus server to start the service process for a **well-known name**
automatically. For nearly every client side operation Gio will have a flags
argument to control this behaviour.

See the documentation of `Gio.DBusNameWatcherFlags`, `Gio.DBusCallFlags` and
`Gio.DBusProxyFlags` for more information about this and other flags you can
pass on the client side.

[eds-article]: https://andyholmes.github.io/articles/evolution-contacts-in-gjs.html
[gdbusproxy]: https://gjs-docs.gnome.org/#q=gio.dbusproxy


### Watching a Name

To know when a DBus service appears and vanishes from the message bus, we can
watch the **well-known name**. You can still hold a client **proxy** and be
connected to signals while the service is unavailable, but this will give you an
indication of whether to expect methods calls or other operations to succeed.

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


// These two functions are the callbacks for when either the service appears or
// disappears from the bus. At least one of these two functions will be called
// when you first start watching a name.

// This will be called when a process takes ownership of the name, which is to
// say the service actually become active.
function onNameAppeared(connection, name, name_owner) {
    print(`The well-known name ${name} has been owned by ${name_owner}`)
}

// Likewise, this will be invoked when the process that owned the name releases
// the name.
function onNameVanished(connection, name) {
    print(`The name owner of ${name} has vanished`)
}

// Like signal connections and many other similar APIs, this function returns an
// integer that is later passed to Gio.bus_unwatch_name() to stop watching.
let busWatchId = Gio.bus_watch_name(
    Gio.BusType.SESSION,
    'io.github.andyholmes.Test',
    Gio.BusNameWatcherFlags.NONE,
    onNameAppeared,
    onNameVanished
);

// You can use this function if you need to pass a dedicated connection, but
// that's a rare use case for name watching and the above method will acquire a
// connection for you asynchronously so is usually a better choice.
let connectionWatchId = Gio.bus_watch_name_on_connection(
    Gio.DBus.session,
    'io.github.andyholmes.Test',
    Gio.BusNameWatcherFlags.NONE,
    onNameAppeared,
    onNameVanished
);
```


### Direct Calls

In this section, we'll see by example that all operations we perform as a client
are actually performed on a **bus connection**. Whether it's calling methods,
getting and setting property values or connecting to signals, these are all
ultimately being passed through a **bus connection** for a **bus type**.

Although you usually won't need to do this, it is sometimes more convenient if
you only need to perform a single operation. In other cases it may be useful to
work around problems with introspected APIs that use DBus, since the data
exchanged as `GLib.Variant` objects are fully supported.


#### Method Calls

Here is an example of sending a libnotify notification and getting the resulting
reply ID:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

// All the operations in these examples will be on the sesson bus
let connection = Gio.DBus.session;

// First we'll pack the method parameters in a GVariant. Calling methods in this
// way will require you to find documentation for the interface.
let notification = new GLib.Variant('(susssasa{sv}i)', [
    'GJS DBus Tutorial',
    0,
    'dialog-information-symbolic',
    'Example Title',
    'Example Body',
    [],
    {},
    -1
]);

// Now we'll call the method
connection.call(
    'org.freedesktop.Notifications',
    '/org/freedesktop/Notifications',
    'org.freedesktop.Notifications',
    'Notify',
    notification,
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null,
    (connection, res) => {
        try {
            // Here we're going to step through unpacking the reply variant, for
            // educational purposes. There are certainly easier ways to do this.

            // The reply of a DBus call is always a variant of type `(v)`
            let reply = connection.call_finish(res);

            // So we get the first child of the tuple, which is the actual
            // method return value
            let value = reply.get_child_value(0);

            // The variant return type of this particular method is 32-bit
            // unsigned integer, although it could have been another container
            // type like a list of strings (`as`) or a dictionary (`a{sv}`)
            let id = value.get_uint32();

            // And log the reply
            print(`Notification ID: ${id}`);
        } catch (e) {
            // Errors returned by DBus may contain extra information we don't
            // want to present to users or that we do want to extract. See the
            // documentation for more information about `Gio.DBusError`.
            if (e instanceof Gio.DBusError) {
                // Get the registered error name
                let errorName = e.get_remote_error();
                
                // Strip the remote error information
                Gio.DBusError.strip_remote_error(e);
            }
            
            logError(e);
        }
    }
);

// Start an event loop
let loop = GLib.MainLoop.new(null, false);
loop.run();
```

#### Properties

Getting or setting the value of properties are also just a method calls, just
made to the standard `org.freedesktop.DBus.Properties` interface:

```js
// Getting a property value
connection.call(
    'org.gnome.Shell',
    '/org/gnome/Shell',
    'org.freedesktop.DBus.Properties',
    'Get',
    new GLib.Variant('(ss)', ['org.gnome.Shell', 'ShellVersion']),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null,
    (connection, res) => {
        try {
            let reply = connection.call_finish(res);
            let value = reply.deep_unpack()[0];
            let version = value.get_string()[0];

            print(`GNOME Shell Version: ${version}`);
        } catch (e) {
            logError(e);
        }
    }
);

// Setting a property value
connection.call(
    'org.gnome.Shell',
    '/org/gnome/Shell',
    'org.freedesktop.DBus.Properties',
    'Set',
    new GLib.Variant('(ssv)', [
        'org.gnome.Shell',
        'OverviewActive',
        GLib.Variant.new_boolean(true)
    ]),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null,
    (connection, result) => {
        try {
            connection.call_finish(result);
        } catch (e) {
            logError(e);
        }
    }
);
```

#### Signal Connections

Connecting signal handlers directly on a connection is also possible. See the
[`Gio.DBusConnection.signal_subscribe()`][conn-signal-subscribe] documentation
for details about signal matching.

```js
// The callback for a signal connection
function onActiveChanged(connection, sender, path, iface, signal, params) {
    let value = params.get_child_value(0);
    let locked = value.get_boolean();

    print(`Screen Locked: ${locked}`)
}

// Connecting a signal handler returns a handler ID, just like GObject signals
let handlerId = connection.signal_subscribe(
    'org.gnome.ScreenSaver',
    'org.gnome.ScreenSaver',
    'ActiveChanged',
    '/org/gnome/ScreenSaver',
    null,
    Gio.DBusSignalFlags.NONE,
    onActiveChanged
);

// Disconnecting a signal handler
connection.signal_unsubscribe(handlerId);
```

[conn-signal-subscribe]: https://gjs-docs.gnome.org/#q=DBusConnection.signal_subscribe


### Low-Level Proxies

The reason [`Gio.DBusProxy`][gdbusproxy] objects are so much more convenient is
they allow you to treat the collection of methods, properties and signals of a
service **interface** as a discrete object.

They can automatically cache the values of properties as they change, connect
and group signals, watch for the **name owner** appearing or vanishing, and
generally reduce the amount of boiler-plate code you have to write.

However, you will see in the examples below that there is still a fair amount of
work involved when compared to the conveniences APIs that we'll be covering in
the next section.


```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


// Note that the synchronous function `Gio.Initable.prototype.init()` will block
// the main thread while getting the DBus connection and caching the initial
// property values.
//
// If the interface has no properties or you plan on doing that yourself, you
// can pass `Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES` in `g_flags`. If you
// already have a connection, you can pass it as the construct property
// `g_connection` instead of using `g_bus_type`.
//
// Otherwise, you can use `init_async()` and `init_finish()` which can be
// wrapped in a Promise like other GTask functions.
let proxy = new Gio.DBusProxy({
    g_bus_type: Gio.BusType.SESSION,
    g_name: 'org.gnome.Shell',
    g_object_path: '/org/gnome/Shell',
    g_interface_name: 'org.gnome.Shell',
    g_flags: Gio.DBusProxyFlags.NONE
});

// WARNING: the constructor functions from C like `g_dbus_proxy_new_sync()` and
// friends that wrap the `GInitable`/`GAsyncInitable` functions are overridden
// in GJS, so you MUST call these directly to initialize a proxy.
proxy.init(null);

// This signal is emitted when one or more properties have changed on the proxy,
// similar to the GObject::notify signal.
proxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
    let properties = changed.deep_unpack();

    // These properties will already be cached when the signal is emitted
    for (let [name, value] of Object.entries(properties)) {
        print(`Property ${name} set to ${value.unpack()}`);
    }
    
    // These properties have been marked as changed, but not cached. A service
    // might do this for performance reasons, but you can override this
    // behaviour with Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES in which
    // case this will always be an empty list of strings.
    for (let name of invalidated) {
        print(`Property ${name} changed`);
    }
});

// This signal is emitted for any other DBus signal the interface emits, so you
// can handle them yourself as you see fit
proxy.connect('g-signal', (proxy, sender_name, signal_name, parameters) => {
    if (signal_name === 'AcceleratorActivated') {
        print(`Accelerator Activated: ${parameters.print(true)}`);
    }
});

// GDBusProxy has a notified GObject property we can watch to know when a
// service has appeared or vanished from the bus, serving the same purpose as a
// name watcher.
proxy.connect('notify::g-name-owner', (proxy, pspec) => {
    if (proxy.g_name_owner === null) {
        print(`${proxy.g_name} has vanished`);
    } else {
        print(`${proxy.g_name} has appeared`);
    }
});

// The only thing you'll gain for methods is not needing to include the name,
// object path or interface name
proxy.call(
    'FocusSearch',
    null,
    Gio.DBusCallFlags.NO_AUTO_START,
    -1,
    null,
    (proxy, res) => {
        try {
            proxy.call_finish(res);
        } catch (e) {
            logError(e);
        }
    }
);

// Start an event loop
let loop = GLib.MainLoop.new(null, false);
loop.run();
```

#### Sub-Classing GDBusProxy

The helpers currently provided by GJS will create `Gio.DBusProxy` instances with
native JavaScript properties and signals from the [`Signals`][signals-module]
module that's included with GJS.

To create a class that behaves like a local GObject, including GProperties and
GSignals, you can subclass `Gio.DBusProxy` and override the default signal
handlers:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;


const GnomeShell = GObject.registerClass({
    GTypeName: 'GnomeShell',
    Implements: [Gio.DBusInterface],
    Properties: {
        'overview-active': GObject.ParamSpec.boolean(
            'overview-active',
            'Overview Active',
            'Whether the Shell overview is open',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'mode': GObject.ParamSpec.string(
            'mode',
            'Mode',
            'The Shell mode',
            GObject.ParamFlags.READABLE,
            null
        ),
        'shell-version': GObject.ParamSpec.string(
            'shell-version',
            'Shell Version',
            'The Shell version',
            GObject.ParamFlags.READABLE,
            null
        )
    },
    Signals: {
        'accelerator-activated': {
            flags: GObject.SignalFlags.RUN_LAST,
            param_types: [GObject.TYPE_OBJECT, GObject.TYPE_VARIANT]
        }
    }
}, class GnomeShell extends Gio.DBusProxy {

    _init(params) {
        super._init(Object.assign({
            g_bus_type: Gio.BusType.SESSION,
            g_name: 'org.gnome.Shell',
            g_object_path: '/org/gnome/Shell',
            g_interface_name: 'org.gnome.Shell',
            g_flags: Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES
        }, params));
    }

    vfunc_g_properties_changed(changed, invalidated) {
        let properties = changed.deep_unpack();

        for (let name of Object.keys(properties)) {
            if (name === 'OverviewActive')
                this.notify('overview-active');

            else if (name === 'Mode')
                this.notify('mode');

            else if (name === 'ShellVersion')
                this.notify('shell-version');

            else
                logError(new Error(`unknown property: ${name}`));
        }
    }

    vfunc_g_signal(sender_name, signal_name, parameters) {
        if (signal_name === 'AcceleratorActivated') {
            this.emit(
                'accelerator-activated',
                parameters.get_child_value(0).get_string()[0],
                parameters.get_child_value(1)
            );
        } else {
            logError(new Error(`unknown signal: ${signal_name}`));
        }
    }

    get overview_active() {
        let value = this.get_cached_property('OverviewActive');

        // If you passed `Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES` in the
        // `g_flags` argument this shouldn't happen, but if you didn't this
        // would be your cue to call the getter on the properties interface.
        if (value === null) {
            return false;
        }

        return value.get_boolean();
    }

    set overview_active(active) {
        this.call(
            'org.freedesktop.DBus.Properties.Set',
            new GLib.Variant('(ssv)', [
                'org.gnome.Shell',
                'OverviewActive',
                GLib.Variant.new_boolean(active)
            ]),
            Gio.DBusCallFlags.NO_AUTO_START,
            -1,
            null,
            (proxy, result) => {
                try {
                    proxy.call_finish(result);
                } catch (e) {
                    logError(e);
                }
            }
        );
    }

    get mode() {
        let value = this.get_cached_property('Mode');

        if (value !== null)
            return value.get_string()[0];

        return null;
    }

    get shell_version() {
        let value = this.get_cached_property('ShellVersion');

        if (value !== null)
            return value.get_string()[0];

        return null;
    }

    // A simple example of a generic Promise wrapper. You could do something
    // similar for the synchronous variant, however the default timeout for DBus
    // methods is a gruesome 25 seconds.
    _methodCall(name, args = [], signature = null, cancellable = null) {
        return new Promise((resolve, reject) => {
            this.call(
                name,
                (signature) ? new GLib.Variant(signature, args) : null,
                Gio.DBusCallFlags.NO_AUTO_START,
                -1,
                cancellable,
                (proxy, result) => {
                    try {
                        let reply = proxy.call_finish(result);
                        let value = null;

                        if (reply.n_children() > 0) {
                            value = reply.get_child_value(0).deepUnpack();
                        }

                        resolve(value);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    // Of course you'd have to do this for each method
    focus_search() {
        return this._methodCall('FocusSearch');
    }
});

// We still need to manually initialize the proxy object after constructing it.
let proxy = new GnomeShell();
proxy.init(null);

// Now we can use the remote properties like local GObject properties
proxy.connect('notify::overview-active', (proxy, pspec) => {
    print(`Property Changed: ${pspec.name} = ${proxy.overview_active}`);
});

// And for fun, step through a few changes
let step = 0;

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
    switch (step++) {
        case 0:
            proxy.overview_active = true;
            return GLib.SOURCE_CONTINUE;

        case 1:
            proxy.overview_active = false;
            return GLib.SOURCE_CONTINUE;

        case 2:
            proxy.focus_search();
            return GLib.SOURCE_CONTINUE;

        default:
            return GLib.SOURCE_REMOVE;
    }
});

// Start an event loop
let loop = GLib.MainLoop.new(null, false);
loop.run();
```

[signals-module]: https://gitlab.gnome.org/GNOME/gjs/blob/master/doc/Modules.md#signals


### High-Level Proxies

The DBus conveniences in GJS are the easiest way to get a client and cover most
use cases. All you need to do is call `Gio.DBusProxy.makeProxyWrapper()` with
the **interface** XML and it will create a reusable `Function` you can use to
create proxies.

Below is a series of JSDoc style annotations describing the various functions:


```js
/**
 * Create a function (as described below) that returns a fully initialized
 * Gio.DBusProxy object populated with the methods, properties and signals
 * described by @interfaceXml.
 *
 * @param {string} interfaceXml - A DBus interface definition
 * @returns {function} - A Re-usable function for creating Gio.DBusProxy objects
 */
Gio.DBusProxy.makeProxyWrapper(interfaceXml) {
}

/**
 * Create and initialize a Gio.DBusProxy object for the interface passed when
 * the function was created.
 *
 * If @asyncCallback is given (as described below), the proxy should not be
 * considered initialized until the callback is invoked successfully. If not
 * given, initialization will be synchronous and the returned `Gio.DBusProxy`
 * object is ready to use unless this function throws an Error.
 *
 * If @cancellable is given it may be used to cancel the operation. The
 * @asyncCallback will still be called if it was provided.
 *
 * If @flags is given, they will be passed to the Gio.DBusProxy constructor. The
 * default is `Gio.DBusProxyFlags.NONE`.
 *
 * @param {Gio.DBusConnection} bus - A message bus connection
 * @param {string} interface - A DBus interface name
 * @param {string} object - A DBus object path
 * @param {function} [asyncCallback] - Optional callback
 * @param {Gio.Cancellable} [cancellable] - Optional cancellable object
 * @param {Gio.DBusProxyFlags} [flags] - Optional flags argument
 * @returns {Gio.DBusProxy} - The constructed DBus proxy
 */
function (bus, interface, object, asyncCallback, cancellable, flags) {
}

/**
 * Callback signature for the @asyncCallback argument of the above function.
 *
 * @param {Gio.DBusProxy} proxy - The source object, or %null on error
 * @param {Error} error - An `Error` object, or %null on success
 */
function (proxy, error=null) {
}
```

Here is an example of how the synchronous variant is used in practice:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

// We'll use our XML definition from earlier as an example
const ifaceXml = `
<node>
  <interface name="io.github.andyholmes.Test">
    <method name="SimpleMethod"/>
    <method name="ComplexMethod">
      <arg type="s" direction="in" name="input"/>
      <arg type="u" direction="out" name="length"/>
    </method>
    <signal name="TestSignal">
      <arg name="type" type="s"/>
      <arg name="value" type="b"/>
    </signal>
    <property name="ReadOnlyProperty" type="s" access="read"/>
    <property name="ReadWriteProperty" type="b" access="readwrite"/>
  </interface>
</node>`;


// Pass the XML string to make function that returns initialized proxies
let createTestProxy = Gio.DBusProxy.makeProxyWrapper(ifaceXml);

// If creating a proxy synchronously, you catch errors normally
try {
    let proxy = createTestProxy(
        Gio.DBus.session,
        'io.github.andyholmes.Test',
        '/io/github/andyholmes/Test'
    );
} catch (e) {
    logError(e);
}
    

// Properties work just like regular JavaScript properties:
print(`ReadOnlyProperty: ${proxy.ReadOnlyProperty}`);
print(`ReadWriteProperty: ${proxy.ReadWriteProperty}`);

proxy.ReadWriteProperty = true;
print(`ReadWriteProperty: ${proxy.ReadWriteProperty}`);

// However, you will still have to watch Gio.DBusProxy::g-properties-changed to
// be notified of changes
proxy.connect('g-properties-changed', (proxy, changed, invalidated) => {
});


// The wrapper function will assign both synchronous and asynchronous variants
// of methods on the object
proxy.SimpleMethodSync();

proxy.ComplexMethodRemote('input string', (returnValue, errorObj, fdList) => {
    
    // If @errorObj is `null`, then the method call succeeded and the variant
    // will already be unpacked with `GLib.Variant.prototype.deepUnpack()`
    if (errorObj === null) {
        print(`ComplexMethod('input string'): ${returnValue}`);
        
        // Methods that return file descriptors are fairly rare, so you will
        // know if you should expect one or not. Consult the API documentation
        // for `Gio.UnixFDList` for more information.
        if (fdList !== null) {
        }
        
        // If you were wrapping this function call in a Promise, this is where
        // you would call `resolve()`
    
    // If there was an error, then @returnValue will be an empty list and
    // @errorObj will be an Error object
    } else {
        logError(errorObj);
        
        // If you were wrapping this function call in a Promise, this is where
        // you would call `reject()`
    }
});


// Signals are connected and disconnected with the functions `connectSignal()`
// and `disconnectSignal()`, so they don't conflict with the GObject methods.
let handlerId = proxy.connectSignal('TestSignal', (proxy, arg1, arg2) => {
    print(`TestSignal: ${arg1}, ${arg2}`);

    proxy.disconnectSignal(handlerId);
};

// Start an event loop
let loop = GLib.MainLoop.new(null, false);
loop.run();
```

For demonstration purposes, here is an example of how you might wrap the
asychronous constructor and method calls in a Promise:

```js
// Since this is our interface, we know which bus, name and object path to
// expect it on, but you could add arguments for any of those if necessary.
function createTestProxyAsync(cancellable = null, flags = Gio.DBusProxyFlags.NONE) {
    return new Promise((resolve, reject) => {
        createTestProxy(
            Gio.DBus.session,
            'io.github.andyholmes.Test',
            '/io/github/andyholmes/Test'
            (proxy, error) => {
                if (error === null) {
                    resolve(proxy);
                } else {
                    reject(error);
                }
            },
            cancellable,
            flags
        );
    });
}
```


## Services

There are a number of reasons why exporting services over DBus can be useful for
an application developer. It can help you establish a client-server architecture
to separate the backed from the front-end, but more importantly it can provide a
language agnostic entry point for your application.

To get a clear view of how exporting DBus services works in GJS, we're going to
start at a pretty low-level by using the `DBusImplementation` class found in
the `GjsPrivate` module.


### Owning a Name

The first thing we're going to cover is how to acquire a **well-known name** on
a message bus and at what point you will want to actually export your service.
This is similar to watching a name:

```js
'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;


// These three functions are the callbacks to `Gio.bus_own_name_on_bus()`:

// If there is a client waiting for the well-known name to appear on the bus so
// it can create proxies for the interfaces, you probably want to export your
// interfaces here so they are already available when the name appears.
function onBusAcquired(connection, name) {
    print(`${name}: connection acquired`);
}

// On the other hand, if you were using something like GDBusObjectManager to
// watch for interfaces, you might export your interfaces here using the methods
// of your GDBusObjectManagerServer instance.
function onNameAcquired(connection, name) {
    print(`${name}: name acquired`);
}

// Typically you won't see this method invoked. The only situations this might
// happen is if you tried to own a name that was already owned by someone else
// like `org.gnome.Shell` or if the DBus connection was closed (very rare).
function onNameLost(connection, name) {
    print(`${name}: name lost`);
}

// Just like a signal handler ID, the `Gio.bus_own_name()` function returns a
// unique ID we can use to unown the name when we're done with it.
let ownerId = Gio.bus_own_name(
    Gio.BusType.SESSION,
    'io.github.andyholmes.Test',
    Gio.BusNameOwnerFlags.NONE,
    onBusAcquired,
    onNameAcquired,
    onNameLost
);

// We'll wait a few seconds then unown the name. Notice `onNameLost()` is NOT
// invoked in this case. If you were wrapping the service in a class structure
// you would probably call this function in a `destroy()` method of that class.
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
    print('io.github.andyholmes.Test: unowning name');
    Gio.bus_unown_name(ownerId);
});

// Start the event loop
let loop = GLib.MainLoop.new(null, false);
loop.run();
```

Expected output:

```
io.github.andyholmes.Test: session bus acquired
io.github.andyholmes.Test: name acquired
io.github.andyholmes.Test: unowning name
```

Expected out if you tried to own an existing name:

```
org.gnome.Shell: session bus acquired
org.gnome.Shell: name lost
org.gnome.Shell: unowning name
```

Just like watching names, there is function for owning names on a given
**bus connection**, which may be useful if you need to export an interface on a
dedicated connection:

```js
// Since we're passing an existing connection to there is no callback for when
// the bus is acquired.
function onNameAcquired(connection, name) {
    print(`${name}: name acquired`);
}

function onNameLost(connection, name) {
    print(`${name}: name lost`);
}

// This function returns the same kind of handler ID as `Gio.bus_own_name()` and
// is passed to the same function, `Gio.bus_unown_name()`, to release it.
let ownerId = Gio.bus_own_name_on_connection(
    Gio.DBus.session,
    'io.github.andyholmes.Test',
    Gio.BusNameOwnerFlags.NONE,
    acquiredFunc,
    lostFunc
);
```

### Low-Level Interfaces

To get a clear view of how exporting DBus services works in GJS, we're going to
start at a pretty low-level by using the `DBusImplementation` class found in
the `GjsPrivate` module. Although this class really hasn't changed since it was
first written, it's technically a private class so you probably shouldn't rely
on it to maintain a stable public API.

The usual approach in C (if not using [`gdbus-codegen`][gdbus-codegen]) would be
to use [`Gio.DBusInterfaceSkeleton`][gdbusinterfaceskeleton] and create a
`GDBusInterfaceVTable` with pointers to your method and property getter/setter
handlers. However, being a bare `struct` this is generally not possible in
binding languages, so the `DBusImplementation` class does this for you and emits
three signals you can connect to:

`DBusImplementation::handle-method-call`
: This is emitted when a client invokes a method on your DBus interface.
  Implementing this is a reasonable amount of work, especially you're planning
  to cover all possible use-cases (like passing UNIX file descriptors).
   
`DBusImplementation::handle-property-get`
: This is emitted when a client requests the value of a DBus property, and you
  will be expected to pack any native JavaScript values into a `GVariant`
  before returning it.
   
`DBusImplementation::handle-property-set`
: This is emitted when a client requests to set the value of a DBus property,
  so you'll probably want to unpack the `GVariant` and maybe do some extra
  validation on the value.

It also provides two helpers functions not present in `GDBusInterfaceSkeleton`:

`DBusImplementation.prototype.emit_signal(name, argsVariant)`
: This is pretty straight-forward; just pack the `GVariant` tuple for the
  signal arguments and pass it along with the signal name to emit the signal.
   
`DBusImplementation.prototype.emit_property_changed(name, valueVariant)`
: Similar to the above, but with the benefit that property changes are grouped
  in an idle callback and emitted all at once when possible.

Okay, let's go through an example. Since there's not much to gain by doing this
if you're going to wrap a native JavaScript object, we'll subclass and create a
full-blown GObject:

```js
const GjsPrivate = imports.gi.GjsPrivate;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;


// Unlike proxies, this is required for GDBusInterfaces in GJS
const ifaceXml = `
<node>
  <interface name="io.github.andyholmes.Test">
    <method name="SimpleMethod"/>
    <method name="ComplexMethod">
      <arg type="s" direction="in" name="input"/>
      <arg type="u" direction="out" name="length"/>
    </method>
    <property name="ReadOnlyProperty" type="s" access="read"/>
    <property name="ReadWriteProperty" type="b" access="readwrite"/>
    <signal name="TestSignal">
      <arg name="type" type="s"/>
      <arg name="value" type="b"/>
    </signal>
  </interface>
</node>`;

// We need to compile the XML into a GDBusInterfaceInfo.
const dbusIfaceInfo = Gio.DBusInterfaceInfo.new_for_xml(ifaceXml);


const TestInterface = GObject.registerClass({
    GTypeName: 'TestInterface',
    Implements: [Gio.DBusInterface],
    Properties: {
        'ReadOnlyProperty': GObject.ParamSpec.string(
            'ReadOnlyProperty',
            'Example Property One',
            'An example string argument',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'ReadWriteProperty': GObject.ParamSpec.boolean(
            'ReadWriteProperty',
            'Example Property Two',
            'An example boolean argument',
            GObject.ParamFlags.READWRITE,
            false
        )
    },
    Signals: {
        'TestSignal': {
            flags: GObject.SignalFlags.RUN_FIRST,
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN]
        }
    }
}, class TestInterface extends GjsPrivate.DBusImplementation {

    _init(params = {}) {
        super._init(params);
        
        // Because the signals emitted by GjsPrivate.DBusImplementation don't
        // have default handlers, we have to explicitly connect to them instead
        // of overriding them with vfunc_*() methods.
        //
        // There is no need to use Function.prototype.bind() here however,
        // because GObject signals have the instance as the first argument.
        this.connect('handle-method-call', this._handleMethodCall);
        this.connect('handle-property-get', this._handlePropertyGet);
        this.connect('handle-property-set', this._handlePropertySet);
    }
    
    // This is a pretty basic implementation of a method call handler. It only
    // uses deepUnpack() on the arguments before calling the local method and
    // doesn't support file descriptor lists.
    //
    // You can use the @invocation argument to get the `Gio.DBusMessage` object
    // of the call to DBus or other information.
    //
    // An option not supported by the current GJS interface wrapper is making
    // the method call handler an `async` function, allowing you to use `await`
    // and support Promise returns on the service side
    async _handleMethodCall(iface, name, parameters, invocation) {
        // REMINDER: we're going to use @iface in place of `this`
        
        let retval;

        try {
            let inArgs = parameters.deepUnpack();

            // As with all members, @name will be exactly as defined in your
            // interface definition; usually DBus case like `SomeMethod` rather
            // than `someMethod` or `some_method`. If the local members are not
            // in the same case, you will have to account for that yourself.
            //
            // Because @parameters will be a tuple unpacked to an Array, we can
            // just use Function.prototype.apply() and pass @iface as `thisArg`.
            // If you chose to make this an `async` method, you can use `await`
            retval = await iface[name].apply(iface, inArgs);
        } catch (e) {
            // If the error is a GLib.Error instance, we can just return that...
            if (e instanceof GLib.Error) {
                invocation.return_gerror(e);
                
            // ...but if it was a JavaScript Error instance, we need to do some
            // more work to prepare it for DBus
            } else {
                if (e.name.includes('.')) {
                    e.name = `org.gnome.gjs.JSError.${e.name}`;
                }

                invocation.return_dbus_error(e.name, e.message);
            }

            // Since we have no return value and we've already returned the
            // error, we can return now.
            return;
        }

        // Since the local call succeeded, we now need to prepare a reply value
        try {
            // A method with no return value (`undefined` in JavaScript) is an
            // empty tuple in DBus
            if (retval === undefined) {
                retval = new GLib.Variant('()', []);
                
            // Otherwise, we'll need to construct a type string so we can pack
            // the return value correctly
            } else {
                // We can use the GDBusInterfaceInfo to introspect the method
                let ifaceInfo = iface.get_info();
                let methodInfo = iface.lookup_method(name);
                
                // Concatenate the signatures of each out argument (eg. 'su')
                let outArgs = methodInfo.out_args;
                let outTypes = outArgs.map(arg => arg.signature).join('');
                
                // A method with multiple return values should already return an
                // Array (eg. `return ['string', 42];`), while a single value
                // will need to be wrapped in an Array
                retval = new GLib.Variant(
                    `(${outTypes})`,
                    (outArgs.length > 1) ? retval : [retval]
                );
            }

            // And finally, we send the method return value over DBus
            invocation.return_value(retval);

        // If something goes wrong packing the `GVariant` we need to return an
        // error, otherwise the client will wait for the call to timeout (25
        // seconds by default).
        } catch (e) {
            invocation.return_dbus_error(
                'org.gnome.gjs.JSError.ValueError',
                'Service implementation returned an incorrect value type'
            );
        }
    }
    
    _handlePropertyGet(iface, name) {
        // REMINDER: we're going to use @iface in place of `this`
        
        // As above, you may have to account for the case of @name
        let nativeValue = iface[name];
        
        // We can use the GDBusInterfaceInfo to introspect the GVariantType
        let ifaceInfo = iface.get_info();
        let propertyInfo = info.lookup_property(name);
        
        // If something goes wrong while fetching the local property value or
        // packing it into a GVariant, we should return `null`.
        let returnValue = null;
        
        try {
            returnValue = new GLib.Variant(propertyInfo.signature, nativeValue);
        } catch (e) {
            logError(e);
        }
        
        return returnValue;
    }
    
    _handlePropertySet(iface, name, value) {
        // REMINDER: we're going to use @iface in place of `this`
        
        // It's an implementation detail for you to handle when deciding how
        // deeply you need to unpack the value. For most use-cases deepUnpack()
        // should be enough, or you can also have your properties defined with
        // `GObject.param_spec_variant()`.
        let nativeValue = value.deepUnpack();
        
        // As above, you may have to account for the case of @name
        iface[name] = nativeValue;
    }
    
    // Here we're going to override the default GObject::notify handler, so when
    // a property changes all we have to do is call GObject.notify() and it will
    // automatically be forwarded it to remote clients. This will also work with
    // `GObject.Object.bind_property()`, `Gio.Settings.bind()` and other such
    // functions that use this signal.
    //
    // If you don't plan on using the object locally in that way, you may want
    // to just do this in the ::handle-property-set callback to avoid repacking
    // the variant.
    vfunc_notify(pspec) {
        let ifaceInfo = this.get_info();
        let propertyInfo = ifaceInfo.lookup_property(pspec.name);
        
        // We might not be exporting all properties on this object
        if (propertyInfo !== null) {
            try {
                let value = new GLib.Variant(
                    propertyInfo.signature,
                    this[pspec.name]
                );
                this.emit_property_changed(pspec.name, value);
            } catch (e) {
                logError(e, 'Emitting DBus property change');
            }
        }
        
        super.vfunc_notify(pspec);
    }
    
    // It is especially important for DBus interfaces to have a default or
    // fallback return value of the proper type.
    //
    // Remember that there is no `null` value in DBus. Properties with String
    // values should return an empty string `''`, while Arrays and Objects
    // (eg. `as` or `a{sv}`) can return `[]` and `{}` respectively.
    get ReadOnlyProperty() {
        if (this._readOnlyProperty === undefined ||
            typeof this._readOnlyProperty !== 'string') {
            return '';
        }
        
        return 'a string';
    }

    get ReadWriteProperty() {
        if (this._readWriteProperty === undefined ||
            typeof this._readWriteProperty !== 'boolean') {
            return false;
        }

        return this._readWriteProperty;
    }

    set ReadWriteProperty(value) {
        // You may want to do extra type checking here, if that makes sense
        if (this._readWriteProperty !== value) {
        
            // Once we've updated the property we'll emit GObject::notify to
            // notify both local and remote listeners.
            this._readWriteProperty = value;
            this.notify('ReadWriteProperty');
        }
    }

    // WARNING: the convenience interface wrapper in GJS does NOT support this!
    //
    // If your ::handle-method-call callback supports Promise returns, you can
    // can do blocking work using the standard approach for wrapping GTask
    // functions without multiple clients hanging your service.
    SimpleMethod() {
        // NOTE: this will be printed to stdout on the service side, not the
        //       client side.
        print('SimpleMethod() invoked');
    }

    ComplexMethod(input) {
        print(`ComplexMethod() invoked with '${input}'`);
        
        return new Promise((resolve, reject) => {
            let file = Gio.File.new_for_path(input);
            
            file.load_contents_async(null, (file, res) => {
                try {
                    let [ok, contents, etag] = file.read_contents_finish(res);
                    
                    resolve(contents.length);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
    
    // Here's an explicit signal emitter
    emitTestSignal(one, two) {
        // Here's the native GObject emitter
        this.emit('TestSignal', one, two);
        
        // And here's the DBus emitter
        try {
            let value = new GLib.Variant('(sb)', [one, two]);
            this.emit_signal('TestSignal', value);
        } catch (e) {
            logError(e, 'Emitting DBus signal "TestSignal"');
        }
    }
    
    // And here's another way we might deal with signals; similar to what we did
    // with GObject::notify. You would probably just do this in GObject._init()
    // and then we'd only have to call `GObject.emit()`.
    connectDBusSignals() {
        let ifaceInfo = this.get_info();
        
        for (let signal of ifaceInfo.signals) {
            this.connect(signal.name, (obj, ...args) => {
                try {
                    let sigs = signal.args.map(arg => arg.signature).join('');
                    let value = new GLib.Variant(`(${sigs})`, args);
                    
                    this.emit_signal(signal.name, value);
                } catch (e) {
                    logError(e, `Emitting DBus signal "${signal.name}"`);
                }
            });
        }
    }
});

// Now creating an instance of our service is pretty straight-forward
let testService = new TestService({
    g_interface_info: info
});


// Once we're all connected up we can export the interface on a connection at
// a bus path.
iface.export(Gio.DBus.session, '/io/github/andyholmes/Test');

// As previously mentioned, you'll usually own a name at this point, *after* the
// interface is exported, in case clients are waiting for a well-known name to
// appear or the name owner to appear.
//
// Conversely, you will usually unown the name before unexporting the interface
// from a connection so that client know they should expect further calls to the
// interface to fail.

// You can unexport the name from a specific connection or, if for some reason
// you have exported the interface on more than one, all connections at once.
iface.unexport_from_connection(Gio.DBus.session);
iface.unexport();
```

[gdbus-codegen]: https://developer.gnome.org/gio/stable/gdbus-codegen.html
[gdbusinterfaceskeleton]: https://gjs-docs.gnome.org/#q=gio.dbusinterfaceskeleton

### High-Level Interfaces

Now the easy way.

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

// We'll use our XML definition from earlier as an example
const ifaceXml = `
<node>
  <interface name="io.github.andyholmes.Test">
    <method name="SimpleMethod"/>
    <method name="ComplexMethod">
      <arg type="s" direction="in" name="input"/>
      <arg type="u" direction="out" name="length"/>
    </method>
    <signal name="TestSignal">
      <arg name="type" type="s"/>
      <arg name="value" type="b"/>
    </signal>
    <property name="ReadOnlyProperty" type="s" access="read"/>
    <property name="ReadWriteProperty" type="b" access="readwrite"/>
  </interface>
</node>`;

class Service {
    constructor() {
    }

    // Properties
    get ReadOnlyProperty() {
        return 'a string';
    }

    get ReadWriteProperty() {
        if (this._readWriteProperty === undefined)
            return false;

        return this._readWriteProperty;
    }

    set ReadWriteProperty(value) {
        this._readWriteProperty = value;
    }

    // Methods
    SimpleMethod() {
        print('SimpleMethod() invoked');
    }

    ComplexMethod(input) {
        print(`ComplexMethod() invoked with '${input}'`);

        return input.length;
    }
}

// Note that when using the DBus conveniences in GJS, our JS Object instance is
// separate from the interface GObject instance.
let serviceObject = new Service();
let serviceIface = null;

function onBusAcquired(connection, name) {
    serviceIface = Gio.DBusExportedObject.wrapJSObject(ifaceXml, this);
    serviceIface.export(connection, '/io/github/andyholmes/Test');
}

function onNameAcquired(connection, name) {
    // Clients will typically start connecting and using your interface now.
}

function onNameLost(connection, name) {
    // Well behaved clients will know not to be calling methods on your
    // interface now.
}

let ownerId = Gio.bus_own_name(
    Gio.BusType.SESSION,
    'io.github.andyholmes.Test',
    Gio.BusNameOwnerFlags.NONE,
    onBusAcquired.bind(serviceObject),
    onNameAcquired,
    onNameLost
);

// Start an event loop
let loop = GLib.MainLoop.new(null, false);
loop.run();
```


## GNOME APIs

There are a number of APIs in the GNOME platform that can make use of DBus, but
we'll just be covering `GActions` and `GMenus`. See the *HowDoI Guides* in the
GNOME Wiki for [`GActions`][gaction-howdoi] and [`GMenus`][gmenu-howdoi] for a
more complete overview of these APIs.

[gaction-howdoi]: https://wiki.gnome.org/HowDoI/GAction
[gmenu-howdoi]: https://wiki.gnome.org/HowDoI/GMenu


### GAction

[`Gio.Action`][gaction] is actually a GObject Interface that can be implemented
by objects, but you will almost always use [`Gio.SimpleAction`][gsimpleaction].
There are basically two types of actions: a functional type that emits a signal
when activated and stateful actions that hold some kind of value.

`Gio.Action` are usually added to objects that implement `GActionGroup` and
possibly also `GActionMap`; both are implemented by `Gio.SimpleActionGroup`.

```js
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


// This is the most basic an action can be. It has a name and can be activated
// with no parameters, which results in the callback being invoked.
let basicAction = new Gio.SimpleAction({
    name: 'basicAction'
});

basicAction.connect('activate', (action, parameter) => {
    print(`${action.name} activated!`);
});

// An action with a parameter
let paramAction = new Gio.SimpleAction({
    name: 'paramAction',
    parameter_type: new GLib.VariantType('s')
});

paramAction.connect('activate', (action, parameter) => {
    print(`${action.name} activated: ${parameter.unpack()}`);
});

// And a stateful action. The state type is set at construction from the initial
// value, and can't be changed afterwards.
let stateAction = new Gio.SimpleAction({
    name: 'stateAction',
    state: GLib.Variant.new_boolean(true)
});

stateAction.connect('notify::state', (action, pspec) => {
    print(`${action.name} changed: ${action.state.print(true)}`);
});


// Adding them to a group
let actionGroup = new Gio.SimpleActionGroup();
actionGroup.add_action(basicAction);
actionGroup.add_action(parameterAction);
actionGroup.add_action(stateAction);


// Here is how you export (and unexport) action groups over DBus
let connection = Gio.DBus.session;

let groupId = connection.export_action_group(
    '/io/github/andyholmes/Test',
    actionGroup
);

connection.unexport_action_group(groupId);
```

One the client-side you can use [`Gio.DBusActionGroup`][gdbusactiongroup] as a
simple way to watch for new and removed actions, state changes and the enabled
or disabled state of each:


```js
const Gio = imports.gi.Gio;


// Getting a client which implements the GActionGroup interface, but not the
// GActionMap interface. In other words you can not add, remove or change the
// enabled state of actions remotely, but you can watch for these events and
// activate the actions.
let remoteGroup = Gio.DBusActionGroup.get(
    Gio.DBus.session,
    'io.github.andyholmes.Test',
    '/io/github/andyholmes/Test'
);

// Watching the group for changes
remoteGroup.connect('action-added', (group, action_name) => {
});

remoteGroup.connect('action-removed', (group, action_name) => {
});

remoteGroup.connect('action-enabled-changed', (group, action_name, enabled) => {
});

remoteGroup.connect('action-state-changed', (group, action_name, state) => {
});

// Activating and changing the state of actions.
remoteGroup.activate_action('basicAction', null);
remoteGroup.activate_action('paramAction', new GLib.Variant('s', 'string'));
remoteGroup.change_action_state('stateAction', new GLib.Variant('b', false));
```

The more convenient use of remote action groups is to integrate and use them in
a Gtk application:

```js
imports.gi.versions.Gtk = '3.0';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;


Gtk.init(null);

let window = new Gtk.Window({
    title: 'GJS GAction Example',
    default_width: 320,
    default_height: 240
});
window.connect('delete-event', () => Gtk.main_quit());

let box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    margin: 12,
    spacing: 12,
    visible: true
});
window.add(box);

// You can insert the action group into any Gtk.Widget, and Gtk will search
// upwards in the hierarchy for the group.
let remoteGroup = Gio.DBusActionGroup.get(
    Gio.DBus.session,
    'io.github.andyholmes.Test',
    '/io/github/andyholmes/Test'
);
window.insert_action_group('test', remoteGroup);

// We can now refer to our action group using the name we chose when inserting
// it and the action name chosen at construction
let button = new Gtk.Button({
    label: 'Click Me!',
    action_name: 'test.paramAction',
    action_target: new GLib.Variant('s', 'foobar'),
    visible: true
});
box.add(button);

let check = new Gtk.CheckButton({
    label: 'Toggle Me!',
    action_name: 'test.stateAction',
    visible: true
});
box.add(check);

// We're using Gtk so we need to run its event loop, instead of GLib's
window.present();
Gtk.main();
```

[gaction]: https://gjs-docs.gnome.org/#q=gio.action
[gsimpleaction]: https://gjs-docs.gnome.org/#q=gio.simpleaction
[gdbusactiongroup]: https://gjs-docs.gnome.org/#q=gio.dbusactiongroup


### GMenu

[`GMenuModel`][gmenumodel] is another GObject Interface for defining ordered,
nested groups of menu items, sections and submenus. The defacto implemention of
this interface is [`GMenu`][gmenu].

Unlike `GAction`, menu models contain presentation information like labels and
icon names. It's also possible to define menu models in XML UI files, but we're
only going to cover the basic API usage in GJS here because we're really just
covering this for DBus usage.

```js
const Gio = imports.gi.Gio;

// Here we're creating the top-level menu. Submenus and sections can be created
// the same way and can be added to a parent menu with `append_submenu()` and
// `append_section()`.
let menuModel = new Gio.Menu();


// For the most common use case you can simply use Gio.Menu.prototype.append()
menuModel.append('Basic Item Label', 'test.basicAction');


// In cases you need the `Gio.MenuItem` instance to add more attributes, you
// can build an item manually. Notice that the second argument is a "detailed"
// action string, which can handle some simple types inline. Consult the
// documentation for how these can be used.
let paramItem = Gio.MenuItem.new('Parameter Item', 'test.paramAction::string');

// Icons are `Gio.Icon` instances, an abtraction of icons that is serialized as
// a `a{sv}` variant when sent over DBus. Note that it's up to the client-side
// to actually do something useful with this.
let paramIcon = new Gio.ThemedIcon({
    name: 'dialog-information-symbolic'
});

paramItem.set_icon(paramIcon);

// Once we add the item to the menu, making changes to the `paramItem` instance
// or the GIcon won't affect the menu in any way.
menuModel.append_item(paramItem);


// A number of the Gtk Widgets that are built from GMenuModels can automatically
// handle simple action types like stateful actions with booleans. This item
// will be turned into a Gtk.CheckButton for us.
let stateItem = Gio.MenuItem.new('State Item', 'test.stateAction');
menuModel.append_item(stateItem);


// Export and unexport a menu just like GActionGroup
let connection = Gio.DBus.session;

let menuId = connection.export_menu_model(
    '/io/github/andyholmes/Test',
    menuModel
);

connection.unexport_menu_model(menuId);
```

Now, assuming we have a remote process exporting both the action group and menu
model from above, we can get clients for both and populate a menu:

```js
imports.gi.versions.Gtk = '3.0';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;


Gtk.init(null);

let window = new Gtk.Window({
    title: 'GJS GMenu Example',
    default_width: 320,
    default_height: 240
});
window.connect('delete-event', () => Gtk.main_quit());

// As before, we'll insert the action group
let remoteGroup = Gio.DBusActionGroup.get(
    Gio.DBus.session,
    'io.github.andyholmes.Test',
    '/io/github/andyholmes/Test'
);
window.insert_action_group('test', remoteGroup);

// Get the remote menu model
let remoteMenu = Gio.DBusMenuModel.get(
    Gio.DBus.session,
    'io.github.andyholmes.Test',
    '/io/github/andyholmes/Test'
);

// And now we'll add a menu button to a header bar with our menu model
let headerBar = new Gtk.HeaderBar({
    title: 'GJS GMenu Example',
    show_close_button: true,
    visible: true
});
window.set_titlebar(headerBar);

let menuButton = new Gtk.MenuButton({
    image: new Gtk.Image({
        icon_name: 'open-menu-symbolic'
    }),
    menu_model: remoteMenu,
    visible: true
});
headerBar.pack_end(menuButton);

// Show the window and start the event loop
window.present();
Gtk.main();
```

[gmenu]: https://gjs-docs.gnome.org/#q=gio.menu
[gmenumodel]: https://gjs-docs.gnome.org/#q=gio.menumodel
[gdbusmenumodel]: https://gjs-docs.gnome.org/#q=gio.dbusmenumodel

