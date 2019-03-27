# Requirements and tips for getting your GNOME Shell Extension approved

...

## Don’t do anything major in `init()`

`init()` is called by the extension subsystem **once** when your extension is
loaded (not enabled) by GNOME Shell. Your extension **MUST NOT** create any
objects or modify any aspect of GNOME Shell here.

**Do...**

* Setup gettext translations
* Register GResources
* Store functions and methods you plan on overriding

**Don't...**

* Connect any signals
* Bind any properties
* Override any functions
* Create any GSources such as with `GLib.timeout_add()` or `GLib.idle_add()`


## Undo all modifications in `disable()`

`disable()` is called in number of situations such as when a user logs out, the
screen lock engages, an extension is uninstalled or updated, or when disabled
manually by a user.

Failing to revert changes, such as removing UI elements created in `enable()`,
can cause them to remain on the login and lock screen resulting in a security
risk for the user.

**Do...**

* Destroy and remove all UI elements created in `enable()`
* Disconnect all signals and unbind all properties
* Destroy all GSources, such as those created with `GLib.timeout_add()`

**Don't...**

* Simply hide UI elements instead of destroying them
* Leave any Mainloop sources running which may call back to destroyed objects


## Licensing

During the submission process, you are asked to confirm that your extension is
licensed under GPLv2+. Extensions available on extensions.gnome.org *are*
distributed under the terms of the GPLv2+.

Some extensions seem to be including headers or `LICENSE` files containing an
MIT/BSD license. As the author you may license your code however you choose, but
be aware that by submitting your extension you are authorizing GNOME to
distribute it under the terms of the GPLv2+ and thus implicitly dual-licensing.

If you would like to make your code available under more than one license, it
would much better to *explicitly* dual-license your code.


## Be cautious with `GSettings`

Programmer errors with `GSettings` are fatal in all languages and will cause a
GLib application to exit. Since your extension is run within the `gnome-shell`
process, a fatal error will cause GNOME Shell to crash.

An easy way to create this problem is by relying on the existence of system
schemas or keys which may not exist for every user. An example could be an extra
setting added by a downstream distribution, such as Ubuntu, which is not present
in GNOME as distributed by Arch or Fedora.

If the error is caused as a result of your extension being loaded or enabled,
this can leave an inexperienced user unable to log in, disable the extension or
even ask for help.


## Don't `Reject` your own extension

Please do not mark your own extension as `Rejected`. Marking an extension as
rejected interferes with the workflow used by reviewers to compare differences
between submissions.

If there is a critical bug or mistake you have fixed in a newer submission, or
plan to correct soon, simply add a comment to the review stating this.


## Use consistent code style

Using consistent indentation and code style will make reviewing your extension
easier and get your extension approved sooner.

By convention, most GNOME Shell extensions use the same code style used by GNOME
Shell itself (see [popupMenu.js][popupMenu-js] for a thorough example). If you
choose a slightly different style, please be consistent.

[popupMenu-js]: https://gitlab.gnome.org/GNOME/gnome-shell/blob/master/js/ui/popupMenu.js

