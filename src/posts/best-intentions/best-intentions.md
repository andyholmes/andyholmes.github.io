---
title: Best Intentions
date: 2024-08-19T16:32:00.000-07:00
tags:
  - gnome
  - xdg
  - stf
---

This is going to be a bit of a sporadic blog post covering XDG Intents, GSoC
and few other updates from GNOME goings on.

## XDG Intents

Most end-user platforms have something they call an intent system or something
approximating the idea. Implementations vary somewhat, but these often amount
to a high-level desktop or application action coupled to a URI or mime-type.
There examples of fancy URIs like `sms:555-1234?body=on%20my%20way` that can do
intent-like things, but intents are higher-level, more purposeful and certainly
not restricted to metadata shoehorned into a URI.

I'm going to approach this like [the original proposal] by David Faure and the
discussions that followed, by contrasting it with mime-types and then
demonstrating what the files for some real-world use cases might look like.

[the original proposal]: https://gitlab.freedesktop.org/xdg/xdg-specs/-/merge_requests/45

### The Landscape

Let's start with the [mime-apps Specification]. For desktop environments
mime-types are, most of all, useful for associating content with applications
that can consume it. Once you can do that, the very next thing you want is
defaults and fallback priorities. Now can you double-click stuff to have your
favourite application open it, or right-click to open it with another of your
choice. Hooray.

We've also done something kind of clever, by supporting URI handlers with the
special `x-scheme-handler/*` mime-type. It is clever, it does work and it was
good enough for a long time. It's not very impressive when you see what other
platforms are doing with URIs, though.

Moving on to the [`Implements` key] in the Desktop Entry Specification, where
applications can define "interfaces" they support. A `.desktop` file for an
application that supports a search interface might look like this:

```ini
[Desktop Entry]
Name=Contacts
Icon=org.gnome.Contacts
Exec=gnome-contacts %U
Terminal=false
Type=Application
DBusActivatable=true
Implements=org.gnome.Shell.SearchProvider2
```

The last line is a list of interfaces, which in this case is the D-Bus interface
used for the overview search in GNOME Shell. In the case of the
`org.freedesktop.FileManager1` interface we could infer a default from the
preferred `inode/directory` mime-type handler, but there is no support for
defining a default or fallback priority for these interfaces.

While researching URI handlers as part of the work funded by the STF, Sonny
reached out to a number developers, including Sebastian Wick, who has been
helping to push forward sandboxing thumbnailers. The proposed intent-apps
Specification turns out to be a sensible way to frame URI handlers, and other
interfaces have requirements that make it an even better choice.

[mime-apps Specification]: https://www.freedesktop.org/wiki/Specifications/mime-apps-spec/
[`Implements` key]: https://specifications.freedesktop.org/desktop-entry-spec/latest/interfaces.html

### Terminal Itchiness

In community-driven software, we've operated on a scratch-an-itch priority
model for a very long time. At this point we have several, arguably critical,
use cases for an intent system. Some known use cases include:

* Default Terminal

   This one should be pretty well known and a good example of when you might
   need an intent system. Terminals aren't really associated with anything, let
   alone a mime-type or URI scheme, so we've all been hard-coding defaults for
   decades now. See the proposed [terminal-intent Specification] for details.

* Thumbnailers

   If C/C++ are the languages responsible for most vulnerabilities, thumbnailers
   have to be high on the list of application code to blame. Intents will allow
   using or providing thumbnailing services from a sandboxed application.

* URI Handler

   This intent is probably of interest to the widest range of developers, since
   it allows a lot freedom for independent applications and provides assurances
   relied on by everything from authentication flows to personal banking apps.

Below is a hypothetical example of how an application might declare it can
handle particular URIs:

```ini
[Desktop Entry]
Name=Wise
Icon=com.wise.WiseLinux
Exec=wise %U
Terminal=false
Type=Application
DBusActivatable=true
Implements=org.freedesktop.UriHandler

[org.freedesktop.UriHandler]
Supports=wise.com;
Patterns=https://*.wise.com/link?urn=urn%3Awise%3Atransfers;
```

While the Desktop Entry specification states that interfaces can have a named
group like above, there are no standardized keys shared by all interfaces. The
`Supports` key proposed by Sebastian is important for both thumbnailers and URI
handlers. Unlike a Terminal which lacks any association with data, these need
the ability to express additional constraints.

So the proposal is to have the existing `Implements` key work in tandem with
the `intentapps.list` (similar to the `MimeType` key and `mimeapps.list`), while
the `Supports` key allows interfaces to define their own criteria for defaults
and fallbacks. Below is a hypothetical example of a thumbnailer's `.desktop`
file:

```ini
[Desktop Entry]
Name=Image Viewer
Icon=org.gnome.Loupe
Exec=loupe %U
Terminal=false
Type=Application
MimeType=image/jpeg;image/png;image/gif;image/webp;image/tiff
DBusActivatable=true
Implements=org.freedesktop.Thumbnailer

[org.freedesktop.Thumbnailer]
Supports=image/jpeg;image/png;image/gif;image/svg+xml;image/tiff
```

The `Supports` key will always be a list of strings, but the values themselves
are entirely up to the interface to define. To the intent system, these are
simply opaque tags with no implicit ordering. In the URI handler we may want
this to be a top-level domain to prevent things like link hijacking, while
thumbnailers want to advertise which mime-types they can process.

In the `intentapps.list` below, we're demonstrating how one could insist that a
particular format, like sketchy SVGs, are handled by [Loupe]:

```ini
[Default Applications]
org.freedesktop.Thumbnailer=org.gimp.GIMP
org.freedesktop.Thumbnailer[image/svg+xml]=org.gnome.Loupe;org.gimp.GIMP
```

We're in a time when Linux users need to do things like pass an untrusted file
attachment, from an unknown contact, to a thumbnailer maintained by an
indepedent developer. So while the intent-apps Specification itself is
superficially quite simple, if we get this right it can open up a lot of
possibilities and plug a lot of security holes.

[terminal-intent Specification]: https://gitlab.freedesktop.org/xdg/xdg-specs/-/merge_requests/46
[Loupe]: https://apps.gnome.org/Loupe/

### Put this in your backpack, mine's full

First a bit of context for the GLib project, which is comprised of three main
parts: GLib, GObject and GIO. GLib contains things you'd generally get from a
standard library, GObject defines the OOP semantics (methods/properties/signals,
inheritance, etc), and GIO provides reasonably high-level APIs for everything
from sockets and files to D-Bus and `Gio.DesktopAppInfo`.

The GLib project as a whole contains a substantial amount of the XDG
implementations for the GLib/GTK-lineage of desktop environments. It also
happens to be the layer we implement a lot of our cross-platform support, from
OS-level facilities like process spawning on Windows to desktop subsystems like
sending notifications on macOS.

<figure>
  <img src="maintainers.jpg" alt="A scene from Lord of the Rings, wherein Gandalf shouts, 'You shall not pass!'"/>
  <figcaption>Fig. 1. A GLib Maintainer</figcaption>
</figure>

The [merge request I drafted] for the initial implementation received what
might look like Push Back, but this should really be interpreted as a Speed
Bump. GLib goes a lot of places, including Windows and macOS, thus we need
maintainers to make prudent decisions that allow us to take calculated risks
higher in the stack. It may also be a sign that GLib is no longer the first
place we should be looking to carry XDG implementations.

Something that **you** may be able to help with, is impedance-matching our
implementation of the intent-apps Specification with its counterparts in the
Apple and Microsoft platforms. Documentation is available (in varying quality),
but hands-on experience would be a great benefit.

[merge request I drafted]: https://gitlab.gnome.org/GNOME/glib/-/merge_requests/4119

## Workbench and GSoC

Last year, I was invited by Sonny Piers to co-mentor for both Google Summer
of Code and Outreachy, which was really one the best times I've had in the
community. He also invited a couple of us Workbenchers from that period to
the kick-off meeting for this year's projects.

Recently, he asked if I could step in and help out with this year's programs.
This is a very unfortunate set of circumstances to arise during an internship
program, but regardless, I'm both honored and thrilled.

I think there's good chance you've run into one of our mentees this year,
Shem Angelo Verlain (aka vixalien). He's been actively engaging in the GJS
community for some time and contributing to better support for TypeScript,
including his application [Decibels] which is in incubation to become a part of
GNOME Core. His project to bootstrap TypeScript support in Workbench is going
to play an important role in its adoption by our community.

Our other mentee, Bharat Atbrat, has a familiar origin story. It started as an
innocent attempt to fix a GNOME Shell extension, turned into a merge request
for GNOME Settings, rolled over into porting Workbench demos to Vala and it's
at this point one admits to oneself they've been nerd-sniped. Since then, Bharat
has been porting more demos to Vala and working on an indexed code search for
the demos. As a bonus, we will get a [GOM] demo that's being used to prototype
and test searching capabilities.

[Decibels]: https://apps.gnome.org/Decibels
[GOM]: https://gitlab.gnome.org/GNOME/gom


## GNOME Online Accounts

The release notes are not yet finalized for GNOME 47, but there are few
highlights worth mentioning.

There have been several improvements to the periodic credential checks, fixing
several false positives and now notifying when an account needs to be
re-authenticated. The notification policy in GNOME 47.beta turned out overly
aggressive, so it has been amended to ensure you are notified at most once per
account, per session.

<figure>
  <img src="goa-notifications.png" alt="A screengrab of Commander Ransom from 'Star Trek: Lower Decks, Strange Energies', where he turns into a god-like tilt-a-whirl, spraying rainbows everywhere."/>
  <figcaption>Fig. 2. Entirely Reasonable Notification Policy</figcaption>
</figure>

For Kerberos users, there is rarely any exciting news, however after
resurrecting a [merge request by Rishi] (a previous maintainer) and some help,
we now support Linux's [general notification mechanism] as a very efficient
alternative to the default credential polling. If you're using your Kerberos or
Fedora account on a laptop or GNOME Mobile, this may improve your battery life
noticeably.

The support for [Mail Autoconfig] and improved handling of app passwords for
WebDAV accounts will ship in GNOME 47. The DAV discovery and Mail Autoconfig
will form the base of the [collection provider], but this won't ship until
GNOME 48. Aside from time constraints, this will allow a cycle to shake out
bugs while the existing pieces are stitched together.

The Microsoft 365 provider has enabled support for email, calendar and
contacts, thanks to more work by Jan Michael-Brummer and Milan Crha. This
is available in [GNOME OS Nightly] now, so it's great time to get in some
early testing. We've made progress on verifying our application to supports more
organizational accounts and, although this is not constrained by our release
schedule, I expect it to be resolved by GNOME 47.

[merge request by Rishi]: https://gitlab.gnome.org/GNOME/gnome-online-accounts/-/merge_requests/47
[general notification mechanism]: https://docs.kernel.org/core-api/watch_queue.html
[Mail Autoconfig]: https://datatracker.ietf.org/doc/draft-bucksch-autoconfig/
[collection provider]: ../gnome-46-and-beyond/#webdav
[GNOME OS Nightly]: https://os.gnome.org

## Acknowledgements

Many thanks again to the [Sovereign Tech Fund] and everyone who helped make it
possible. I would also like to express my appreciation to everyone who helps me
catch up on the historical context of the various XDG and GLib facilities. Even
when documentation exists, it can be extremely arduous to put the picture
together by yourself.

<figure>
  <img src="kitten.png" alt="A kitten, sleeping sweetly on its back."/>
  <figcaption>Fig. 3. Ideal Psychological and Emotional State</figcaption>
</figure>

Until next time, stay sweet.

[Sovereign Tech Fund]: https://www.sprind.org/en/projects/sovereign-tech-fund/

