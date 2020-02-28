---
layout: article
title: Evolution Contacts in GJS
date: 2019-12-16
tags: [gjs]
---

This is an overview of basic interaction with Evolution Data Server in GJS,
specifically covering Address Books and Contacts for a read-only use case. It
will allow you access to contacts in the local address book, Evolution and GNOME
Online Account.

While [Folks][folks] can aggregrate and sort duplicate contacts from
[Evolution Data Server][evolution], [Telepathy][telepathy] and other sources, it
doesn't work well (or at all) in most language bindings. Although, if you're
writing an application in [Vala][vala] or even C, it might be the better choice.

You can find the API documentation for GJS at <https://gjs-docs.gnome.org/>.

[folks]: https://wiki.gnome.org/Projects/Folks
[evolution]: https://wiki.gnome.org/Apps/Evolution
[telepathy]: https://telepathy.freedesktop.org/
[vala]: https://wiki.gnome.org/Projects/Vala

## Table of Contents

1. [The Registry](#the-registry)
2. [Sources and Extensions](#sources-and-extensions)
3. [Querying Contacts](#querying-contacts)
   * [Query Strings](#query-strings)
4. [Working with Contacts](#working-with-contacts)
   * [Basic Fields](#basic-fields)
   * [Complex Fields](#complex-fields)
   * [Photos](#photos)
5. [Watching for Changes](#watching-for-changes)
   * [Address Books](#address-books)
   * [Contacts](#contacts)

## The Registry

Evolution Data Server is most often used as a manager of various data sources
like contacts and calendars or even custom defined source types.

The first thing we want to do is get a [`ESourceRegistry`][esourceregistry]
instance that we can use to query the different data sources known to Evolution:

```js
// This is the import for working with Evolution Data Server and Sources
const EDataServer = imports.gi.EDataServer;

/**
 * Get the ESourceRegistry singleton for the data server. If @cancellable is
 * given it can be used to cancel the operation before it completes.
 *
 * @param {Gio.Cancellable} [cancellable] - optional Gio.Cancellable object
 * @returns {EDataServer.SourceRegistry} - the source registry singleton
 */
function getESourceRegistry(cancellable = null) {
    return new Promise ((resolve, reject) => {
        EDataServer.SourceRegistry.new(cancellable, (registry, res) => {
            try {
                resolve(EDataServer.SourceRegistry.new_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}
```

Once we have the registry singleton (a unique, global instance) we can query the
data server for Address Books known to the registry:

```js
'use strict';

const EDataServer = imports.gi.EDataServer;
const GLib = imports.gi.GLib;

// We need an event loop running
let loop = GLib.MainLoop.new(null, false);


function getESourceRegistry(cancellable = null) {
    return new Promise ((resolve, reject) => {
        EDataServer.SourceRegistry.new(cancellable, (registry, res) => {
            try {
                resolve(EDataServer.SourceRegistry.new_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function printAddressBooks() {
    try {
        let registry = await getESourceRegistry();
        
        // Print the name of the default address book
        let book = registry.default_address_book;
        log(`Default Address Book: ${book.get_display_name()}`);
        
        // Print the name of each address book. Since we're only interested in
        // contacts, we'll pass that type to filter the results.
        let sourceType = EDataServer.SOURCE_EXTENSION_ADDRESS_BOOK;
        
        for (let source of registry.list_sources(sourceType)) {
            log(`Address Book: ${source.get_display_name()}`);
        }
    } catch (e) {
        logError(e);
    } finally {
        loop.quit();
    }
}

printAddressBooks();
loop.run();
```

Expected output is something like this:

```sh
Gjs-Message: 17:28:22.338: JS LOG: Default Address Book: Personal
Gjs-Message: 17:28:22.339: JS LOG: Address Book: Contacts
Gjs-Message: 17:28:22.339: JS LOG: Address Book: Personal
```


[esourceregistry]: https://gjs-docs.gnome.org/#q=sourceregistry


## Sources and Extensions

Now that we know how to get a list of address book sources, we should explain
what an [`ESource`][esource] is. In the example above we printed the display
name of each source, but that didn't tell us much about the address books.

`ESources` have a parent-child relationship and each `ESource` may implement one
or more `ESourceExtension`. For example, an `ESource` representing a calendar
may implement `ESourceCalendar` for the calendar data and `ESourceAlarms` to
track and notify about events. That calendar source will probably be the child
of an `ESource` that implements `ESourceCollection`.

Google is a good example of a provider that offers a collection of services like
e-mail, contacts and calendars. A Google `ESource` implements a number of
extensions like `ESourceCollection` and [`ESourceGoa`][esourcegoa] (GNOME Online
Account), while each of its child sources will implement extensions appropriate
for their service like `ESourceMail`, `ESourceCalendar` and so on.

Enumerating all the possible source types and extensions they can implement is
out of the scope of this document, but below is a simple example of how you can
explore the `ESource` tree to get more information:


```js
async function printAddressBooks() {
    try {
        let registry = await getESourceRegistry();
        
        // We're still only explicitly interested in contacts
        let sourceType = EDataServer.SOURCE_EXTENSION_ADDRESS_BOOK;
        
        for (let source of registry.list_sources(sourceType)) {
            let sourceName = source.get_display_name();
            
            // Get the ESourceAddressBook extension, which happens to also
            // implement ESourceBackend, so we can get the backend name
            let bookSource = source.get_extension(sourceType);
            let backendName = bookSource.get_backend_name();
            
            // If the source has a parent, we can get more information about it
            let parentUid = source.get_parent();
            
            if (parentUid) {
                let parentSource = registry.ref_source(parentUid);
                let parentName = parentSource.get_display_name();
                
                // We could check if the parent is a GNOME Online Account or
                // implements other extensions and get more data about it...
                if (parentSource.has_extension(EDataServer.SOURCE_EXTENSION_GOA)) {
                    let goa = source.get_extension(EDataServer.SOURCE_EXTENSION_GOA);
                }
                
                log(`Address Book: [${backendName}] ${sourceName} (${parentName})`);
                
            // Otherwise just print the address book name
            } else {
                log(`Address Book: [${backendName}] ${sourceName}`);
            }
        }
    } catch (e) {
        logError(e);
    } finally {
        loop.quit();
    }
}
```

Expected output is something like the following:

```sh
Gjs-Message: 20:54:27.229: JS LOG: Address Book: [google] Contacts (your.name@gmail.com)
Gjs-Message: 20:54:27.229: JS LOG: Address Book: [local] Personal (On This Computer)
```


[esource]: https://gjs-docs.gnome.org/#q=edataserver.source
[esourcegoa]: https://gjs-docs.gnome.org/#q=edataserver.sourcegoa


## Querying Contacts

It's important to understand that each `ESource` is only a description of a
data source. Evolution Data Server operates primarily as a DBus server and the
classes we use as a consumer of data are DBus clients for querying that server.

We can get an [`EBookClient`](ebookclient) for one of our address books
asynchronously with the following Promise-wrapped function:

```js
// This is the import for working with EBooks
const EBook = imports.gi.EBook;

/**
 * Get an EBookClient for @source. If @cancellable is given it can be used to
 * cancel the operation before it completes.
 *
 * @param {EDataServer.Source} source - an EDataServer.Source
 * @param {Gio.Cancellable} [cancellable] - optional Gio.Cancellable object
 * @returns {EBook.BookClient} - a client
 */
function getEBookClient(source, cancellable = null) {
    return new Promise((resolve, reject) => {
        EBook.BookClient.connect(source, 0, cancellable, (source, res) => {
            try {
                resolve(EBook.BookClient.connect_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}
```

While this function can be used to asynchronously fetch a list of contacts
matching a query:

```js
// This is the import for working with EContacts
const EBookContacts = imports.gi.EBookContacts;

/**
 * Get a list of EBookContacts.Contact objects matching @query. If @query is not
 * given all contacts will be matched. If @cancellable is given it can be used
 * to cancel the operation before it completes.
 *
 * @param {EBook.BookClient} client - an EBook.BookClient
 * @param {string} [query] - an optional query string
 * @param {Gio.Cancellable} [cancellable] - optional Gio.Cancellable object
 * @returns {EBookContacts.Contact[]} - a list of EContact objects
 */
function getEContacts(client, query = '', cancellable = null) {
    return new Promise((resolve, reject) => {
        client.get_contacts(query, cancellable, (client, res) => {
            try {
                resolve(client.get_contacts_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}
```

Okay, lets start by just printing a list of contact names in each address book:

```js
'use strict';

const EDataServer = imports.gi.EDataServer;
const EBook = imports.gi.EBook;
const EBookContacts = imports.gi.EBookContacts;
const GLib = imports.gi.GLib;

// We need an event loop running
let loop = GLib.MainLoop.new(null, false);


function getESourceRegistry(cancellable = null) {
    return new Promise ((resolve, reject) => {
        EDataServer.SourceRegistry.new(cancellable, (registry, res) => {
            try {
                resolve(EDataServer.SourceRegistry.new_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function getEBookClient(source, cancellable = null) {
    return new Promise((resolve, reject) => {
        EBook.BookClient.connect(source, 0, cancellable, (source, res) => {
            try {
                resolve(EBook.BookClient.connect_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function getEContacts(client, query = '', cancellable = null) {
    return new Promise((resolve, reject) => {
        client.get_contacts(query, cancellable, (client, res) => {
            try {
                resolve(client.get_contacts_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function printContacts() {
    try {
        let registry = await getESourceRegistry();
        
        // Get the first address book
        let sourceType = EDataServer.SOURCE_EXTENSION_ADDRESS_BOOK;
        let source = registry.list_sources(sourceType)[0];
        
        for (let source of registry.list_sources(sourceType)) {
            log(`Address Book: ${source.get_display_name()}`);
            
            let client = await getEBookClient(source);
            let contacts = await getEContacts(client);
            
            if (contacts.length) {
                for (let contact of contacts) {
                    log(`    ${contact.full_name || 'NO NAME'}`);
                }
            } else {
                log('    No Contacts');
            }
        }
    } catch (e) {
        logError(e);
    } finally {
        loop.quit();
    }
}

printContacts();
loop.run();
```

Expected output is something like this:

```sh
Gjs-Message: 22:42:45.260: JS LOG: Address Book: Contacts
Gjs-Message: 22:42:45.765: JS LOG:     Katie Holmes
Gjs-Message: 22:42:45.765: JS LOG:     Sherlock Holmes
Gjs-Message: 22:42:45.765: JS LOG:     NO NAME
Gjs-Message: 22:42:45.766: JS LOG:     John Holmes
Gjs-Message: 22:42:45.766: JS LOG:     Mike Holmes
Gjs-Message: 22:42:45.766: JS LOG:     H. H. Holmes
Gjs-Message: 22:42:45.767: JS LOG: Address Book: Personal
Gjs-Message: 22:42:45.767: JS LOG:     No Contacts
```

### Query Strings

Before we move on to working with the returned contact objects, we're going to
briefly cover constructing query string that would usually be done with
`EBookQuery`. In C this is a simple struct-based utility for creating query
strings, but is not introspectable for most bindings.

Fortunately these are pretty straightforward and we can construct them by hand
without much effort. Each query is placed in regular brackets (`()`), terms go
in double-quotes (`"`), are case insensitive and you can combine queries with
operators like `and` or `not`.

#### Fields

Field names are lower case and you can query standard vCard field names and
lookup fields by passing the [`ContactField`][contactfields] constants to the
static function `EBookContacts.Contact.field_name()`:

```js
const EBookContacts = imports.gi.EBookContacts;

// Expected output: full_name
log(EBookContacts.Contact.field_name(EBookContacts.ContactField.FULL_NAME));
```

There is also the special field name `x-evolution-any-field` that can be used
with the `contains` operator to match any field.

#### Operators

Queries can use the standard collection of comparison operators and a few string
helpers:

| Operator     | Function              |
|--------------|-----------------------|
| `and`        | Logical AND (`&&`)    |
| `or`         | Logical OR  (`||`)    |
| `not`        | Logical NOT (`!`)     |
| `is`         | Logical EQUAL  (`==`) |
| `contains`   | String contains `x`   |
| `beginswith` | String start with `x` |
| `endswith`   | String ends with `x`  |
| `exists`     | ContactField exists   |

#### Examples

Here are some basic examples:

```js
// Full Name contains "holmes"
let query1 = '(contains "full_name" "holmes")';

// Any field contains "holmes"
let query2 = '(contains "x-evolution-any-field" "holmes")';

// Has a phone number
let query3 = '(exists "tel")';

// Full Name starts with "sher" and ends with "lmes"
let query4 = '(startswith "full_name" "sher") and (endswith "full_name" "lmes")';

// Full Name is "sherlock holmes" or has an e-mail address
let query5 = '(is "full_name" "holmes") or (exists "email")';
```


[contactfields]: https://gjs-docs.gnome.org/#q=ebookcontacts.contactfield


## Working with Contacts

Evolution deals with contacts in the form of vCards, and contacts are returned
as [`EContact`][econtact] objects which is a subclass of [`EVCard`][evcard] with
some convenience functions for working with the data.


### Basic Fields

Basic contact fields like names, phone numbers, e-mail addresses and so on can
be accessed as properties:

```js
// Assuming `contact` is an EContact object
let firstName = contact.given_name;
let lastName = contact.family_name;

let homePhone = contact.home_phone;
let email1 = contact.email_1;
// ...
let email4 = contact.email_4;
```

### Complex Fields

Some fields are attribute lists, which may also contain parameters and can be a
little more work, but are not difficult once demonstrated:

```js
// Assuming `contact` is an EContact object
let numbers = contact.get_attributes(EBookContacts.ContactField.TEL);

for (let attr of numbers) {
    // Raw vCard 2.1 data: TEL;CELL;WORK:555-555-5555
    
    // Expected output: TEL
    log(attr.get_name());
    
    // Expected output: 555-555-5555
    log(attr.get_value());
    
    // A list: [ EBookContacts.VCardAttributeParam, ... ]
    let parameters = attr.get_params();
    
    for (let param of parameters) {
        // A list: [ 'CELL', 'WORK' ]
        log(param.get_values());
    }
}
```

`EVCard` fields are another domain where there are too many variations of field
types to give examples for every possibility, so you will have to research the
fields you are interested in and consult the API documentation for some of the
more complex fields.


### Photos

The last field we will cover is photos, demonstrating the common case of loading
a contact's photo into a `GtkImage`:

```js
// Don't forget to specify your imports versions for libraries that have more
// than one available (eg. Gtk4/Gdk4)
imports.gi.versions.GdkPixbuf = '2.0';
imports.gi.versions.Gtk = '3.0';

const EBookContacts = imports.gi.EBookContacts;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;

// Assuming `contact` is an EContact object
let photo = contact.photo;

if (photo) {
    let gicon = null;

    // URIs are easy and there are any number of ways to handle these
    if (photo.type === EBookContacts.ContactPhotoType.URI) {
        gicon = new Gio.FileIcon({
            file: new Gio.File({
                uri: photo.get_uri()
            })
        });
    }
    
    // Inlined photos can be dumped to a file or loaded into a pixbuf
    if (photo.type === EBookContacts.ContactPhotoType.INLINED) {
        let data = photo.get_inlined()[0];

        // Load the data into a GdkPixbuf (which implements the GIcon interface)
        let loader = new GdkPixbuf.PixbufLoader();
        loader.write(data);
        loader.close();

        gicon = loader.get_pixbuf();
    }
    
    // Putting the GIcon in a GtkImage
    let image = new Gtk.Image({
        gicon: gicon,
        pixel_size: 32
    });
}
```


[econtact]: https://gjs-docs.gnome.org/#q=ebookcontacts.contact
[evcard]: https://gjs-docs.gnome.org/#q=ebookcontacts.vcard
[evcardattr]: https://gjs-docs.gnome.org/#q=ebookcontacts.vcardattribute


## Watching for Changes

There are probably going to be two things you want to watch for: new and removed
Address Books and added, modifed or removed Contacts in those Address Books.

### Address Books

This one is fairly straight forward as there is a convenient class for watching
the registry called [`ESourceRegistryWatcher`][esourceregistrywatcher]. 

```js
const EDataServer = imports.gi.EDataServer;
const EBook = imports.gi.EBook;

/*
 * A map of ESource UID -> EBookClient
 */
const AddressBooks = new Map();

/*
 * ESourceRegistryWatcher Callbacks
 */
async function onAppeared(watcher, source) {
    try {
        // Get an EBookClient and add it to the Map
        let client = await getEBookClient(source);
        
        AddressBooks.set(source.get_uid(), client);
    } catch (e) {
        logError(e);
    }
}

function onDisappeared(watcher, source) {
    try {
        // Drop the EBookClient
        AddressBooks.delete(source.get_uid());
    } catch (e) {
        logError(e);
    }
}

async function watchAddressBooks() {
    try {
        // First get a ESourceRegistry
        let registry = await getESourceRegistry();
        
        // Watch for new and removed sources
        let registryWatcher = new EDataServer.SourceRegistryWatcher({
            registry: registry,
            extension_name: EDataServer.SOURCE_EXTENSION_ADDRESS_BOOK
        });

        // It's good practice to always take the returned id and disconnect it
        // later. Not doing so may result in the callback holding a reference to
        // the object longer than you expected, delaying garbage collection.
        let appearedId = registryWatcher.connect(
            'appeared',
            onAppeared
        );

        let disappearedId = registryWatcher.connect(
            'disappeared',
            onDisappeared
        );
    } catch (e) {
        logError(e);
    }
}
```

Of course you can do whatever you want in your callbacks, like query the
existing contacts or decide if you are interested in tracking that Address Book
at all.

If you plan on keeping this around, you can drop your reference to the registry
since `ESourceRegistryWatcher` will hold its own reference as a property.


[esourceregistrywatcher]: https://gjs-docs.gnome.org/#q=edataserver.sourceregistrywatcher


### Contacts

`EBookClientView` is a class used to interact with a subsection of an
`EBookClient`; basically a filtered `EBookClient` that also emits signals when
contacts that match its query field change. If you have ever used "views" in
SQL, this concept should be very familiar.

First the function to get an `EBookClientView`:

```js
const EBook = imports.gi.EBook;


/**
 * Get an EBook.BookClientView matching @query. If @query is not given all
 * contacts will be matched. If @cancellable is given it can be used to cancel
 * the operation before it completes.
 *
 * @param {EBook.BookClient} client - an EBook.BookClient
 * @param {string} [query] - an optional query string
 * @param {Gio.Cancellable} [cancellable] - optional Gio.Cancellable object
 * @returns {EBook.BookClientView} - an EBook.BookClientView
 */
function getEBookClientView(client, query = '', cancellable = null) {
    return new Promise((resolve, reject) => {
        client.get_view(query, cancellable, (client, res) => {
            try {
                resolve(client.get_view_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}
```

Sometimes working with bindings is tricky, because it's not unheard of to use
untyped memory pointers when programming in C. In this case the offenders are
the `::objects-added`, `::objects-modified` and `::objects-removed` signals on
the [`EBookClientView`][ebookclientview] class. Because the signal callback
arguments are untyped, GObject Introspection can't tell GJS how to marshall the
values, so they are ignored instead.

Fortunately, as mentioned previously, all Evolution Data Server clients are
essentially DBus proxies, so we can use the existing connection and object path
and subscribe to the DBus signals directly:

```js
/*
 * AddressBook DBus callbacks
 */
function onObjectsAdded(connection, sender, path, iface, signal, params) {
    try {
        let adds = params.get_child_value(0).get_strv();

        // NOTE: sequential pairs of vcard, uid
        for (let i = 0, len = adds.length; i < len; i += 2) {
            try {
                let vcard = adds[i];
                let contact = EBookContacts.Contact.new_from_vcard(vcard);
            } catch (e) {
                logError(e);
            }
        }
    } catch (e) {
        logError(e);
    }
}

function onObjectsRemoved(connection, sender, path, iface, signal, params) {
    try {
        let changes = params.get_child_value(0).get_strv();

        for (let uid of changes) {
            // Do stuff with contact uid
        }
    } catch (e) {
        logError(e);
    }
}

function onObjectsModified(connection, sender, path, iface, signal, params) {
    try {
        let changes = params.get_child_value(0).get_strv();

        // NOTE: sequential pairs of vcard, id
        for (let i = 0, len = changes.length; i < len; i += 2) {
            try {
                let vcard = changes[i];
                let contact = EBookContacts.Contact.new_from_vcard(vcard);
                
                // Do stuff with contact
            } catch (e) {
                logError(e);
            }
        }
    } catch (e) {
        logError(e);
    }
}

/*
 * Watch/Unwatch functions
 */
function watchBookViewClient(view) {
    // Get the DBus connection and object path of the view
    let connection = view.get_connection();
    let objectPath = view.get_object_path();

    // Connect to each signal and store the id as a property for later
    view._objectsAddedId = connection.signal_subscribe(
        null,
        'org.gnome.evolution.dataserver.AddressBookView',
        'ObjectsAdded',
        objectPath,
        null,
        Gio.DBusSignalFlags.NONE,
        onObjectsAdded
    );

    view._objectsRemovedId = connection.signal_subscribe(
        null,
        'org.gnome.evolution.dataserver.AddressBookView',
        'ObjectsRemoved',
        objectPath,
        null,
        Gio.DBusSignalFlags.NONE,
        onObjectsRemoved
    );

    view._objectsModifiedId = connection.signal_subscribe(
        null,
        'org.gnome.evolution.dataserver.AddressBookView',
        'ObjectsModified',
        objectPath,
        null,
        Gio.DBusSignalFlags.NONE,
        onObjectsModified
    );

    // Once you invoke this function, the EBookClientView will not only start
    // watching signals, it will emit them for all contacts that meet the query.
    view.start();
}

function unwatchBookViewClient(view) {
    let connection = view.get_connection();
    
    if (view._objectsAddedId) {
        connection.signal_unsubscribe(view._objectsAddedId);
        view._objectsAddedId = 0;
    }
    
    if (view._objectsRemovedId) {
        connection.signal_unsubscribe(view._objectsRemovedId);
        view._objectsRemovedId = 0;
    }
    
    if (view._objectsModifiedId) {
        connection.signal_unsubscribe(view._objectsModifiedId);
        view._objectsModifiedId = 0;
    }
    
    view.stop();
}
```


[ebookclientview]: https://gjs-docs.gnome.org/#q=ebook.bookclientview
