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

<section style="margin-bottom: 2em">
{% for tag in tags %}
<a href="#{{ tag | slugify }}" class="tag">{{ tag }}</a>
{% endfor %}
</section>

<section class="section-listing">
{% for tag in tags %}
  <section class="tag-group">
    <h2>{{ tag }}</h2>
    {% for item in items %}
      {% if item.tags contains tag %}
      <article class="tag-entry">
        <h3><a href="{{ item.url }}">{{ item.title }}</a></h3>
        <time datetime="{{ item.date }}">{{ item.date | date: "%b %d, %Y" }}</time>
        {% for tag in item.tags %}
        <a href="/tags#{{ tag | slugify }}" class="tag">{{ tag }}</a>
        {% endfor %}
      </article>
      {% endif %}
    {% endfor %}
  </section>
{% endfor %}
</section>
