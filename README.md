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
  {% for article in site.articles %}
    <li>
      <h2><a href="{{ article.url }}">{{ article.title }}</a></h2>
      <p>{{ article.excerpt }}</p>
    </li>
  {% endfor %}
</ul>
