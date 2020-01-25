---
layout: article
title: Asynchronous Programming in GJS
---

Although JavaScript engines use threading behind the scenes, JavaScript programs use a single-threaded event loop. This means that long, synchronous operations can block the event loop from executing other operations until completed. This can cause noticeable hangs in interactive scripts and in the case of a Gnome Shell extension could even lock up the whole desktop.

Since GJS is JavaScript bindings for the Gnome API, we have tools to address this that aren't available in standard JavaScript that we can leverage. We'll introduce GLib's event loop used in GJS, go over some basic Promise usage and briefly cover some of the applications of the Gnome API that relate to asynchronous JavaScript.

## Table of Contents

1. [GLib Event Loop](#glib-event-loop)
2. [Basic Promise Usage](#basic-promise-usage)
3. [GTask API](#gtask-api)
4. [Spawning Processes](#spawning-processes)
5. [Signals](#gsignals)

## GLib Event Loop

It is important to understand that unlike Firefox, in GJS we use GLib's [Main Event Loop][glib-mainloop] with the SpiderMonkey JavaScript engine. This means that we can control the execution of events in ways that aren't exposed in standard JavaScript and add events from other sources.

**Sources** of events could be IO streams like when waiting for data on a TCP connection, timeouts like those created with `GLib.timeout_add()` or like sources created with `GLib.idle_add()` that wait until no higher priority event is waiting. In GJS Promises are essentially a type of event source.

**Priorities** are integer values determining the order operations in the event loop will be executed. Promises are given `GLib.PRIORITY_DEFAULT` and then queued as described by the Promise API. Consider the table below and how `Gtk.PRIORITY_RESIZE` has a higher priority than `Gdk.PRIORITY_REDRAW` so a redraw won't happen for every step resizing a window.

| Constant                  | Value |
|---------------------------|-------|
| `GLib.PRIORITY_LOW`       | 300   |
| `Gdk.PRIORITY_REDRAW`     | 20    |
| `Gtk.PRIORITY_RESIZE`     | 10    |
| `GLib.PRIORITY_DEFAULT`   | 0     |
| `GLib.PRIORITY_HIGH`      | -100  |

**Callbacks** for event sources should return a boolean, `GLib.SOURCE_CONTINUE` (`true`) or `GLib.SOURCE_REMOVE` (`false`), which will determine whether it is removed or not. JavaScript's async functions are usually not suitable as a callback since the implicitly returned Promise will be coerced to `true`. A callback with no return or `undefined` will be coerced to `false`.

```js
const GLib = imports.gi.GLib;

let loop = GLib.MainLoop.new(null, false);

// A low priority event source that will execute its callback after one second
GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
    log('low priority');
    return GLib.SOURCE_REMOVE;
});

// You can specify custom priorities with an integer. This source's callback
// will be executed before the low priority source.
GLib.timeout_add_seconds(-200, 1, () => {
    log('custom high priority');
    return GLib.SOURCE_REMOVE;
});

// If this callback returned GLib.SOURCE_CONTINUE, the source would wait for its
// "condition" to be met again and this would become a timed loop
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
    log('default priority');
    return GLib.SOURCE_REMOVE;
});

// This is an input stream for stdin that implements GPollableInputStream, so
// the created source effectively has the condition `GLib.IOCondition.IN`
//
// Other ways of creating sources, such as `GLib.unix_fd_add_full()` allow you
// to specify the IO condition that triggers the callback.
let stdin = new Gio.UnixInputStream({ fd: 0 });
let source = stdin.create_source(null);

// This callback returns `GLib.SOURCE_REMOVE` or `GLib.SOURCE_CONTINUE` based on
// whether it thinks the operation is a success or not.
source.set_callback(() => {
    try {
        let input = stdin.read_bytes(4096, null).toArray().toString();
        log(input.slice(0, -1));

        // Here we return GLib.SOURCE_CONTINUE to wait for more available data
        return GLib.SOURCE_CONTINUE;
    } catch (e) {
        // If this were a TCP socket, we might consider this a connection error
        return GLib.SOURCE_REMOVE;
    }
});

// Add the source to the default context where it will be executed
source.attach(null);

loop.run();
```

Expected output:

```sh
$ gjs async-priority.js
Gjs-Message: 18:54:11.232: JS LOG: custom high priority
Gjs-Message: 18:54:11.232: JS LOG: default priority
Gjs-Message: 18:54:11.232: JS LOG: low priority
type in terminal and press enter
Gjs-Message: 18:54:15.337: JS LOG: type in terminal and press enter
```

## Basic Promise Usage

Basic Promise behaviour and scheduling is important to truly leverage asynchronous code in GJS, so you should review Mozilla's guide to [Using Promises][mdn-promises] and [async functions][mdn-async] if you're new to the Promise API.

Let's run through a quick example anyways and use the opportunity to cover a few GJS specifics.

```js
const GLib = imports.gi.GLib;

// GJS uses GLib's event loop and Promises are scheduled in it. Shell extensions
// will use the loop already running in Gnome Shell, which is how an extension
// can hang the desktop.
let loop = GLib.MainLoop.new(null, false);
    
// This function explicitly returns a Promise that resolves after one second.
// We'll use it in the try-catch of an async function, but if we didn't it would
// require a `catch()`, either directly attached or on the returned Promise:
//
//     return new Promise().catch(e => logError(e));
//     myPromiseFunc().catch(logError);
//
function myPromiseFunc(name) {
    // resolve and reject are functions used in place of `return` and `throw`
    return new Promise((resolve, reject) => {
        GLib.usleep(1000000);
        
        // Return @name as the result
        resolve(name);
    });
}

// async functions implicitly return a Promise object, but allow you to regain
// synchronous flow using `await`, standard try-catch-finally and `return`.
//
// You can still use `then()` and `catch()` on the returned Promise and as of
// GJS-1.54 `finally()` is also available.
async function myAsyncFunction(name) {
    try {
        for (let i = 0; i < 2; i++) {
            // The `await` operator pauses execution of an async function and
            // allows the event loop to continue until the Promise resolves.
            let result = await myPromiseFunc(name);
            log(result);
        }
    } catch (e) {
        // logError() is a global function in GJS that takes an Error() and
        // prints a backtrace.
        logError(e);
    } finally {
        return 'finished';
    }
}

// We'll invoke two named runs of myAsyncFunction() to see how scheduling works
myAsyncFunction('test1');
myAsyncFunction('test2').then(result => {
    // The result of myAsyncFunction() is the string 'finished'
    log(result);
    
    // We can quit, since the second myPromiseFunc() of myAsyncFunction('test2')
    // is predictably the last operation scheduled in the event loop
    loop.quit();
});
log('started');

// Run the loop
loop.run();
```

Expected output:

```sh
$ time gjs async-intro.js
Gjs-Message: 17:53:27.814: JS LOG: started
Gjs-Message: 17:53:27.814: JS LOG: test1
Gjs-Message: 17:53:28.815: JS LOG: test2
Gjs-Message: 17:53:29.815: JS LOG: test1
Gjs-Message: 17:53:29.816: JS LOG: test2
Gjs-Message: 17:53:29.816: JS LOG: finished

real	0m4.053s
user	0m0.172s
sys	0m0.007s
```

Notice that the script takes ~4 seconds since once a Promise has started executing it is still synchronous. Using a Promise won't prevent blocking by itself, but using `await` can allow you to break up multi-part functions in smaller tasks and give the event loop a chance to execute other operations.

Also pay attention to how `log('started');` is executed *before* the first invocation of `myPromiseFunc()` due to the use of `await`. Although there is no threading happening here, the principle of thread-safety still applies to the execution order of operations in the event loop.

## Promises and GSources

While functions like `GLib.usleep()` can delay execution of code in a function, they also block the execution of all other code in the process. Not very asynchronous.

If you want to delay execution of code in a function, but still allow other code and events to continue executing, you can combine a Promise and a GSource. Let's define some new Promise helpers:

```js
const GLib = imports.gi.GLib;


/**
 * Idle Promise
 *
 * @param {number} priority - The priority of the idle source
 */
Promise.idle = function(priority) {
    return new Promise(resolve => GLib.idle_add(priority, resolve));
};

/**
 * Timeout Promise (ms)
 *
 * @param {number} priority - The priority of the timeout source
 * @param {number} interval - Delay in milliseconds before resolving
 */
Promise.timeout = function(priority = GLib.PRIORITY_DEFAULT, interval = 100) {
    return new Promise(resolve => GLib.timeout_add(priority, interval, resolve));
};

/**
 * Timeout Promise (s)
 *
 * @param {number} priority - The priority of the timeout source
 * @param {number} interval - Delay in seconds before resolving
 */
Promise.timeoutSeconds = function(priority = GLib.PRIORITY_DEFAULT, interval = 1) {
    return new Promise(resolve => GLib.timeout_add_seconds(priority, interval, resolve));
};

let start = Date.now();

// In an async function
async function slowLoop() {
    // Catch your rejections as a whole
    try {
        for (let i = 0; i < 3; i++) {
            // ...or per iteration
            try {
                await Promise.timeoutSeconds();
                log(`${(Date.now() - start) / 1000}s elapsed`);
            } catch (e) {
                throw e;
            }
        }
    } catch (e) {
        logError(e);
    }
}


let loop = GLib.MainLoop.new(null, false);

slowLoop().then(result => loop.quit());

Promise.idle().then(res => {
    log(`Idle Promise: ${(Date.now() - start) / 1000}`);
});

loop.run();
```

Expected output:

```sh
$ gjs async-gsource.js
Gjs-Message: 20:20:50.334: JS LOG: Idle Promise: 0.001
Gjs-Message: 20:20:51.622: JS LOG: 1.289s elapsed
Gjs-Message: 20:20:52.622: JS LOG: 2.289s elapsed
Gjs-Message: 20:20:53.621: JS LOG: 3.288s elapsed
```

Notice that the idle Promise resolves almost immediately, because there will be no higher priority events due for over a second. Additionally, unless you need millisecond accuracy, note that `GLib.timeout_add_seconds()` will attempt to group events to prevent excessive wake-ups (See: https://wiki.gnome.org/Initiatives/GnomeGoals/UseTimeoutAddSeconds).

## GTask API

[GTask][gtask] is an API commonly used by Gnome libraries to implement asynchronous functions that can be run in dedicated threads, prioritized in the event loop and cancelled mid-operation from another thread. Generally, these functions follow a pattern of:

```js
SourceObj.foo_async(
    arguments,                                      // May not apply
    priority,                                       // May not apply
    cancellable,                                    // Gio.Cancellable or %null
    (sourceObj, resultObj) => {                     // GAsyncReadyCallback or %null
        let res = sourceObj.foo_finish(resultObj);  // Can throw errors
    }
);
```

We'll use the common task of reading the contents of a file as an example of wrapping a GTask async function:

```js
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

let loop = GLib.MainLoop.new(null, false);

function loadContents(file, cancellable=null) {
    // We use an explicit Promise instead of an async function, because we need
    // resolve() & reject() to break out of the GAsyncReadyCallback...
    return new Promise((resolve, reject) => {
        file.load_contents_async(cancellable, (source_object, res) => {
            // ...and a try-catch to propagate errors through the Promise chain
            try {
                res = source_object.load_contents_finish(res);
                
                // GAsyncReadyCallbacks return an 'ok' boolean, but we ignore
                // them since an error will be thrown anyways if it's %false
                let [ok, contents, etag_out] = res;
                
                // Some functions have returns like GVariants you could unpack
                // to native values before resolving
                resolve(contents);
            } catch (e) {
            
                // This will throw an error in an async function, or you can use
                // catch() on the Promise object
                reject(e);
            }
        });
    });
}

// We'll `await` loadContents() in an async function, but you could also `await`
// the Promise directly and include it in this function
async function loadFile(path, cancellable=null) {
    try {
        let file = Gio.File.new_for_path(path);
        let contents = await loadContents(file, cancellable);
            
        return contents;
    } catch (e) {
        logError(e);
    }
}

// We can use a Gio.Cancellable object to allow the operation to be cancelled,
// like with a 'Cancel' button in a dialog, or just leave it %null.
let cancellable = new Gio.Cancellable();

loadFile('/proc/cpuinfo', cancellable).then(contents => {
    log(contents);
    loop.quit();
});

// To cancel the operation we invoke cancel() on the cancellable object, which
// will throw "Gio.IOErrorEnum: Operation was cancelled" in loadContents()
cancellable.cancel();

loop.run();
```

Now let's remove the cancellable and re-use `loadContents()` and `loadFile()` to test how threaded Promises play out. If you don't have suitable files handy, you can create an empty 10MB and 10KB file to compare:

```sh
$ dd if=/dev/zero of=10mb.txt count=10240 bs=1024
$ dd if=/dev/zero of=10kb.txt count=10 bs=1024
```

Then put the following snippet in place of the calls to `cancel()` and `loadFile()`:

```js
let start = Date.now();

loadFile('10mb.txt', null).then(contents => {
    log(`10mb finished, ${Date.now() - start}ms elapsed`);
});

loadFile('10kb.txt', null).then(contents => {
    log(`10kb finished, ${Date.now() - start}ms elapsed`);
});
```

Expected output:

```sh
$ gjs async-file.js
Gjs-Message: 18:41:55.122: JS LOG: 10kb finished, 2ms elapsed
Gjs-Message: 18:41:55.149: JS LOG: 10mb finished, 36ms elapsed
```

The longer operation doesn't block the shorter operation anymore and they finish in the expected order. In fact, because `loadFile()` is a Promise and we didn't using `await`, the two operations are essentially running in parallel. Try switching the order of the functions or reading the 10mb file twice:

```sh
$ gjs async-file.js 
Gjs-Message: 18:50:04.043: JS LOG: 10mb finished, 40ms elapsed
Gjs-Message: 18:50:04.043: JS LOG: 10mb finished, 40ms elapsed
```

## Spawning Processes

`Gio.Subprocess` is similar to `subprocess.py` in Python, allowing you to spawn and communicate with applications asynchronously using the GTask API. It is preferred over GLib's lower-level functions since it automatically reaps child processes avoiding zombie processes and prevents dangling file descriptors. This is especially important in GJS because of how "out" parameters are handled.

Consider the following snippet using `GLib.spawn_async_with_pipes()`. In other languages we would pass "in" `null` as a function argument for pipes like `stdin` that we don't plan on using, preventing them from being opened. In GJS all three pipes are opened implicitly and must be explicitly closed, or we may eventually get a *"Too many open files"* error.

```js
let [ok, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
    null,                   // working directory
    ['ls' '-la'],           // argv
    null,                   // envp
    GLib.SpawnFlags.NONE,   // flags
    null                    // child_setup function
);
```

Let's try a simple exercise of using `Gio.Subprocess` to execute `ls -a` in the current directory then log the output manually.

```js
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

let loop = GLib.MainLoop.new(null, false);

async function execCommand(argv, cancellable=null) {
    try {
        // There is also a reusable Gio.SubprocessLauncher class available
        let proc = new Gio.Subprocess({
            argv: argv,
            // There are also other types of flags for merging stdout/stderr,
            // redirecting to /dev/null or inheriting the parent's pipes
            flags: Gio.SubprocessFlags.STDOUT_PIPE
        });
        
        // Classes that implement GInitable must be initialized before use, but
        // an alternative in this case is to use Gio.Subprocess.new(argv, flags)
        //
        // If the class implements GAsyncInitable then Class.new_async() could
        // also be used and awaited in a Promise.
        proc.init(null);

        let stdout = await new Promise((resolve, reject) => {
            // communicate_utf8() returns a string, communicate() returns a
            // a GLib.Bytes and there are "headless" functions available as well
            proc.communicate_utf8_async(null, cancellable, (proc, res) => {
                let ok, stdout, stderr;

                try {
                    [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                    resolve(stdout);
                } catch (e) {
                    reject(e);
                }
            });
        });

        return stdout;
    } catch (e) {
        logError(e);
    }
}

execCommand(['ls', '-a']).then(stdout => {
    stdout.split('\n').map(line => log(line));
    loop.quit();
});

loop.run();
```

Expected output:

```sh
$ gjs async-proc.js
Gjs-Message: 16:57:26.784: JS LOG: .
Gjs-Message: 16:57:26.784: JS LOG: ..
Gjs-Message: 16:57:26.784: JS LOG: async-file.js
Gjs-Message: 16:57:26.784: JS LOG: async-intro.js
Gjs-Message: 16:57:26.784: JS LOG: async-proc.js
Gjs-Message: 16:57:26.784: JS LOG: async-signal.js
Gjs-Message: 16:57:26.784: JS LOG: async-source.js
Gjs-Message: 16:57:26.784: JS LOG: 
```

## GSignals

Since async functions *immediately* return a Promise object they can be used as callbacks for signals that would normally block until the callback finished its operation.

Although many signals have `void` or irrelevant return values, some like `GtkWidget::delete-event` are propagated to other objects depending on the return value (usually boolean). As with event source callbacks, keep in mind that a Promise returned by a signal callback will be coerced to `true`.

Take for example `Gio.SocketService::incoming` whose documentation says:

> ...the handler must immediately return, or else it will block additional incoming connections from being serviced.
> [Return] TRUE to stop other handlers from being called

```js
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

let loop = GLib.MainLoop.new(null, false);

let service = new Gio.SocketService();

// Arrow-functions can be async functions, too
service.connect('incoming', async (service, connection, source_object) => {
    try {
        connection.close(null);
    } catch (e) {
        logError(e);
    }
});

loop.run();
```

On the topic of GSignals, if subclassing a GObject `vfunc_` overrides often have much less overhead than callbacks, especially for signals that are frequently emitted. There are good opportunities to improve performance for many common and low-level signals like `GtkWidget::draw`:

```js
var MyWidget = GObject.registerClass({
    GTypeName: 'MyWidget'
}, class MyWidget extends Gtk.DrawingArea {
    vfunc_draw(cr) {
        cr.$dispose();
        return false;
    }
});
```

[gsignal-lock]: https://gitlab.gnome.org/GNOME/glib/blob/master/gobject/gsignal.c#L3179
[gtask]: https://developer.gnome.org/gio/stable/GTask.html
[glib-mainloop]: https://developer.gnome.org/glib/stable/glib-The-Main-Event-Loop.html
[mdn-webworkers]: https://developer.mozilla.org/docs/Web/API/Web_Workers_API
[mdn-promises]: https://developer.mozilla.org/docs/Web/JavaScript/Guide/Using_promises
[mdn-async]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/async_function
