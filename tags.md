---
layout: default
title: Tags
---

{% comment %}
Extract and sort all tags from articles/posts, then remove duplicates
{% endcomment %}

{% assign all = site.articles | concat: site.posts %}
{% assign items = all | sort: "date" | reverse %}

{% assign rawtags = "" %}
{% for post in all %}
  {% assign ttags = post.tags | join:'|' | append:'|' %}
  {% assign rawtags = rawtags | append:ttags %}
{% endfor %}
{% assign rawtags = rawtags | split:'|' | sort %}

{% assign tags = "" %}
{% for tag in rawtags %}
  {% if tag != "" %}
    {% if tags == "" %}
      {% assign tags = tag | split:'|' %}
    {% endif %}
    {% unless tags contains tag %}
      {% assign tags = tags | join:'|' | append:'|' | append:tag | split:'|' %}
    {% endunless %}
  {% endif %}
{% endfor %}

<h1>Tags</h1>

<p>
{% for tag in tags %}
<a href="#{{ tag | slugify }}" class="tag">{{ tag }}</a>
{% endfor %}
</p>


<section class="section-listing">
{% for tag in tags %}
  <section>
    <h2>{{ tag }}</h2>
    {% for item in items %}
      {% if item.tags contains tag %}
      {% include summary.html short=true %}
      {% endif %}
    {% endfor %}
  </section>
{% endfor %}
</section>
