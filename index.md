---
layout: default
title: Home
---

<section class="section-listing">
  <h2>Latest</h2>

  {% assign articles = site.articles | sort: "date" | reverse %}
  
  {% for item in articles limit:5 %}
  {% include summary.html %}
  {% endfor %}
  
  {% if articles.size > 5 %}
    <a href="/articles">More&hellip;</a>
  {% endif %}
</section>
