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
  * [Basic Usage](#basic-usage)
  * [Watiting for Processes](#waiting-for-processes)
  * [Communicating with Processes](#communicating-with-processes)
  * [Extra Tips](#extra-tips)
3. [GSubprocess Launcher](#gsubprocesslauncher)
4. [Complete Examples](#complete-examples)

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
quite a bit more work that using `Gio.Subprocess`. You can see the example below
of [communicating with a subprocess](#communicating-with-subprocesses) for a
comparison.


## GSubprocess

In contrast to the spawn functions available in GLib, `Gio.Subprocess` is both
simpler to use and safer for language bindings. It is just as powerful, does all
the cleanup you'd have to do yourself and is far more convenient for most use
cases.

### Basic Usage

The simplest usage of `Gio.Subprocess` amounts to creating a new initialized
object. Once this function returns without error, the process will have started.

```js
'use strict';

const Gio = imports.gi.Gio;

try {
    // The process starts running immediately after this function is called. Any
    // error thrown here will be a result of the process failing to start, not
    // the success or failure of the process itself.
    let proc = Gio.Subprocess.new(
        // The program and command options are passed as a list of arguments
        ['ls', '-l', '/'],
        
        // The flags control what I/O pipes are opened and how they are directed
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    
    // Once the process has started, you can end it with `force_exit()`
    proc.force_exit();
} catch (e) {
    logError(e);
}
```

[initable]: https://gjs-docs.gnome.org/gio20/gio.initable

### Waiting for Processes

If you simply need to wait until a process completes before performing another
operation, the best choice is `Gio.Subprocess.wait_async()`. This will allow you
to maintain a sequence of operations without blocking the main loop:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


let loop = GLib.MainLoop.new(null, false);

try {
    let proc = Gio.Subprocess.new(['sleep', '10'], Gio.SubprocessFlags.NONE);
    
    // NOTE: triggering the cancellable passed to these functions will only
    //       cancel the function NOT the process.
    let cancellable = new Gio.Cancellable();
    
    proc.wait_async(cancellable, (proc, result) => {
        try {
            // Strictly speaking, the only error that can be thrown by this
            // function is Gio.IOErrorEnum.CANCELLED.
            proc.wait_finish(result);
            
            // The process has completed and you can check the exit status or
            // ignore it if you just need notification the process completed.
            if (proc.get_successful()) {
                log('the process succeeded');
            } else {
                log('the process failed');
            }
        } catch (e) {
            logError(e);
        } finally {
            loop.quit();
        }
    });
} catch (e) {
    logError(e);
}

loop.run();
```

`Gio.Subprocess.wait_check_async()` is a convenience function for calling
`Gio.Subprocess.wait_async()` and then `Gio.Subprocess.get_successful()` in the
callback:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


let loop = GLib.MainLoop.new(null, false);

try {
    let proc = Gio.Subprocess.new(['sleep', '10'], Gio.SubprocessFlags.NONE);
    
    proc.wait_check_async(null, (proc, result) => {
        try {
            if (proc.wait_check_finish(result)) {
                log('the process succeeded');
            } else {
                log('the process failed');
            }
        } catch (e) {
            logError(e);
        } finally {
            loop.quit();
        }
    });
} catch (e) {
    logError(e);
}

loop.run();
```

[wait_check]: https://gjs-docs.gnome.org/gio20/gio.subprocess#method-wait_check

### Communicating with Processes

For single run processes with text output, the most convenient function is
[`Gio.Subprocess.communicate_utf8()`][communicate_utf8]. If the output of the
process is not text or you just want the output in `GLib.Bytes`, you can use
[`Gio.Subprocess.communicate()`][communicate] instead.

These two functions take (optional) input to pass to `stdin` and collect all the
output from `stdout` and `stderr`. Once the process completes the output is
returned.

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
        } finally {        
            loop.quit();
        }
    });
} catch (e) {
    logError(e);
}

loop.run();
```

For processes that continue to run in the background, you can queue a callback
for when the process completes while reading output and writing input as the
process runs.

Below is a contrived example using a simple shell script to read lines from
`stdin` and write them back to `stdout`:

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


let loop = GLib.MainLoop.new(null, false);

// This is the process that we'll be running
let script = `
echo "BEGIN";

while read line; do
  echo "$line";
  sleep 1;
done;
`;


// This function simply writes the current time to `stdin`
function writeInput(stdin) {
    let date = new Date().toLocaleString();

    stdin.write_bytes_async(
        new GLib.Bytes(`${date}\n`),
        GLib.PRIORITY_DEFAULT,
        null,
        (stdin, res) => {
            try {
                stdin.write_bytes_finish(res);
                log(`WROTE: ${date}`)
            } catch (e) {
                logError(e);
            }
        }
    );
}

// This function reads a line from `stdout`, then queues another read/write
function readOutput(stdout, stdin) {
    stdout.read_line_async(GLib.PRIORITY_LOW, null, (stdout, res) => {
        try {
            let line = stdout.read_line_finish_utf8(res)[0];

            if (line !== null) {
                log(`READ: ${line}`);
                writeInput(stdin);
                readOutput(stdout, stdin);
            }
        } catch (e) {
            logError(e);
        }
    });
}

try {
    let proc = Gio.Subprocess.new(
        ['bash', '-c', script],
        (Gio.SubprocessFlags.STDIN_PIPE |
         Gio.SubprocessFlags.STDOUT_PIPE)
    );

    // Watch for the process to exit, like normal
    proc.wait_async(null, (proc, res) => {
        try {
            proc.wait_finish(res);
        } catch (e) {
            logError(e);
        } finally {
            loop.quit();
        }
    });

    // Get the `stdin`and `stdout` pipes, wrapping `stdout` to make it easier to
    // read lines of text
    let stdinStream = proc.get_stdin_pipe();
    let stdoutStream = new Gio.DataInputStream({
        base_stream: proc.get_stdout_pipe(),
        close_base_stream: true
    });

    // Start the loop
    readOutput(stdoutStream, stdinStream);
} catch (e) {
    logError(e);
}

loop.run();
```

[communicate]: https://gjs-docs.gnome.org/gio20/gio.subprocess#method-communicate
[communicate_utf8]: https://gjs-docs.gnome.org/gio20/gio.subprocess#method-communicate_utf8

### Extra Tips

There are a few extra tricks you can use when working with `Gio.Subprocess`.

#### Cancellable Processes

`Gio.Subprocess` implements the [`Gio.Initable`][initable] interface, which
allows for failable initialization. You may find passing cancellable useful if
you want to prevent the process from starting if already cancelled or connecting
to it to call [`Gio.Subprocess.force_exit()`][force_exit] if triggered later: 

```js
function execCancellable(argv, flags = 0, cancellable = null) {
    // Create the process object with `new` and pass the arguments and flags as
    // constructor properties. The process will start when `init()` returns,
    // unless an error is thrown.
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: flags
    });
    
    // If the cancellable has already been triggered, the call to `init()` will
    // throw an error and the process will not be started.
    proc.init(cancellable);
    
    // Chaining to the cancellable allows you to easily kill the process. You
    // could use the same cancellabe for other related tasks allowing you to
    // cancel them all without tracking them separately.
    //
    // NOTE: this is NOT the standard GObject.connect() function, so you should
    //       consult the documentation if the usage seems odd here.
    let cancelId = 0;
    
    if (cancellable instanceof Gio.Cancellable) {
        cancelId = cancellable.connect(() => proc.force_exit());
    }
    
    return proc;
}
```

#### Command Line Parsing

If you happen to have the command line as a single string, you can use the
[`GLib.shell_parse_argv()`][shell_parse_argv] function to parse it as a list of
strings to pass to `Gio.Subprocess`. This function can handle most common shell
quoting, but may fail on some more complex usage.

```js
// This function may throw an error
try {
    // Returns: ['ls', '-l', '/']
    let argv1 = GLib.shell_parse_argv('ls -l /')[1];
    
    // Returns: ['ls', '-l', '/dir with spaces']
    let argv2 = GLib.shell_parse_argv('ls -l "/dir with spaces"')[1];
} catch (e) {
    logError(e);
}
```

[shell_parse_argv]: https://gjs-docs.gnome.org/glib20/glib.shell_parse_argv

#### Error handling

The error codes returned by `Gio.Subprocess.get_exit_status()` are not the
typical errors return by Gio functions. They can translated with the function
[`Gio.io_error_from_errno()`][io_error_from_errno] and augmented with output
from `stderr` or [`GLib.strerror()`][strerror] if that's not available:

```js
proc.communicate_utf8_async(null, null, (proc, res) => {
    try {
        let [, stdout, stderr] = proc.communicate_utf8_finish(res);
        let status = proc.get_exit_status();

        if (status !== 0) {
            throw new Gio.IOErrorEnum({
                code: Gio.io_error_from_errno(status),
                message: stderr ? stderr.trim() : GLib.strerror(status)
            });
        }
        
        log(`SUCCESS: ${stdout.trim()}`);
    } catch (e) {
        logError(e);
    }
});
```

[io_error_from_errno]: https://gjs-docs.gnome.org/gio20/gio.io_error_from_errno
[strerror]: https://gjs-docs.gnome.org/glib20/glib.strerror

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

[gsubprocesslauncher]: https://gjs-docs.gnome.org/gio20/gio.subprocesslauncher
[force_exit]: https://gjs-docs.gnome.org/gio20/gio.subprocess#method-force_exit


## Complete Examples

Below is a few more complete, Promise-wrapped functions you can use in your
code. The advantages here over `GLib.spawn_command_line_async()` are checking
the process actually completes successfully, the ability to stop it at any time,
and notification when it does or improved errors when it doesn't.

```js
'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;


/**
 * Execute a command asynchronously and check the exit status.
 *
 * If given, @cancellable can be used to stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {Gio.Cancellable} [cancellable] - optional cancellable object
 * @returns {Promise<boolean>} - The process success
 */
function execCheck(argv, cancellable = null) {
    let cancelId = 0;
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: Gio.SubprocessFlags.NONE
    });
    proc.init(cancellable);

    if (cancellable instanceof Gio.Cancellable) {
        cancelId = cancellable.connect(() => proc.force_exit());
    }

    return new Promise((resolve, reject) => {
        proc.wait_check_async(null, (proc, res) => {
            try {
                if (!proc.wait_check_finish(res)) {
                    let status = proc.get_exit_status();

                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(status),
                        message: GLib.strerror(status)
                    });
                }

                resolve();
            } catch (e) {
                reject(e);
            } finally {
                if (cancelId > 0) {
                    cancellable.disconnect(cancelId);
                }
            }
        });
    });
}


/**
 * Execute a command asynchronously and return the output from `stdout` on
 * success or throw an error with output from `stderr` on failure.
 *
 * If given, @input will be passed to `stdin` and @cancellable can be used to
 * stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {string} [input] - Input to write to `stdin` or %null to ignore
 * @param {Gio.Cancellable} [cancellable] - optional cancellable object
 * @returns {Promise<string>} - The process output
 */
function execCommunicate(argv, input = null, cancellable = null) {
    let cancelId = 0;
    let flags = (Gio.SubprocessFlags.STDOUT_PIPE |
                 Gio.SubprocessFlags.STDERR_PIPE);

    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    let proc = new Gio.Subprocess({
        argv: argv,
        flags: flags
    });
    proc.init(cancellable);
    
    if (cancellable instanceof Gio.Cancellable) {
        cancelId = cancellable.connect(() => proc.force_exit());
    }

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(input, null, (proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                let status = proc.get_exit_status();

                if (status !== 0) {
                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(status),
                        message: stderr ? stderr.trim() : GLib.strerror(status)
                    });
                }

                resolve(stdout.trim());
            } catch (e) {
                reject(e);
            } finally {
                if (cancelId > 0) {
                    cancellable.disconnect(cancelId);
                }
            }
        });
    });
}
```

