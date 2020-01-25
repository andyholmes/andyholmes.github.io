---
layout: default
title: Home
---

<p>
Here I plan on sharing code and any other computer related files like SPICE,
configuration files, and other things. I hope you find some of it useful.
</p>

<h2>Articles</h2>

<ul>
  {% for article in site.articles %}
    <li>
      <h3><a href="{{ article.url }}">{{ article.title }}</a></h3>
      <p>{{ article.description }}</p>
    </li>
  {% endfor %}
</ul>
