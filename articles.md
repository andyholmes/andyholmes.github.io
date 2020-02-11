---
layout: default
title: Articles
---

<section class="section-listing">
  <h2>Articles</h2>

  {% for article in site.articles %}
    <article>
      <h3><a href="{{ article.url }}">{{ article.title }}</a></h3>
      <p>{{ article.description }}</p>
    </article>
  {% endfor %}
</section>
