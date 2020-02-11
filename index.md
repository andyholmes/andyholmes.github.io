---
layout: default
title: Home
---

<p>
Here I plan on sharing code and any other computer related files like SPICE,
configuration files, and other things. I hope you find some of it useful.
</p>

<section class="section-listing">
  <h2>Latest Articles</h2>

  {% assign articles = site.articles | sort: "date" | reverse %}
  
  {% for item in articles limit:5 %}
    <article>
      <h3><a href="{{ item.url }}">{{ item.title }}</a></h3>
      <time datetime="{{ item.date }}">{{ item.date | date: "%b %d, %Y" }}</time>
      <p>{{ item.description }}</p>
    </article>
  {% endfor %}
  
  {% if articles.size > 5 %}
    <a href="/articles">More&hellip;</a>
  {% endif %}
</section>
