# Requirements and tips for getting your GNOME Shell Extension approved

This document briefly describes requirements and tips for getting your extension
approved during review.

## Requirements

GNOME Shell extensions are patches applied during runtime that can affect the
stability and security of the desktop. These requirements must be followed in
order for your extension to be approved for distribution on extension.gnome.org.
Failure to meet these requirements will result in your extension being rejected.

### Don’t do anything major in `init()`

`init()` is called by the extension subsystem when your extension is loaded by
GNOME Shell, not when it is enabled. Your extension **MUST NOT** create any
objects, connect any signals or modify any aspect of GNOME Shell here.

These rules also apply to code in the top-level of any JavaScript files or
imports in your extension. Code not in a function or object will be executed
when your extension is loaded and therefore can not be reverted later.

**Do...**

* Setup gettext translations
* Register GResources
* Store functions and methods you plan on overriding

**Don't...**

* Connect any signals
* Bind any properties
* Override any functions
* Create any objects
* Create any GSources such as with `GLib.timeout_add()` or `GLib.idle_add()`


### Undo all modifications in `disable()`

`disable()` is called in number of situations such as when a user logs out, the
screen lock engages, an extension is uninstalled or updated, or when disabled
manually by a user.

Failing to revert changes, such as removing UI elements created in `enable()`,
can cause them to remain on the login and lock screen resulting in a security
risk for the user.

**Do...**

* Disconnect all signals
* Unbind all properties
* Destroy all objects created in `enable()`
* Destroy all GSources, such as those created with `GLib.timeout_add()`

**Don't...**

* Simply hide UI elements instead of destroying them
* Leave any Mainloop sources running which may call back to destroyed objects


### External Scripts and Binaries

Use of external scripts and binaries is strongly discouraged. In cases where
this is unavoidable for the extension to serve it's purpose, the following rules
must be adhered to:

* No binary applications or libraries may be included an extension
* Scripts must be short, simple and GPLv2+
* Processes must be spawned carefully and exit cleanly


### Licensing

During the submission process, you are asked to confirm that your extension can
be distributed under the terms of the GPLv2+. If your extension includes headers
or a `LICENSE` file containing another license, such as BSD/MIT, you approving
GNOME to distribute your extension under a dual-license.

If you would like to make your code available under more than one license,
please explicitly dual-license your code.


## Tips

GNOME Shell extensions are reviewed carefully for malicious code, malware and
security risks, but are not reviewed for bugs or issues. The following sections
are tips for common problem areas and getting your reviewed quicker. 


### Don't `Reject` your own extension

Please do not mark your own extension as `Rejected`. Marking an extension as
rejected interferes with the workflow used by reviewers to compare differences
between submissions.

If there is a critical bug or mistake you have fixed in a newer submission, or
plan to correct soon, simply add a comment to the review stating this.


### Be cautious with `GSettings`

Programmer errors with `GSettings` are fatal in all languages and will cause a
GLib application to exit. Since the code in your extension code is executed in
the `gnome-shell` process, a fatal error will cause GNOME Shell to crash.

An easy way to create this problem is by relying on the existence of system
schemas or keys which may not exist for every user. If the error is caused as a
result of your extension being loaded or enabled, this can leave an user unable
to log in, disable the extension or even ask for help.

* Test your usage of GSettings and avoid unsanitized user input
* Avoid interacting with system schemas or confirm settings schemas are a part
  of the core GNOME desktop
* Use `Gio.SettingsSchemaSource.lookup()`, `Gio.SettingsSchemaSource.has_key()`
  and other relevant functions to when you need dynamic behaviour


## Use consistent code style

Using consistent indentation and code style will make reviewing your extension
easier and get your extension approved sooner.

By convention, most GNOME Shell extensions use the same code style used by GNOME
Shell itself (see [GNOME Shell's source][shell-js] for thorough exampless). If
you choose a slightly different style, please be consistent.

[shell-js]: https://gitlab.gnome.org/GNOME/gnome-shell/blob/master/js/ui/

