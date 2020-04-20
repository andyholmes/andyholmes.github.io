---
layout: article
title: Subprocesses in GJS
date: 2020-04-19
tags: [gjs, async]
---

There are several ways to execute subprocesses with the GNOME platform, but
many of them are either cumbersome, error prone or limited. This article is
about launching subprocesses in GJS with `GSubprocess`.

You can find the API documentation for GJS at <https://gjs-docs.gnome.org/>.

## Table of Contents

1. [GLib](#glib)
2. [GSubprocess](#gsubprocess)
3. [GSubprocess Launcher](#gsubprocesslauncher)
4. [Examples](#examples)
  * [Simple Processes](#simple-processes)
  * [Processes With Output](#processes-with-output)
  * [Background Processes](#background-processes)

## GLib

GLib actually includes a number of utilities for working with subprocesses, but
many applications written in C don't even use them. As a rule, you should always
look in the higher-level Gio before you look in GLib for a utility.

This first example is very common to see in GNOME Shell extensions, which is the
worst place to use it. This process will run synchronously, do I/O on the main
thread, blocking the whole desktop until it completes:

```js
'use strict';

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;


try {
    let [, stdout, stderr, status] = GLib.spawn_command_line_sync('ls /');

    if (status !== 0) {
        if (stderr instanceof Uint8Array)
            stderr = ByteArray.toString(stderr);
            
        throw new Error(stderr);
    }
    
    if (stdout instanceof Uint8Array)
        stdout = ByteArray.toString(stdout);
        
    // Now were done blocking the main loop, phewf!
    log(stdout);
} catch (e) {
    logError(e);
}

let loop = GLib.MainLoop.new(null, false);
loop.run();
```

A fair number of programmer's will figure out there's an asynchronous version of
this function, but find it doesn't quite suit their needs:

```js
'use strict';

const GLib = imports.gi.GLib;


try {
    GLib.spawn_command_line_async('ls /');

    // The process must have started because it didn't throw an error, but did
    // it actually succeed? By the way, where's my output?
} catch (e) {
    logError(e);
}
```

Better dig deeper. Below is how you might spawn a process asychronously with
`GLib.spawn_async_with_pipes()`, collect the output and check for errors.


```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


let loop = GLib.MainLoop.new(null, false);

// A simple asynchronous read loop
function readOutput(stream, lineBuffer) {
    stream.read_line_async(0, null, (stream, res) => {
        try {
            let line = stream.read_line_finish_utf8(res)[0];

            if (line !== null) {
                lineBuffer.push(line);
                readOutput(stream, lineBuffer);
            }
        } catch (e) {
            logError(e);
        }
    });
}

try {
    let [, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
        // Working directory, passing %null to use the parent's
        null,
        // An array of arguments
        ['ls', '/'],
        // Process ENV, passing %null to use the parent's
        null,
        // Flags; we need to use PATH so `ls` can be found and also need to know
        // when the process has finished to check the output and status.
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        // Child setup function
        null
    );

    // Any streams we don't want we have to close any ways, otherwise we may
    // leak the file descriptors
    GLib.close(stdin);

    // Okay, now let's get output stream for `stdout`
    let stdoutStream = new Gio.DataInputStream({
        base_stream: new Gio.UnixInputStream({
            fd: stdout,
            close_fd: true
        }),
        close_base_stream: true
    });

    // We'll read the output asynchronously to avoid blocking the main thread
    let stdoutLines = [];
    readOutput(stdoutStream, stdoutLines);

    // We want the real error from `stderr`, so we'll have to do the same here
    let stderrStream = new Gio.DataInputStream({
        base_stream: new Gio.UnixInputStream({
            fd: stderr,
            close_fd: true
        }),
        close_base_stream: true
    });
    
    let stderrLines = [];
    readOutput(stderrStream, stderrLines);

    // Watch for the process to finish, being sure to set a lower priority than
    // we set for the read loop, so we get all the output
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {
        if (status === 0) {
            log(stdoutLines.join('\n'));
        } else {
            logError(new Error(stderrLines.join('\n')));
        }

        // Ensure we close the remaining streams and process
        stdoutStream.close(null);
        stderrStream.close(null);
        GLib.spawn_close_pid(pid);

        loop.quit();
    });
} catch (e) {
    logError(e);
    loop.quit();
}

loop.run();
```

Depending on your use case you could simplify the above somewhat, but this is
really all unneccessary since that's what `Gio.Subprocess` does anyways.


## GSubprocess

In contrast to the spawn functions available in GLib, `Gio.Subprocess` is both
simpler to use and safer for language bindings. It is just as powerful, does all
the cleanup you'd have to do yourself and is very convenient for most use cases.

As an example of how much simpler `Gio.Subprocess` can be, here is how you would
accomplish the same as the example above:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

let loop = GLib.MainLoop.new(null, false);

try {
    let proc = Gio.Subprocess.new(
        ['ls', '/'],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    
    proc.communicate_utf8_async(null, null, (proc, res) => {
        try {
            let [, stdout, stderr] = proc.communicate_utf8_finish(res);
            
            if (proc.get_successful()) {
                log(stdout);
            } else {
                throw new Error(stderr);
            }
        } catch (e) {
            logError(e);
        }
        
        loop.quit();
    });
} catch (e) {
    logError(e);
    loop.quit();
}

loop.run();
```


## GSubprocessLauncher

[`Gio.SubprocessLauncher`][gsubprocesslauncher] is a re-usable object you can
use to spawn processes. You can set the flags at construction, then just call
`Gio.SubprocessLauncher.spawnv()` with your arguments any time you want to
spawn a process.

It also allows you to designate files for input and output, change the working
directory and set or modify environment variables, which is expecially useful
for spawning shell scripts.

In every other way, the returned object is a regular `Gio.Subprocess` object
and you can still call methods like [`communicate_utf8()`][communicate_utf8],
[`wait_check()`][wait_check] and [`force_exit()`][force_exit] on it.

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


let loop = GLib.MainLoop.new(null, false);

let launcher = new Gio.SubprocessLauncher({
    flags: (Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_PIPE)
});

// Set a custom ENV variable, which could be used in shell scripts
launcher.setenv("MY_VAR", "1", false);

// Log any errors to a file
launcher.set_stderr_file_path("error.log");

// Spawn as many processes with this launcher as you want
let proc1 = launcher.spawnv(['ls', '/']);
let proc2 = launcher.spawnv(['/home/me/script.sh']);

loop.run();
```

[gsubprocesslauncher]: https://gjs-docs.gnome.org/gio20~2.0_api/gio.subprocesslauncher
[force_exit]: https://gjs-docs.gnome.org/gio20~2.0_api/gio.subprocess#method-force_exit


## Examples

The rest of this article is a series of examples. Instead of covering every
possible option of `Gio.Subprocess`, we'll demonstrate several very complete
examples of the most common use cases.

### Simple Processes

Single run processes with no output, such as `cp` or `mv` can be run with
[`Gio.Subprocess.wait_check()`][wait_check]. The chief advantages here over
`GLib.spawn_command_line_async()` are checking the process doesn't just start,
but actually completes successfully, the ability to stop it at any time, and
notification when it does.

```js
'use strict';

const Gio = imports.gi.Gio;


/**
 * Execute a command asynchronously and check the exit status.
 *
 * If given, @cancellable can be used to stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {Gio.Cancellable} [cancellable] - optional cancellable object
 * @returns {string} - The process output
 */
async function execCheck(argv, cancellable = null) {
    // Construct and initialize manually, to allow a pre-cancelled cancellable
    // to stop the process before it starts (early cancellation)
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: Gio.SubprocessFlags.NONE
    });
    proc.init(cancellable);

    // If we're passed a cancellable, we can chain to it kill the process
    // instead of just cancelling the call to `wait_check_async()`.
    //
    // NOTE: this is NOT the standard GObject.connect() function, so you should
    // consult the documentation if the usage seems odd here.
    let cancelId = 0;

    if (cancellable instanceof Gio.Cancellable)
        cancelId = cancellable.connect(() => proc.force_exit());

    return new Promise((resolve, reject) => {
        proc.wait_check_async(cancellable, (proc, res) => {
            try {
                // This will throw an error if there is an problem spawning the
                // process OR the process itself exits with an error.
                proc.wait_check_finish(res);

                resolve();
            } catch (e) {
                reject(e);
            } finally {
                // We should now disconnect from the cancellable. If we don't
                // our callback may end up being invoked if the cancellable we
                // were passed is used for another operation.
                if (cancelId > 0) {
                    cancellable.disconnect(cancelId);
                }
            }
        });
    });
}
```

[wait_check]: https://gjs-docs.gnome.org/gio20~2.0_api/gio.subprocess#method-wait_check


### Processes With Output

For single run processes with text output, such as `cat` or `ls`, you can use
[`Gio.Subprocess.communicate_utf8()`][communicate_utf8]. If the output of the
process is not text or you just want the output in `GLib.Bytes`, you can use
[`Gio.Subprocess.communicate()`][communicate] instead.

These two functions take (optional) input to pass to `stdin` and collect all the
output from `stdout` and `stderr`. Once the process completes the output is
returned.

Below is an extended version of the original example, with options for input,
cancellation and slightly improved error handling.


```js
'use strict';

const Gio = imports.gi.Gio;


/**
 * Execute a command asynchronously and return the output from `stdout` on
 * success or `stderr` on failure.
 *
 * If given, @input will be passed to `stdin` and @cancellable can be used to
 * stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {string} [input] - Input to write to `stdin` or %null to ignore
 * @param {Gio.Cancellable} [cancellable] - optional cancellable object
 * @returns {string} - The process output
 */
async function execCommunicate(argv, input = null, cancellable = null) {
    // We want `stdout` for the output and `stderr` if the process has an error
    let flags = (Gio.SubprocessFlags.STDOUT_PIPE |
                 Gio.SubprocessFlags.STDERR_PIPE);

    // Only open `stdin` if we have input
    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    // Check for early cancellation
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: flags
    });
    proc.init(cancellable);
    
    // Chain to the cancellable
    let cancelId = 0;

    if (cancellable instanceof Gio.Cancellable)
        cancelId = cancellable.connect(() => proc.force_exit());

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(input, cancellable, (proc, res) => {
            try {
                // This will only throw an error if there is problem spawning
                // the process, not if the process itself has an error.
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);

                // If the process is unsuccessful, translate the exit code and
                // throw an error with `stderr` as the message.
                if (!proc.get_successful()) {
                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(proc.get_exit_status()),
                        message: stderr.trim()
                    });
                }

                resolve(stdout.trim());
            } catch (e) {
                reject(e);
            } finally {
                // Disconnect from the cancellable
                if (cancelId > 0) {
                    cancellable.disconnect(cancelId);
                }
            }
        });
    });
}
```

[communicate]: https://gjs-docs.gnome.org/gio20~2.0_api/gio.subprocess#method-communicate
[communicate_utf8]: https://gjs-docs.gnome.org/gio20~2.0_api/gio.subprocess#method-communicate_utf8

### Background Processes

Another common use case might be a service that runs in the background until
told to exit. If the process is designed to occasionally send data via `stdout`,
you can get the output pipe and wait in a thread.

In the example below, the caller can pass a callback to be invoked whenever a
new line is read. The process continues to read lines until the process exits,
either when the cancellable is triggered or the `Gio.Subprocess.force_exit()` is
called on the returned object.

Some other ideas might be exiting the process if the callback returns `false`,
returning a function that writes to `stdin`, or a second callback for output
from `stderr`.

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


function readOutput(stream, progressCallback, cancellable = null) {
    stream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (stream, res) => {
        try {
            let line = stream.read_line_finish_utf8(res)[0];
            
            // If we read a line, invoke @progressCallback and wait for another
            if (line !== null) {
                progressCallback(line);
                readOutput(stream, progressCallback, cancellable);
            }
        } catch (e) {
            // We don't need the error if we cancelled it
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e);
        }
    });
}

/**
 * Execute a process in the background and return the process to the caller.
 *
 * If given, @progressCallback is invoked whenever a line is read from `stdout`.
 *
 * If given, @cancellable can be used to stop the process, otherwise call
 * `Gio.Subprocess.force_exit()` on the returned object.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {function} [progressCallback] - Optional callback for output lines
 * @param {Gio.Cancellable} [cancellable] - Optional cancellable object
 * @returns {Gio.Subprocess} - The process
 */
function execDaemon(argv, progressCallback = null, cancellable = null) {
    // Check for early cancellation
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_SILENCE)
    });
    proc.init(cancellable);
    
    // Chain to the cancellable
    let cancelId = 0;

    if (cancellable instanceof Gio.Cancellable)
        cancelId = cancellable.connect(() => proc.force_exit());
    
    // Read lines from `stdout` and call @callback when a line is read
    if (typeof progressCallback === 'function') {
        let stream = new Gio.DataInputStream({
            base_stream: proc.get_stdout_pipe(),
            close_base_stream: true
        });
        
        readOutput(stream, progressCallback, cancellable);
    }
    
    // Watch for the process to exit
    proc.wait_check_async(cancellable, (proc, res) => {
        try {
            proc.wait_check_finish(res);
        } catch (e) {
            // We don't need the error if we cancelled it
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e);
        } finally {
            // Disconnect from the cancellable
            if (cancelId > 0) {
                cancellable.disconnect(cancelId);
            }
        }
    });
    
    return proc;
}
```

