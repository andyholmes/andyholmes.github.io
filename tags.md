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

<h2>Tags</h2>

<p>
{% for tag in tags %}
<a href="#{{ tag | slugify }}" class="tag">{{ tag }}</a>
{% endfor %}
</p>


<section class="section-listing">
{% for tag in tags %}
  <section>
    <h3>{{ tag }}</h3>
    {% for post in items %}
      {% if post.tags contains tag %}
    <article>
      <h4><a href="{{ post.url }}">{{ post.title }}</a></h4>
      <time datetime="{{ post.date }}">{{ post.date | date: "%b %d, %Y" }}</time>
      {% for tag in post.tags %}
        <a href="/tags/#{{ tag | slugify }}" class="tag" style="float:right">{{ tag }}</a>
      {% endfor %}
    </article>
      {% include summary.html short=true %}
      {% endif %}
    {% endfor %}
  </section>
{% endfor %}
</section>
