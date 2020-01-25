---
layout: default
title: Home
---

<p>
Here I plan on sharing code and any other computer related files like SPICE,
configuration files, and other things. I hope you find some of it useful.
</p>

<h1>Articles</h1>

<ul>
  {% for post in site.posts %}
    <li>
      <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
      <p>{{ post.excerpt }}</p>
    </li>
  {% endfor %}
</ul>
